import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const barbeiro = await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.barbeiro.findUniqueOrThrow({
      where: { id: aberta.sessao.sub },
      select: { id: true, nome: true, papel: true },
    }),
  );
  return NextResponse.json(barbeiro);
}
