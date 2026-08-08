import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { ehDono } from '@/lib/autorizacao';
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from '@/lib/config';

/// O catálogo é decisão da CASA — o que a barbearia vende —, então é `ehDono`,
/// como a equipe. Já quem faz o quê e em quanto tempo começa na pessoa, e por
/// isso `/barbeiro-servicos` usa `alvoDoBarbeiro`, como os horários.
const SO_O_DONO = NextResponse.json(
  { erro: 'Só o dono mexe no catálogo.' }, { status: 403 });

const Corpo = z.object({
  nome: z.string().trim().min(2).max(40),
  duracaoMinimaMin: z.number().int(),
  duracaoSugeridaMin: z.number().int(),
});

export function limitesDoServico(p: {
  duracaoMinimaMin: number; duracaoSugeridaMin: number;
}): string | null {
  const { duracaoMinimaMin: min, duracaoSugeridaMin: sugerida } = p;
  if (min < DURACAO_MINIMA_MIN || sugerida < DURACAO_MINIMA_MIN) {
    return `O mínimo é ${DURACAO_MINIMA_MIN} minutos.`;
  }
  if (min > DURACAO_MAXIMA_MIN || sugerida > DURACAO_MAXIMA_MIN) {
    return `O máximo é ${DURACAO_MAXIMA_MIN} minutos.`;
  }
  // A sugerida é o que entra no vínculo ao marcar; menor que a mínima criaria
  // um vínculo que o `validarDuracao` recusaria logo depois.
  if (min > sugerida) {
    return 'A duração sugerida não pode ser menor que a mínima.';
  }
  return null;
}

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const servicos = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const lista = await tx.servico.findMany({
      orderBy: [{ ativo: 'desc' }, { ordem: 'asc' }],
      select: {
        id: true, nome: true, ativo: true, ordem: true,
        duracaoMinimaMin: true, duracaoSugeridaMin: true,
        // Quantos barbeiros ATIVOS oferecem: zero é o aviso de que o serviço
        // existe e ninguém faz.
        _count: { select: { barbeiros: { where: { ativo: true, barbeiro: { ativo: true } } } } },
      },
    });
    return lista.map(({ _count, ...s }) => ({ ...s, barbeiros: _count.barbeiros }));
  });

  return NextResponse.json({ servicos });
}

export async function POST(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) return SO_O_DONO;

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche nome e durações.' }, { status: 422 });
  }
  const { nome, duracaoMinimaMin, duracaoSugeridaMin } = parse.data;

  const recusa = limitesDoServico({ duracaoMinimaMin, duracaoSugeridaMin });
  if (recusa) return NextResponse.json({ erro: recusa }, { status: 422 });

  const resultado = await comBarbearia(aberta.barbearia.id, async (tx) => {
    // Sem filtrar por `ativo`: o índice único é `[barbeariaId, nome]` e não
    // distingue desativado — sem esta checagem o erro sairia como 500.
    const existente = await tx.servico.findUnique({
      where: { barbeariaId_nome: { barbeariaId: aberta.barbearia.id, nome } },
      select: { ativo: true },
    });
    if (existente) return { tipo: 'repetido' as const, ativo: existente.ativo };

    const ultimo = await tx.servico.findFirst({
      orderBy: { ordem: 'desc' }, select: { ordem: true },
    });
    const criado = await tx.servico.create({
      data: {
        barbeariaId: aberta.barbearia.id, nome,
        duracaoMinimaMin, duracaoSugeridaMin,
        ordem: (ultimo?.ordem ?? -1) + 1,
      },
      select: { id: true },
    });
    return { tipo: 'ok' as const, id: criado.id };
  });

  if (resultado.tipo === 'repetido') {
    return NextResponse.json({
      erro: resultado.ativo
        ? 'Já existe um serviço com esse nome.'
        : 'Já existe um serviço com esse nome, desativado. Reativa em vez de criar outro.',
    }, { status: 409 });
  }

  return NextResponse.json({ id: resultado.id }, { status: 201 });
}
