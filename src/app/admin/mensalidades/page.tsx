import { Mensalidades } from '@/components/admin/Mensalidades';

/// `/admin/mensalidades`. A sessão de admin é conferida antes, pelo
/// `proxy.ts`, como em toda rota do host do admin.
export default function PaginaDasMensalidades() {
  return <Mensalidades />;
}
