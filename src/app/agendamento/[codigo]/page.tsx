import { notFound } from 'next/navigation';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';
import { formatar } from '@/lib/telefone';
import { Frame, StatusBar } from '@/components/wf';
import { Confirmado } from '@/components/Confirmado';

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const b = await barbeariaAtual();

  // O RLS garante que um código de outra barbearia não aparece aqui.
  const ag = await comBarbearia(b.id, (tx) =>
    tx.agendamento.findFirst({
      where: { codigo },
      include: { barbeiro: { select: { nome: true } }, cliente: { select: { nome: true } } },
    }),
  );
  if (!ag) notFound();

  const minutosAte = (ag.inicio.getTime() - Date.now()) / 60_000;

  return (
    <Frame>
      <StatusBar />
      <Confirmado
        codigo={ag.codigo}
        clienteNome={ag.cliente.nome}
        barbeiroNome={ag.barbeiro.nome}
        servicoNome={ag.servicoNome}
        inicioIso={ag.inicio.toISOString()}
        fimIso={ag.fim.toISOString()}
        status={ag.status}
        podeCancelar={ag.status === 'CONFIRMADO' && minutosAte > PRAZO_CANCELAMENTO_MIN}
        endereco={b.endereco}
        whatsappBarbearia={formatar(b.whatsappContato)}
      />
    </Frame>
  );
}
