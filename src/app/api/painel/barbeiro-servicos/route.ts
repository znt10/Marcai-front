import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { alvoDoBarbeiro, NAO_ENCONTRADO } from '@/lib/alcance';
import { validarDuracao, ErroDuracao } from '@/lib/servicos';

const Corpo = z.object({
  barbeiroId: z.uuid().optional(),
  servicoId: z.uuid(),
  faz: z.boolean(),
  duracaoMin: z.number().int().optional(),
});

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const barbeiroId = alvoDoBarbeiro(aberta.sessao, url.searchParams.get('barbeiroId'));
  if (!barbeiroId) return NAO_ENCONTRADO;

  const vinculos = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const [servicos, ligados] = await Promise.all([
      tx.servico.findMany({
        where: { ativo: true },
        orderBy: { ordem: 'asc' },
        select: { id: true, nome: true, duracaoMinimaMin: true, duracaoSugeridaMin: true },
      }),
      tx.barbeiroServico.findMany({
        where: { barbeiroId },
        select: { servicoId: true, duracaoMin: true, ativo: true },
      }),
    ]);

    // Todos os serviços ATIVOS, marcados ou não: a tela é uma lista de caixas,
    // e "não veio" seria ambíguo com "não faz".
    return servicos.map((s) => {
      const v = ligados.find((l) => l.servicoId === s.id);
      return {
        servicoId: s.id, nome: s.nome,
        duracaoMinimaMin: s.duracaoMinimaMin,
        faz: v?.ativo ?? false,
        // Sem vínculo, mostra a sugerida — é o que entraria ao marcar.
        duracaoMin: v?.duracaoMin ?? s.duracaoSugeridaMin,
      };
    });
  });

  return NextResponse.json({ barbeiroId, vinculos });
}

export async function PUT(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche o serviço.' }, { status: 422 });
  }
  const { servicoId, faz, duracaoMin } = parse.data;

  const barbeiroId = alvoDoBarbeiro(aberta.sessao, parse.data.barbeiroId);
  if (!barbeiroId) return NAO_ENCONTRADO;

  const resultado = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const servico = await tx.servico.findUnique({
      where: { id: servicoId },
      select: { duracaoMinimaMin: true, duracaoSugeridaMin: true },
    });
    if (!servico) return null;

    const existente = await tx.barbeiroServico.findUnique({
      where: { barbeiroId_servicoId: { barbeiroId, servicoId } },
      select: { duracaoMin: true },
    });

    // A duração só é decidida aqui: o pedido manda, senão a praticada, senão a
    // sugerida do serviço. Marcar sem pensar em número é o caminho comum, e o
    // número certo na maioria dos casos é o sugerido.
    const duracao = duracaoMin ?? existente?.duracaoMin ?? servico.duracaoSugeridaMin;

    try {
      validarDuracao(duracao, servico);
    } catch (e) {
      if (e instanceof ErroDuracao) return { tipo: 'recusado' as const, erro: e.message };
      throw e;
    }

    // Desmarcar é `ativo: false`, nunca DELETE: a linha guarda a duração que
    // aquele barbeiro praticava, e remarcar devolve o número em vez de voltar
    // ao sugerido.
    await tx.barbeiroServico.upsert({
      where: { barbeiroId_servicoId: { barbeiroId, servicoId } },
      create: {
        barbeariaId: aberta.barbearia.id, barbeiroId, servicoId,
        duracaoMin: duracao, ativo: faz,
      },
      update: { duracaoMin: duracao, ativo: faz },
    });
    return { tipo: 'ok' as const };
  });

  if (resultado === null) return NAO_ENCONTRADO;
  if (resultado.tipo === 'recusado') {
    return NextResponse.json({ erro: resultado.erro }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
