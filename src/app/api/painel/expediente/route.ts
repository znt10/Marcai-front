import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { alvoDoBarbeiro, NAO_ENCONTRADO } from '@/lib/alcance';
import { jornadaValida } from '@/lib/horarios';


const CorpoPut = z.object({
  barbeiroId: z.uuid().optional(),
  diaSemana: z.number().int(),
  minutosInicio: z.number(),
  minutosFim: z.number(),
});

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const barbeiroId = alvoDoBarbeiro(aberta.sessao, url.searchParams.get('barbeiroId'));
  if (!barbeiroId) return NAO_ENCONTRADO;

  const dados = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const [horarios, bloqueios] = await Promise.all([
      tx.horarioTrabalho.findMany({
        where: { barbeiroId },
        select: { diaSemana: true, minutosInicio: true, minutosFim: true },
      }),
      tx.bloqueio.findMany({
        where: { barbeiroId },
        orderBy: [{ repeteSemanalmente: 'desc' }, { criadoEm: 'asc' }],
        select: {
          id: true, motivo: true, observacao: true, repeteSemanalmente: true,
          diaSemana: true, minutosInicio: true, minutosFim: true,
          inicio: true, fim: true,
        },
      }),
    ]);

    // Os SETE dias sempre, com `null` onde está fechado: a tela precisa
    // desenhar a semana inteira, e "não veio na lista" é ambíguo com "não
    // carregou".
    const expediente = Array.from({ length: 7 }, (_, diaSemana) =>
      horarios.find((h) => h.diaSemana === diaSemana) ?? { diaSemana, minutosInicio: null, minutosFim: null });

    return { barbeiroId, expediente, bloqueios };
  });

  return NextResponse.json(dados);
}

export async function PUT(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const parse = CorpoPut.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche o dia e os horários.' }, { status: 422 });
  }
  const { diaSemana, minutosInicio, minutosFim } = parse.data;

  const barbeiroId = alvoDoBarbeiro(aberta.sessao, parse.data.barbeiroId);
  if (!barbeiroId) return NAO_ENCONTRADO;

  const recusa = jornadaValida({ diaSemana, minutosInicio, minutosFim });
  if (recusa) return NextResponse.json({ erro: recusa }, { status: 422 });

  await comBarbearia(aberta.barbearia.id, async (tx) => {
    // O barbeiro pode não ser deste tenant: o RLS não deixaria a criação
    // passar, mas a mensagem sairia como erro de banco. Conferir antes deixa a
    // resposta honesta.
    const existe = await tx.barbeiro.findUnique({ where: { id: barbeiroId }, select: { id: true } });
    if (!existe) return;

    await tx.horarioTrabalho.upsert({
      where: { barbeiroId_diaSemana: { barbeiroId, diaSemana } },
      create: { barbeariaId: aberta.barbearia.id, barbeiroId, diaSemana, minutosInicio, minutosFim },
      update: { minutosInicio, minutosFim },
    });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const barbeiroId = alvoDoBarbeiro(aberta.sessao, url.searchParams.get('barbeiroId'));
  if (!barbeiroId) return NAO_ENCONTRADO;

  const diaSemana = Number(url.searchParams.get('diaSemana'));
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return NextResponse.json({ erro: 'Dia da semana inválido.' }, { status: 422 });
  }

  // Fechar o dia é APAGAR a linha: sem `HorarioTrabalho` naquele dia, o motor
  // devolve vazio na primeira linha (`if (!jornada) return []`). A ausência já
  // é a representação de "não trabalho", e criar uma segunda (jornada de
  // duração zero) daria dois jeitos de dizer a mesma coisa.
  await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.horarioTrabalho.deleteMany({ where: { barbeiroId, diaSemana } }));

  return NextResponse.json({ ok: true });
}
