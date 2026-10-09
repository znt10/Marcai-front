import { notFound } from 'next/navigation';
import { AdminDaCategoria } from '@/components/admin/AdminDaCategoria';
import { tipoDaCategoria } from '@/lib/categorias';

/// `/admin/barbearia`, `/admin/sobrancelha`, `/admin/outro`. O que não é tipo
/// (`/admin/manicure`) é 404 — e não uma lista vazia, que pareceria uma
/// categoria sem ninguém. A sessão de admin é conferida antes, pelo
/// `proxy.ts`, como em toda rota do host do admin.
export default async function PaginaDaCategoria({ params }: PageProps<'/admin/[tipo]'>) {
  const tipo = tipoDaCategoria((await params).tipo);
  if (!tipo) notFound();
  return <AdminDaCategoria tipo={tipo} />;
}
