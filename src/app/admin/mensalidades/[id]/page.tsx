import { HistoricoDaMensalidade } from '@/components/admin/HistoricoDaMensalidade';

/// `/admin/mensalidades/<id>`: os pagamentos de uma barbearia. A sessão de
/// admin é conferida antes, pelo `proxy.ts`, como em toda rota do host do admin.
export default async function PaginaDoHistorico({ params }: PageProps<'/admin/mensalidades/[id]'>) {
  const { id } = await params;
  return <HistoricoDaMensalidade barbeariaId={id} />;
}
