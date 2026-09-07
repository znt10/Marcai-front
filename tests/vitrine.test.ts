import { describe, it, expect, vi } from 'vitest';

// `next/headers` so existe dentro do runtime do Next, e `vitrine.ts` o
// arrasta por importar `./tenant`. O que se prova aqui NAO depende de rede:
// e' o pareamento entre a equipe e o cardapio de cada um.
vi.mock('next/headers', () => ({ headers: () => new Map() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

const { blocosDeCardapio } = await import('@/lib/vitrine');

const barbeiro = (id: string, nome: string) => ({ id, nome, fotoUrl: null });
const servico = (nome: string, precoCentavos: number | null) => ({
  id: nome, nome, duracaoMin: 30, precoCentavos,
});

describe('os blocos de preco por barbeiro da vitrine', () => {
  it('junta cada barbeiro com o cardapio DELE, na ordem da equipe', () => {
    const blocos = blocosDeCardapio(
      [barbeiro('a', 'Jose cicero'), barbeiro('b', 'Val')],
      [[servico('cabelo', 2200)], [servico('cabelo', 4000)]],
    );

    expect(blocos.map((b) => b.barbeiro.nome)).toEqual(['Jose cicero', 'Val']);
    // O ponto da tela inteira: o MESMO servico com precos diferentes.
    expect(blocos[0].servicos[0].precoCentavos).toBe(2200);
    expect(blocos[1].servicos[0].precoCentavos).toBe(4000);
  });

  it('tira da lista o barbeiro que nao faz servico nenhum', () => {
    // Um bloco vazio com o nome em cima diria "este barbeiro nao faz nada",
    // que nao e' o que "ninguem cadastrou os servicos dele" quer dizer.
    const blocos = blocosDeCardapio(
      [barbeiro('a', 'Jose cicero'), barbeiro('b', 'Recem-chegado')],
      [[servico('cabelo', 2200)], []],
    );

    expect(blocos.map((b) => b.barbeiro.nome)).toEqual(['Jose cicero']);
  });

  it('mantem o servico sem preco definido', () => {
    // Some o PRECO na tela (a pagina ja trata `precoCentavos === null`), nao
    // o servico: "faco barba, preco a combinar" e' informacao; sumir com a
    // barba e' esconder que ele faz.
    const blocos = blocosDeCardapio(
      [barbeiro('a', 'Jose cicero')],
      [[servico('barba', null)]],
    );

    expect(blocos[0].servicos).toHaveLength(1);
    expect(blocos[0].servicos[0].precoCentavos).toBeNull();
  });

  it('aguenta a lista de cardapios mais curta que a equipe', () => {
    // Defesa contra o desencontro de indices: se um fetch falhasse e a lista
    // viesse curta, o pareamento por posicao daria `undefined` e a pagina
    // quebraria no `.map` do bloco.
    const blocos = blocosDeCardapio([barbeiro('a', 'Jose'), barbeiro('b', 'Val')], [[servico('cabelo', 2200)]]);
    expect(blocos).toHaveLength(1);
  });
});
