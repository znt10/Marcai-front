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
  });

  it('monta a origem do Django a partir do host da requisicao', async () => {
    const fetchFalso = vi.fn(async () => new Response(
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    headersMock.mockReturnValue(new Headers({ host: 'naoexiste.localhost:3000' }));

    const { barbeariaAtual } = await import('@/lib/tenant');

    await expect(barbeariaAtual()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
