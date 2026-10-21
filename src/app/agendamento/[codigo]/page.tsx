import { notFound } from 'next/navigation';
import { barbeariaAtual, buscarNoDjango } from '@/lib/tenant';
import { cartaoDestaPagina } from '@/lib/miniatura';
import { Frame } from '@/components/wf';
import { TelaDoAgendamento } from '@/components/TelaDoAgendamento';
import type { DetalheDoAgendamento } from '@/lib/api';

/// O link que a confirmação (e o bot) manda. O cartão fala da barbearia e não
/// do cliente: o nome dele não precisa aparecer num preview que pode ser
/// encaminhado.
export async function generateMetadata() {
  const b = await barbeariaAtual();
  return {
    title: `Seu horário · ${b.nome}`,
    ...(await cartaoDestaPagina(b.nome, 'Veja os detalhes do seu horário, ou cancele se precisar.')),
  };
}

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;

  // A MESMA busca que `barbeariaAtual()` usa — importada de `@/lib/tenant` em
  // vez de repetida aqui: duas copias divergentes seriam o mesmo defeito que
  // `baseDe()` existe para evitar do lado do navegador.
  //
  // O RLS continua garantindo que um codigo de outra barbearia nao aparece —
  // so que agora quem entra no tenant e o Django, pelo host desta requisicao.
  const r = await buscarNoDjango(`/api/agendamentos/${encodeURIComponent(codigo)}`);
  // So 404 e agendamento inexistente (ou de outro tenant, via RLS). Um 5xx
  // NAO e a mesma coisa — ver o comentario equivalente em barbeariaAtual().
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error(`GET /api/agendamentos/${codigo} devolveu ${r.status}`);
  const ag: DetalheDoAgendamento = await r.json();

  return (
    <Frame>
      <TelaDoAgendamento inicial={ag} />
    </Frame>
  );
}
