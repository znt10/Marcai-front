import { NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { normalizar } from '@/lib/telefone';
import { numeroExiste, enviarTexto } from '@/lib/whatsapp';
import { msgConfirmacao } from '@/lib/mensagens';
import { utcParaLocal } from '@/lib/datas';

// Sem 0/O e 1/l/I — código é lido em voz alta e digitado à mão.
const gerarCodigo = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 10);

const Corpo = z.object({
  barbeiroId: z.uuid(),
  servicoId: z.uuid(),
  inicio: z.iso.datetime(),
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string(),
});

class ErroCliente extends Error {
  constructor(public status: number, public mensagem: string) { super(mensagem); }
}

/// 23P01 = exclusion_violation, disparado por `agendamento_sem_sobreposicao`.
/// NÃO é 23505 (unique_violation): a garantia é uma restrição de EXCLUSÃO
/// sobre intervalos (§5.4).
///
/// O código vem embrulhado em camadas diferentes conforme o driver adapter
/// repassa o erro do Postgres, então procuramos em todas em vez de fixar um
/// caminho que uma atualização de dependência quebraria em silêncio — e o
/// silêncio aqui seria um 500 no lugar de um 409.
function ehSobreposicao(e: unknown): boolean {
  for (let atual: unknown = e, i = 0; atual && i < 5; i++) {
    const o = atual as { code?: unknown; meta?: { code?: unknown }; cause?: unknown };
    if (o.code === '23P01' || o.meta?.code === '23P01') return true;
    atual = o.cause;
  }
  return String((e as { message?: string })?.message ?? '')
    .includes('agendamento_sem_sobreposicao');
}

export async function POST(req: Request) {
  const barbearia = await barbeariaDaRequisicao(req);

  const bruto = await req.json().catch(() => null);
  const parse = Corpo.safeParse(bruto);
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche nome e WhatsApp pra gente.' }, { status: 422 });
  }
  const { barbeiroId, servicoId, inicio: inicioIso, nome } = parse.data;

  const whatsapp = normalizar(parse.data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json(
      { erro: 'Confere o WhatsApp — parece faltar dígito.' }, { status: 422 });
  }

  // Chamada de rede ANTES da transação: não segurar conexão de banco
  // esperando API externa.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido';
  if (await numeroExiste(whatsapp, ip) === 'nao_existe') {
    return NextResponse.json(
      { erro: 'Esse número não tem WhatsApp. Confere pra gente?' }, { status: 422 });
  }

  const inicio = new Date(inicioIso);
  const agora = new Date();

  try {
    const criado = await comBarbearia(barbearia.id, async (tx) => {
      const vinculo = await tx.barbeiroServico.findUnique({
        where: { barbeiroId_servicoId: { barbeiroId, servicoId } },
        include: { servico: { select: { nome: true, ativo: true } } },
      });
      if (!vinculo || !vinculo.ativo || !vinculo.servico.ativo) {
        throw new ErroCliente(422, 'Esse barbeiro não faz esse serviço.');
      }

      // A duração vem do banco. O que veio no corpo é sugestão de atacante.
      const duracaoMin = vinculo.duracaoMin;
      const fim = new Date(inicio.getTime() + duracaoMin * 60_000);

      // Conferido à parte do slot livre porque a resposta é outra: horário
      // que passou é erro do pedido (422); horário tomado é conflito (409),
      // e a tela reage a cada um de um jeito.
      if (inicio <= agora) {
        throw new ErroCliente(422, 'Esse horário já passou.');
      }

      const { dia } = utcParaLocal(inicio);
      const livres = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, dia, agora);
      if (!livres.some((s) => s.inicio.getTime() === inicio.getTime())) {
        // 409, mesmo status da restrição de exclusão logo abaixo: esta
        // checagem pega o caso sequencial, a restrição pega a corrida real
        // entre duas transações que leram antes de qualquer uma gravar.
        throw new ErroCliente(409, 'Esse horário não está mais disponível.');
      }

      const cliente = await tx.cliente.upsert({
        where: { barbeariaId_whatsapp: { barbeariaId: barbearia.id, whatsapp } },
        create: { barbeariaId: barbearia.id, nome, whatsapp },
        update: { nome },
      });

      return tx.agendamento.create({
        data: {
          barbeariaId: barbearia.id, codigo: gerarCodigo(),
          barbeiroId, clienteId: cliente.id, servicoId,
          servicoNome: vinculo.servico.nome,
          inicio, fim, duracaoMin, status: 'CONFIRMADO',
        },
        include: { barbeiro: { select: { nome: true } } },
      });
    });

    // Fire-and-forget, DEPOIS do commit. Falha aqui não desfaz nada.
    const link = `${req.headers.get('origin') ?? ''}/agendamento/${criado.codigo}`;
    void enviarTexto(whatsapp, msgConfirmacao({
      clienteNome: nome, barbeiroNome: criado.barbeiro.nome,
      servicoNome: criado.servicoNome, inicio: criado.inicio,
      endereco: barbearia.endereco, link,
    }));

    return NextResponse.json({ codigo: criado.codigo }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroCliente) {
      return NextResponse.json({ erro: e.mensagem }, { status: e.status });
    }
    if (ehSobreposicao(e)) {
      return NextResponse.json(
        { erro: 'Esse horário acabou de ser pego. Escolhe outro?' }, { status: 409 });
    }
    throw e;
  }
}
