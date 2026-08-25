import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { Frame } from '@/components/wf';
import { Confirmado } from '@/components/Confirmado';

/// O `podeCancelar` vem PRONTO do Django desde a fatia 8. Ele era calculado
/// aqui (`minutosAte > PRAZO_CANCELAMENTO_MIN`) sobre o relogio do servidor
/// do Next; agora sai do mesmo relogio que a rota de cancelar vai consultar
/// quando o botao for clicado. Duas contas em dois relogios davam a janela em
/// que a tela oferece cancelar e a API recusa.
type Detalhe = {
  codigo: string;
  clienteNome: string;
  barbeiroNome: string;
  servicoNome: string;
  precoCentavos: number | null;
  inicio: string;
  fim: string;
  status: string;
  podeCancelar: boolean;
  endereco: string;
  whatsappBarbearia: string;
};

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;

  // Mesma montagem de origem que `barbeariaAtual()` faz, e pelo mesmo motivo:
  // Server Component nao tem `window`, entao `pedir()` esta fora de questao.
  const host = (await headers()).get('host');
  if (!host) notFound();
  const porta = process.env.NEXT_PUBLIC_API_URL || '8000';
  const origem = `http://${host.split(':')[0]}:${porta}`;

  // O RLS continua garantindo que um codigo de outra barbearia nao aparece —
  // so que agora quem entra no tenant e o Django, pelo Host desta requisicao.
  const r = await fetch(`${origem}/api/agendamentos/${encodeURIComponent(codigo)}`, {
    cache: 'no-store',
  });
  if (!r.ok) notFound();
  const ag: Detalhe = await r.json();

  return (
    <Frame>
      <Confirmado
        codigo={ag.codigo}
        clienteNome={ag.clienteNome}
        barbeiroNome={ag.barbeiroNome}
        servicoNome={ag.servicoNome}
        inicioIso={ag.inicio}
        fimIso={ag.fim}
        status={ag.status}
        podeCancelar={ag.podeCancelar}
        endereco={ag.endereco}
        whatsappBarbearia={ag.whatsappBarbearia}
        precoCentavos={ag.precoCentavos}
      />
    </Frame>
  );
}
