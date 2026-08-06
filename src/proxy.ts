import { NextResponse, type NextRequest } from 'next/server';
import { extrairSlug } from '@/lib/slug';

/// Next 16 aposentou `middleware.ts`: o arquivo se chama `proxy.ts` e a
/// função exportada, `proxy`. A API (NextRequest/NextResponse, matcher)
/// é a mesma de antes.

const DOMINIO_BASE = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';

export function proxy(req: NextRequest) {
  const slug = extrairSlug(req.headers.get('host') ?? '', DOMINIO_BASE);

  const headers = new Headers(req.headers);
  // Apaga o que veio de fora ANTES de escrever o nosso. O header é canal
  // interno: `curl -H "x-barbearia-slug: dontony"` não escolhe tenant.
  headers.delete('x-barbearia-slug');
  if (slug) headers.set('x-barbearia-slug', slug);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
