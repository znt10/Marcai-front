import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { bloqueioValido } from '@/lib/horarios';
import { alvoDoBarbeiro, NAO_ENCONTRADO } from '@/lib/alcance';

const Corpo = z.object({
  barbeiroId: z.uuid().optional(),
  motivo: z.enum(['ALMOCO', 'FOLGA', 'PESSOAL', 'OUTRO']),
  observacao: z.string().trim().max(200).optional(),
  repeteSemanalmente: z.boolean(),
  diaSemana: z.number().int().nullable().optional(),
  minutosInicio: z.number().nullable().optional(),
  minutosFim: z.number().nullable().optional(),
  inicio: z.iso.datetime().nullable().optional(),
  fim: z.iso.datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche o bloqueio.' }, { status: 422 });
  }
  const c = parse.data;

  const barbeiroId = alvoDoBarbeiro(aberta.sessao, c.barbeiroId);
  if (!barbeiroId) return NAO_ENCONTRADO;

  const campos = {
    repeteSemanalmente: c.repeteSemanalmente,
    diaSemana: c.diaSemana ?? null,
    minutosInicio: c.minutosInicio ?? null,
    minutosFim: c.minutosFim ?? null,
    inicio: c.inicio ? new Date(c.inicio) : null,
    fim: c.fim ? new Date(c.fim) : null,
  };

  const recusa = bloqueioValido(campos);
  if (recusa) return NextResponse.json({ erro: recusa }, { status: 422 });

  const criado = await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.bloqueio.create({
      data: {
        barbeariaId: aberta.barbearia.id, barbeiroId,
        motivo: c.motivo, observacao: c.observacao ?? null,
        ...campos,
      },
      select: { id: true },
    }));

  return NextResponse.json({ id: criado.id }, { status: 201 });
}
