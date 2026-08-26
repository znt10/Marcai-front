import { NextResponse, type NextRequest } from 'next/server';
import { extrairSlug, ehHostAdmin } from '@/lib/slug';
import { lerSessao, COOKIE_ADMIN } from '@/lib/admin-sessao';
import { lerSessao as lerSessaoBarbeiro, COOKIE_SESSAO } from '@/lib/auth';

/// Next 16 aposentou `middleware.ts`: o arquivo se chama `proxy.ts` e a
/// função exportada, `proxy`. A API (NextRequest/NextResponse, matcher)
/// é a mesma de antes.

const DOMINIO_BASE = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';

export async function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const caminho = req.nextUrl.pathname;

  // ---- O host do admin ----
  // A sessão é conferida AQUI, antes de qualquer rota rodar. `jose` funciona
  // no runtime Edge, que é onde este arquivo executa — foi por isso que ela
  // foi escolhida no lugar de jsonwebtoken.
  if (ehHostAdmin(host, DOMINIO_BASE)) {
    const autenticado = await lerSessao(req.cookies.get(COOKIE_ADMIN)?.value);
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
  // Aqui só dá para conferir assinatura e validade — `jose` roda em Edge, o
  // Prisma não. O `bid`, o `tokenVersion` e o `ativo` são conferidos na rota
  // (painel §3), porque resolver slug -> barbeariaId é consulta ao banco.
  const ehPainel = caminho.startsWith('/painel') || caminho.startsWith('/api/painel');
  const ehLoginPainel = caminho === '/painel/login' || caminho === '/api/auth/login';
  if (ehPainel && !ehLoginPainel) {
    if (!(await lerSessaoBarbeiro(req.cookies.get(COOKIE_SESSAO)?.value))) {
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
  // Só a limpeza sobrevive: ninguém lê mais `x-barbearia-slug` (o Django
  // resolve o tenant pelo Host, e `tenant.ts` parou de repassar o header
  // quando migrou para isso) — mas um valor vindo de fora continua sendo
  // canal indevido, então `curl -H "x-barbearia-slug: dontony"` segue sem
  // efeito nenhum.
  headers.delete('x-barbearia-slug');

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
