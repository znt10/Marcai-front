import { describe, it, expect, vi, beforeEach } from 'vitest';

// `next/headers` so existe dentro do runtime do Next. O que importa provar
// aqui e a MONTAGEM DA ORIGEM: `barbeariaAtual` roda em Server Component,
// onde nao ha `window`, entao ela nao pode passar por `pedir()` — que lanca
// sem `window` de proposito (client.ts). Este e o erro que o §4 da spec
// chama de "o detalhe que morde".
const headersMock = vi.fn();
vi.mock('next/headers', () => ({ headers: () => headersMock() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

describe('barbeariaAtual', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // A configuração de PRODUÇÃO: `NEXT_PUBLIC_API_URL="443"` para o navegador
  // chamar a própria origem, e `API_INTERNA_URL` para o servidor. Montar a
  // origem pelo host aqui dava `http://brutus.<dominio>:443` — HTTP puro na
  // porta do HTTPS —, e toda página renderizada no servidor respondia 500.
  // O navegador nunca passou por esse caminho, então nada no painel acusava.
  it('em produção, vai pela rede interna levando o host da barbearia no cabeçalho', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '443');
    vi.stubEnv('API_INTERNA_URL', 'http://api:8000/');
    vi.stubEnv('PROXY_SEGREDO', 's3gredo');
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
      JSON.stringify({ nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
                       horarioResumo: null, whatsappContato: '11988887777' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchFalso);
    headersMock.mockReturnValue(new Headers({ host: 'brutus.usemarcai.online' }));

    const { barbeariaAtual } = await import('@/lib/tenant');
    await barbeariaAtual();

    // A barra final da variável sai, como no `next.config.ts`.
    expect(fetchFalso.mock.calls[0][0]).toBe('http://api:8000/api/barbearia');
    // Nesse salto o Host vira `api:8000`, que não é barbearia nenhuma: o
    // Django só acha o tenant pelo `HostDoProxyMiddleware`, com o segredo.
    const enviados = new Headers(fetchFalso.mock.calls[0][1]?.headers);
    expect(enviados.get('x-marcai-host')).toBe('brutus.usemarcai.online');
    expect(enviados.get('x-marcai-proxy')).toBe('s3gredo');
  });

  // Espelha o `proxy.ts`: sem segredo, nenhum cabeçalho — um `x-marcai-host`
  // sem segredo o Django ignora de qualquer jeito, e mandá-lo sugeriria que
  // ele vale alguma coisa.
  it('com API_INTERNA_URL mas sem PROXY_SEGREDO, não inventa cabeçalho', async () => {
    vi.stubEnv('API_INTERNA_URL', 'http://api:8000');
    vi.stubEnv('PROXY_SEGREDO', '');
    const fetchFalso = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ nome: 'X', endereco: '', horarioResumo: null, whatsappContato: '' }),
                   { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    headersMock.mockReturnValue(new Headers({ host: 'brutus.usemarcai.online' }));

    const { barbeariaAtual } = await import('@/lib/tenant');
    await barbeariaAtual();

    const enviados = new Headers(fetchFalso.mock.calls[0][1]?.headers);
    expect(enviados.get('x-marcai-host')).toBeNull();
    expect(enviados.get('x-marcai-proxy')).toBeNull();
  });

  it('monta a origem do Django a partir do host da requisicao', async () => {
    const fetchFalso = vi.fn(async (_url: string) => new Response(
      JSON.stringify({ nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
                       horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchFalso);
    headersMock.mockReturnValue(new Headers({ host: 'brutus.localhost:3000' }));

    const { barbeariaAtual } = await import('@/lib/tenant');
    const b = await barbeariaAtual();

    expect(b.nome).toBe('BRUTUS');
    // A PORTA muda, o HOST nao: e assim que dontony.localhost:3000 cai em
    // dontony.localhost:8000 sem nenhuma lista de tenants no front.
    expect(fetchFalso.mock.calls[0][0]).toBe('http://brutus.localhost:8000/api/barbearia');
  });

  it('vira notFound quando o Django responde 404', async () => {
    const fetchFalso = vi.fn(async (_url: string) => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchFalso);
    headersMock.mockReturnValue(new Headers({ host: 'naoexiste.localhost:3000' }));

    const { barbeariaAtual } = await import('@/lib/tenant');

    await expect(barbeariaAtual()).rejects.toThrow('NEXT_NOT_FOUND');
    // A propriedade que este arquivo existe para provar: a origem e' POR
    // HOST, nao um valor fixo. Um `buscarNoDjango` que fosse sempre a
    // 'http://brutus.localhost:8000' passaria no teste de cima sozinho —
    // aqui, um host DIFERENTE tem que produzir uma origem DIFERENTE.
    expect(fetchFalso.mock.calls[0][0]).toBe('http://naoexiste.localhost:8000/api/barbearia');
  });

  it('um 5xx do Django NAO e tratado como barbearia inexistente', async () => {
    // Diferença deliberada do 404 acima: uma queda do Django não pode
    // aparecer para o cliente como "essa barbearia não existe" — os dois
    // erros têm causas e remédios diferentes. Uma única chamada: `cache()`
    // do React memoiza, então invocar de novo no mesmo teste reusaria a
    // mesma promise em vez de provar algo novo.
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => new Response('', { status: 500 })));
    headersMock.mockReturnValue(new Headers({ host: 'brutus.localhost:3000' }));

    const { barbeariaAtual } = await import('@/lib/tenant');

    await expect(barbeariaAtual()).rejects.toThrow('500');
  });
});
