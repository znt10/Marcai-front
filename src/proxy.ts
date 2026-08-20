import { NextResponse, type NextRequest } from 'next/server';
import { extrairSlug, ehHostAdmin } from '@/lib/slug';

/// Os dois cookies, por NOME. Antes vinham de `@/lib/admin-sessao` e
/// `@/lib/auth`, junto com as funções que conferiam a assinatura deles — os
/// dois módulos morreram na fatia 4 com o resto do que lia banco e segredo.
/// Os valores são os mesmos de `tenant/config.py` no back (`sessao` e
/// `sessao_admin`) — os dois lados têm de concordar no NOME do cookie mesmo
/// depois de o front parar de conseguir lê-lo. Errar aqui não quebra nada
/// visivelmente: o proxy simplesmente nunca acha o cookie e manda todo mundo
/// para o login, inclusive quem acabou de entrar.
const COOKIE_ADMIN = 'sessao_admin';
const COOKIE_SESSAO = 'sessao';

/// Next 16 aposentou `middleware.ts`: o arquivo se chama `proxy.ts` e a
/// função exportada, `proxy`. A API (NextRequest/NextResponse, matcher)
/// é a mesma de antes.

const DOMINIO_BASE = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';

export async function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const caminho = req.nextUrl.pathname;

  // ---- O host do admin ----
  // Confere a PRESENÇA do cookie, não mais a assinatura dele.
  //
  // O front deixou de ter o segredo: `SESSAO_JWT_SECRET` e `ADMIN_JWT_SECRET`
  // saíram do `.env` daqui na fatia 4, e sem segredo não há o que verificar.
  // Quem verifica de verdade é o Django, a cada pedido, com acesso ao
  // `tokenVersion` e ao `ativo` que a assinatura sozinha nunca respondeu.
  //
  // O que se perde é só o momento da recusa: um cookie inválido passa por aqui
  // e morre no 401 do Django. O que NÃO se perde é a proteção posicional — as
  // áreas continuam guardadas por CAMINHO, e uma rota nova sob /admin ou
  // /painel nasce protegida sem que ninguém decida nada. Era isso que o
  // backlog avisava ser fácil de perder calado.
  if (ehHostAdmin(host, DOMINIO_BASE)) {
    const autenticado = Boolean(req.cookies.get(COOKIE_ADMIN)?.value);
    const ehLogin = caminho === '/admin/login' || caminho === '/api/admin/auth/login';

    if (!autenticado && !ehLogin) {
      return caminho.startsWith('/api/')
        ? NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', req.url));
    }
    if (caminho === '/') return NextResponse.rewrite(new URL('/admin', req.url));
    return NextResponse.next();
  }

  // ---- Fora do host do admin, o painel não existe ----
  // A barreira é POSICIONAL: nenhuma rota de admin precisa lembrar de se
  // proteger, porque a partir de qualquer outro host elas não são alcançáveis.
  // Uma rota nova sob /api/admin nasce protegida sem que ninguém decida nada.
  if (caminho.startsWith('/admin') || caminho.startsWith('/api/admin')) {
    return new NextResponse(null, { status: 404 });
  }

  // ---- O painel: peneira grossa ----
  // Mesma mudança do bloco do admin: presença, não assinatura. A peneira fina
  // (`bid`, `tokenVersion`, `ativo`) sempre morou do outro lado, e agora a
  // grossa é só "tem cookie?" — o suficiente para mandar quem não tem para o
  // login em vez de desenhar um painel vazio.
  const ehPainel = caminho.startsWith('/painel') || caminho.startsWith('/api/painel');
  const ehLoginPainel = caminho === '/painel/login' || caminho === '/api/auth/login';
  if (ehPainel && !ehLoginPainel) {
    if (!req.cookies.get(COOKIE_SESSAO)?.value) {
      return caminho.startsWith('/api/')
        ? NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
        : NextResponse.redirect(new URL('/painel/login', req.url));
    }
  }

  const slug = extrairSlug(host, DOMINIO_BASE);

  // Domínio nu na raiz: não é tenant nenhum, é a vitrine do produto.
  if (!slug && caminho === '/') {
    return NextResponse.rewrite(new URL('/institucional', req.url));
  }

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
