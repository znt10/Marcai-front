import { notFound } from 'next/navigation';
import { origemDoTenant } from '@/lib/tenant';
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

  // MESMA montagem de origem que `barbeariaAtual()` — importada de `@/lib/tenant`
  // em vez de repetida aqui: duas copias divergentes seriam o mesmo defeito
  // que `baseDe()` existe para evitar do lado do navegador.
  const origem = await origemDoTenant();

  // O RLS continua garantindo que um codigo de outra barbearia nao aparece —
  // so que agora quem entra no tenant e o Django, pelo Host desta requisicao.
  const r = await fetch(`${origem}/api/agendamentos/${encodeURIComponent(codigo)}`, {
    cache: 'no-store',
  });
  // So 404 e agendamento inexistente (ou de outro tenant, via RLS). Um 5xx
  // NAO e a mesma coisa — ver o comentario equivalente em barbeariaAtual().
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error(`GET /api/agendamentos/${codigo} devolveu ${r.status}`);
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
