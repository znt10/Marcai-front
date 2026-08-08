import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { NAO_ENCONTRADO } from '@/lib/alcance';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  const { id } = await params;

  const apagado = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const bloqueio = await tx.bloqueio.findUnique({
      where: { id }, select: { barbeiroId: true },
    });
    if (!bloqueio) return false;

    // Reconferência DEPOIS de carregar, como no cancelamento de agendamento: o
    // barbeiro que forjar o id do bloqueio de um colega recebe 404, não 403.
    const filtro = filtroDoBarbeiro(aberta.sessao);
    if (filtro.barbeiroId && filtro.barbeiroId !== bloqueio.barbeiroId) return false;

    await tx.bloqueio.delete({ where: { id } });
    return true;
  });

  if (!apagado) return NAO_ENCONTRADO;
  return NextResponse.json({ ok: true });
}
