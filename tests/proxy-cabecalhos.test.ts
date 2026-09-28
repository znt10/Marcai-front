import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

/// O `proxy.ts` lê NEXT_PUBLIC_DOMINIO_BASE no carregamento do módulo, então o
/// ambiente é montado ANTES do import dinâmico.
let proxy: (req: NextRequest) => Promise<Response>;

const SEGREDO = 'segredo-do-proxy-so-de-teste';
const API = 'https://back.exemplo.test';
const SEGREDO_ADMIN = 'segredo-admin-so-de-teste';

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_DOMINIO_BASE', 'usemarcai.online');
  vi.stubEnv('PROXY_SEGREDO', SEGREDO);
  vi.stubEnv('ADMIN_JWT_SECRET', SEGREDO_ADMIN);
  vi.stubEnv('API_INTERNA_URL', `${API}/`);
  vi.stubEnv('SESSAO_JWT_SECRET', 'segredo-sessao-so-de-teste');
  ({ proxy } = await import('@/proxy'));
});

afterAll(() => vi.unstubAllEnvs());

/// O que o Next repassa ao destino do rewrite: `NextResponse.next({ request })`
/// vira `x-middleware-request-<nome>` na resposta do proxy.
function repassado(res: Response, nome: string): string | null {
  return res.headers.get(`x-middleware-request-${nome}`);
}

function pedido(url: string, cabecalhos: Record<string, string> = {}) {
  const host = new URL(url).host;
  return new NextRequest(url, { headers: { host, ...cabecalhos } });
}

describe('proxy.ts → cabeçalhos para o Django', () => {
  it('em /api de barbearia, repassa host, segredo e IP do cliente', async () => {
    const res = await proxy(
      pedido('https://brutus.usemarcai.online/api/servicos', {
        'x-forwarded-for': '167.249.51.42, 10.0.0.1',
      }),
    );
    expect(repassado(res, 'x-marcai-host')).toBe('brutus.usemarcai.online');
    expect(repassado(res, 'x-marcai-proxy')).toBe(SEGREDO);
    expect(repassado(res, 'x-marcai-ip')).toBe('167.249.51.42');
  });

  it('no login do admin (host do admin), repassa o host do admin', async () => {
    const res = await proxy(pedido('https://admin.usemarcai.online/api/admin/auth/login'));
    expect(repassado(res, 'x-marcai-host')).toBe('admin.usemarcai.online');
    expect(repassado(res, 'x-marcai-proxy')).toBe(SEGREDO);
  });

  it('valores forjados pelo cliente não seguem adiante', async () => {
    const res = await proxy(
      pedido('https://brutus.usemarcai.online/api/servicos', {
        'x-marcai-host': 'dontony.usemarcai.online',
        'x-marcai-proxy': 'chute',
        'x-marcai-ip': '1.2.3.4',
        'x-barbearia-slug': 'dontony',
      }),
    );
    expect(repassado(res, 'x-marcai-host')).toBe('brutus.usemarcai.online');
    expect(repassado(res, 'x-marcai-proxy')).toBe(SEGREDO);
    expect(repassado(res, 'x-marcai-ip')).toBeNull();
    expect(repassado(res, 'x-barbearia-slug')).toBeNull();
  });

  it('fora de /api não manda o segredo (página não vai ao Django)', async () => {
    const res = await proxy(pedido('https://brutus.usemarcai.online/agendar'));
    expect(repassado(res, 'x-marcai-proxy')).toBeNull();
    expect(repassado(res, 'x-marcai-host')).toBeNull();
  });

  it('o segredo nunca aparece nos cabeçalhos de resposta ao navegador', async () => {
    const res = await proxy(pedido('https://brutus.usemarcai.online/api/servicos'));
    const visiveis = [...res.headers.entries()].filter(([k]) => !k.startsWith('x-middleware-'));
    expect(visiveis.some(([, v]) => v.includes(SEGREDO))).toBe(false);
  });
});

/// O cookie da plataforma, assinado como o Django assina.
async function cookieDoAdmin(): Promise<string> {
  const jwt = await new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SEGREDO_ADMIN));
  return `sessao_admin=${jwt}`;
}

describe('proxy.ts → admin do Django', () => {
  it('reescreve para o Django mantendo a barra final e a query', async () => {
    const res = await proxy(
      pedido('https://admin.usemarcai.online/admin/django/tenant/barbearia/?q=x', {
        cookie: await cookieDoAdmin(),
      }),
    );
    expect(res.headers.get('x-middleware-rewrite')).toBe(`${API}/admin/django/tenant/barbearia/?q=x`);
    expect(repassado(res, 'x-marcai-host')).toBe('admin.usemarcai.online');
    expect(repassado(res, 'x-marcai-proxy')).toBe(SEGREDO);
  });

  it('a raiz do admin do Django chega com a barra', async () => {
    const res = await proxy(
      pedido('https://admin.usemarcai.online/admin/django/', { cookie: await cookieDoAdmin() }),
    );
    expect(res.status).not.toBe(308);
    expect(res.headers.get('x-middleware-rewrite')).toBe(`${API}/admin/django/`);
  });

  it('o CSS do admin do Django também vai ao Django', async () => {
    const res = await proxy(
      pedido('https://admin.usemarcai.online/static/admin/css/base.css', {
        cookie: await cookieDoAdmin(),
      }),
    );
    expect(res.headers.get('x-middleware-rewrite')).toBe(`${API}/static/admin/css/base.css`);
  });

  it('sem o cookie da plataforma, não chega ao Django', async () => {
    const res = await proxy(pedido('https://admin.usemarcai.online/admin/django/'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(res.headers.get('location')).toMatch(/\/admin\/login$/);
  });

  it('fora do host do admin, o admin do Django não existe', async () => {
    const res = await proxy(pedido('https://brutus.usemarcai.online/admin/django/'));
    expect(res.status).toBe(404);
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('no resto do site a barra final continua virando sem barra', async () => {
    const res = await proxy(pedido('https://brutus.usemarcai.online/agendar/?data=hoje'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://brutus.usemarcai.online/agendar?data=hoje');
  });
});
