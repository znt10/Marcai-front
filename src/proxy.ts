import { NextResponse, type NextRequest } from 'next/server';
import { extrairSlug, ehHostAdmin } from '@/lib/slug';
import { semSubdominio } from '@/lib/config';
import { lerSessao, COOKIE_ADMIN } from '@/lib/admin-sessao';
import { lerSessao as lerSessaoBarbeiro, COOKIE_SESSAO } from '@/lib/auth';

/// Next 16 aposentou `middleware.ts`: o arquivo se chama `proxy.ts` e a
/// função exportada, `proxy`. A API (NextRequest/NextResponse, matcher)
/// é a mesma de antes.

const DOMINIO_BASE = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';

/// A barbearia padrão de dev — vazia em produção, e é assim que fica: quem a
/// liga de verdade é o Django (`tenant_padrao`, que exige DJANGO_DEBUG=1). Aqui
/// ela só decide UMA coisa: se o domínio nu ainda serve a página institucional.
///
/// Sem isto, `http://10.0.0.7:3000/` no celular renderizaria a institucional
/// enquanto o Django, do outro lado do mesmo host, serviria a barbearia — os
/// dois lados discordando sobre o que aquele endereço significa.
const TENANT_PADRAO = process.env.NEXT_PUBLIC_TENANT_PADRAO ?? '';

/// O admin do Django e o CSS/JS que ele carrega — este último não mora sob
/// `/admin`: o Django o serve em `/static/admin/...`.
function ehDoAdminDoDjango(caminho: string): boolean {
  return caminho === '/admin/django' || caminho.startsWith('/admin/django/') || caminho.startsWith('/static/');
}

/// O que sai do Next e é atendido pelo Django: `/api/*` pelo rewrite do
/// `next.config.ts`, o admin do Django pelo rewrite feito AQUI.
function vaiParaODjango(caminho: string): boolean {
  return caminho.startsWith('/api/') || ehDoAdminDoDjango(caminho);
}

/// A URL no Django para o admin dele, com o caminho INTEIRO — barra final
/// incluída — e a query, lidos da URL crua do pedido.
///
/// Não vai pelo `rewrites()` do `next.config.ts` de propósito: lá o
/// `:caminho*` engole a barra final, e toda URL do admin do Django termina em
/// `/`. Null sem API_INTERNA_URL: em dev o link do painel já aponta para a
/// porta 8000 e nada passa por aqui.
function destinoNoDjango(req: NextRequest): URL | null {
  const base = process.env.API_INTERNA_URL?.trim().replace(/\/+$/, '');
  if (!base) return null;
  const bruta = new URL(req.url);
  return new URL(`${base}${bruta.pathname}${bruta.search}`);
}

/// Os cabeçalhos com que o pedido segue adiante.
///
/// Em `/api/*` o rewrite do `next.config.ts` entrega o pedido ao Django no
/// Railway, e nesse salto o Host vira o do Railway — até o `x-forwarded-host`
/// chega com ele (conferido no DisallowedHost de produção). Como aqui o tenant
/// É o host, o Django precisa do original: vai em `x-marcai-host`, com o
/// segredo em `x-marcai-proxy`. Quem confere é o `HostDoProxyMiddleware`.
///
/// O IP do cliente vai junto, em `x-marcai-ip`: no salto até o Railway o
/// `x-forwarded-for` passa a começar pelo IP da Vercel, e a trava de login do
/// admin contaria as falhas de todo mundo num balde só. Aqui, na borda, ele
/// ainda é o de quem chamou.
///
/// Os três são APAGADOS antes de tudo, venham de onde vierem: chegando de
/// fora, é alguém tentando se passar por este proxy. O segredo barraria o
/// golpe de qualquer jeito; apagar tira a dúvida de qual valor seguiu.
///
/// `PROXY_SEGREDO` sem `NEXT_PUBLIC_` de propósito — prefixado, iria para o
/// bundle do navegador. Vazio (dev) = nenhum cabeçalho, e o Django segue no
/// Host real da conexão, que em dev já é o da barbearia.
function cabecalhosParaODjango(req: NextRequest, host: string, caminho: string): Headers {
  const headers = new Headers(req.headers);
  // Ninguém lê mais `x-barbearia-slug` (o Django resolve o tenant pelo Host),
  // mas um valor vindo de fora continua sendo canal indevido, então
  // `curl -H "x-barbearia-slug: dontony"` segue sem efeito nenhum.
  headers.delete('x-barbearia-slug');
  headers.delete('x-marcai-host');
  headers.delete('x-marcai-proxy');
  headers.delete('x-marcai-ip');

  const segredo = process.env.PROXY_SEGREDO;
  if (segredo && vaiParaODjango(caminho)) {
    headers.set('x-marcai-host', host);
    headers.set('x-marcai-proxy', segredo);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (ip) headers.set('x-marcai-ip', ip);
  }
  return headers;
}

export async function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const caminho = req.nextUrl.pathname;

  // `skipTrailingSlashRedirect` (next.config.ts) desliga o 308 automático do
  // Next para que as URLs do admin do Django cheguem COM a barra final. O resto
  // do site mantém o comportamento de antes: `/agendar/` vira `/agendar`. Lido
  // da URL crua, que é onde a barra com certeza ainda está.
  //
  // A URL do redirecionamento TAMBÉM sai da crua, e não de `req.nextUrl.clone()`:
  // o NextURL lembra que a original tinha barra e a repõe ao serializar, e o
  // resultado era um 308 de `/agendar/` para `/agendar/` — laço infinito em
  // todo endereço digitado com barra no fim.
  const bruta = new URL(req.url);
  if (bruta.pathname !== '/' && bruta.pathname.endsWith('/') && !ehDoAdminDoDjango(bruta.pathname)) {
    bruta.pathname = bruta.pathname.replace(/\/+$/, '') || '/';
    return NextResponse.redirect(bruta, 308);
  }

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
    const headers = cabecalhosParaODjango(req, host, caminho);
    // Só DEPOIS da conferência da sessão acima: o admin do Django e os
    // estáticos dele exigem o cookie da plataforma já aqui, e de novo lá
    // (`AdminDjangoMiddleware`).
    if (ehDoAdminDoDjango(caminho)) {
      const destino = destinoNoDjango(req);
      if (destino) return NextResponse.rewrite(destino, { request: { headers } });
    }
    return NextResponse.next({ request: { headers } });
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

  // Domínio nu na raiz: não é tenant nenhum, é a vitrine do produto — a menos
  // que a barbearia padrão de dev esteja ligada, e aí este host É uma
  // barbearia (o mesmo recorte que o TenantMiddleware aplica do outro lado).
  const caiNoPadrao = !!TENANT_PADRAO && semSubdominio(host, DOMINIO_BASE);
  if (!slug && !caiNoPadrao && caminho === '/') {
    return NextResponse.rewrite(new URL('/institucional', req.url));
  }

  return NextResponse.next({ request: { headers: cabecalhosParaODjango(req, host, caminho) } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
