import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { enviarTexto } from '@/lib/whatsapp';
import { msgCancelamentoPelaBarbearia } from '@/lib/mensagens';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  const { sessao, barbearia } = aberta;
  const { id } = await params;

  const cancelado = await comBarbearia(barbearia.id, async (tx) => {
    const a = await tx.agendamento.findUnique({
      where: { id },
      include: {
        cliente:  { select: { nome: true, whatsapp: true } },
        barbeiro: { select: { nome: true } },
      },
    });
    if (!a || a.status !== 'CONFIRMADO') return null;

    // Reconferência DEPOIS de carregar: um BARBEIRO que forje o id de um
    // agendamento do colega recebe 404 — 403 confirmaria que ele existe.
    const doFiltro = filtroDoBarbeiro(sessao);
    if (doFiltro.barbeiroId && doFiltro.barbeiroId !== a.barbeiroId) return null;

    // O PRAZO_CANCELAMENTO_MIN NÃO é conferido aqui: é regra contra o cliente
    // sumir em cima da hora, e o barbeiro que quebrou o braço precisa
    // desmarcar a tarde inteira agora.
    //
    // Liberar o horário é consequência de mudar o status, não um passo à
    // parte: a exclusion constraint de §5.4 só conta CONFIRMADO.
    await tx.agendamento.update({
      where: { id },
      data: { status: 'CANCELADO_BARBEIRO', canceladoEm: new Date() },
    });
    return a;
  });

  if (!cancelado) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });

  // Depois do commit, fire-and-forget: falha de WhatsApp não desfaz nada.
  void enviarTexto(cancelado.cliente.whatsapp, msgCancelamentoPelaBarbearia({
    clienteNome: cancelado.cliente.nome, barbeiroNome: cancelado.barbeiro.nome,
    servicoNome: cancelado.servicoNome, inicio: cancelado.inicio,
    endereco: barbearia.endereco,
  }));

  return NextResponse.json({ ok: true });
}
