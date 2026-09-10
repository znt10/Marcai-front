import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';

/// O `proxy.ts` lê NEXT_PUBLIC_DOMINIO_BASE no carregamento do módulo, então o
/// ambiente é montado ANTES do import dinâmico.
let proxy: (req: NextRequest) => Promise<Response>;

const SEGREDO = 'segredo-do-proxy-so-de-teste';

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_DOMINIO_BASE', 'usemarcai.online');
  vi.stubEnv('PROXY_SEGREDO', SEGREDO);
  vi.stubEnv('ADMIN_JWT_SECRET', 'segredo-admin-so-de-teste');
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
