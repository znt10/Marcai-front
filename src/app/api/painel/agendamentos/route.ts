import { NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { slotsDoDia } from '@/lib/agenda';
import { normalizar } from '@/lib/telefone';
import { enviarTexto } from '@/lib/whatsapp';
import { msgConfirmacao } from '@/lib/mensagens';
import { utcParaLocal } from '@/lib/datas';

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

/// 23P01 = exclusion_violation, de `agendamento_sem_sobreposicao` (§5.4).
/// Copiada da rota pública: são quinze linhas que existem para não confundir
/// 409 com 500, e extrair um módulo comum mexeria numa rota coberta por
/// testes que não são desta etapa.
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
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  const { sessao, barbearia } = aberta;

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche nome e WhatsApp.' }, { status: 422 });
  }
  const { barbeiroId, servicoId, inicio: inicioIso, nome } = parse.data;

  // Diferença 1 do fluxo público: o formato é validado, a existência no
  // WhatsApp NÃO. A verificação da Evolution é um oráculo de enumeração
  // defendido por 10 chamadas/hora por IP — e o balcão da barbearia é um IP
  // só, então o limite morderia o uso legítimo. O barbeiro está com o cliente
  // na frente; ele não precisa de oráculo.
  const whatsapp = normalizar(parse.data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json({ erro: 'Confere o WhatsApp — parece faltar dígito.' },
                             { status: 422 });
  }

  // Marcar na agenda de outro barbeiro é 404, não 403: 403 confirmaria que
  // aquele barbeiro existe nesta barbearia.
  const doFiltro = filtroDoBarbeiro(sessao);
  if (doFiltro.barbeiroId && doFiltro.barbeiroId !== barbeiroId) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
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

      // Diferença 2: sem a antecedência mínima do público. O barbeiro marca
      // para daqui a cinco minutos. Marcar no passado continua recusado —
      // agenda não é histórico.
      if (inicio <= agora) throw new ErroCliente(422, 'Esse horário já passou.');

      const { dia } = utcParaLocal(inicio);
      const livres = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, dia, agora);
      if (!livres.some((s) => s.inicio.getTime() === inicio.getTime())) {
        throw new ErroCliente(409, 'Esse horário não está mais disponível.');
      }

      // Diferença 3: o nome é ATUALIZADO. O barbeiro está com a pessoa na
      // frente e sabe o nome melhor que o formulário de três meses atrás.
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
      return NextResponse.json({ erro: 'Esse horário acabou de ser pego.' },
                               { status: 409 });
    }
    throw e;
  }
}
