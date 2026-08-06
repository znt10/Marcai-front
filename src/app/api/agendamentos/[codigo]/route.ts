import { NextResponse } from 'next/server';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';
import { formatar } from '@/lib/telefone';

export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const barbearia = await barbeariaDaRequisicao(req);

  // O RLS garante que um código de outra barbearia não é encontrado aqui.
  const ag = await comBarbearia(barbearia.id, (tx) =>
    tx.agendamento.findFirst({
      where: { codigo },
      include: { barbeiro: { select: { nome: true } }, cliente: { select: { nome: true } } },
    }),
  );
  if (!ag) return NextResponse.json({ erro: 'Agendamento não encontrado.' }, { status: 404 });

  const minutosAte = (ag.inicio.getTime() - Date.now()) / 60_000;

  return NextResponse.json({
    codigo: ag.codigo,
    // O nome do cliente sai; o WhatsApp dele, nunca (§9.1).
    clienteNome: ag.cliente.nome,
    barbeiroNome: ag.barbeiro.nome,
    servicoNome: ag.servicoNome,
    duracaoMin: ag.duracaoMin,
    inicio: ag.inicio.toISOString(),
    fim: ag.fim.toISOString(),
    status: ag.status,
    // Calculado no servidor. A tela obedece, não recalcula.
    podeCancelar: ag.status === 'CONFIRMADO' && minutosAte > PRAZO_CANCELAMENTO_MIN,
    endereco: barbearia.endereco,
    whatsappBarbearia: formatar(barbearia.whatsappContato),
  });
}
