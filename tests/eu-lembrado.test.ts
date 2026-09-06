import { describe, it, expect, beforeEach } from 'vitest';
import { lembrado, lembrar, esquecer } from '@/lib/eu-lembrado';
import type { Eu } from '@/lib/api';

/// O que se guarda aqui e' o pisca que o dono relatou: a cada carga inteira de
/// pagina, o painel nao sabia quem era ele ate' `/api/auth/eu` responder — a
/// barra de secoes nascia vazia, o nome em branco, a tela dizendo
/// "carregando…", e entao tudo aparecia de uma vez.
///
/// A suite roda em `node`, sem DOM, entao o armazenamento e' de mentira aqui —
/// mesma forma de `tests/rascunho.test.ts`. O duble tem a vantagem de deixar a
/// borda que mais importa (o `localStorage` que LANCA: aba anonima, dado de
/// site bloqueado, e o proprio servidor, onde a referencia nem existe) ser
/// escrita como um caso de teste comum.
const CHAVE = 'marcai:eu';

class Armazem {
  mapa = new Map<string, string>();
  lanca = false;
  private confere() { if (this.lanca) throw new Error('acesso negado ao armazenamento'); }
  getItem(k: string) { this.confere(); return this.mapa.get(k) ?? null; }
  setItem(k: string, v: string) { this.confere(); this.mapa.set(k, v); }
  removeItem(k: string) { this.confere(); this.mapa.delete(k); }
}

const EU: Eu = { id: 'b1', nome: 'Téo', papel: 'DONO', fotoUrl: null };

let armazem: Armazem;
beforeEach(() => {
  armazem = new Armazem();
  (globalThis as { localStorage?: unknown }).localStorage = armazem;
});

describe('eu lembrado', () => {
  it('devolve quem foi guardado', () => {
    lembrar(EU);
    expect(lembrado()).toEqual(EU);
  });

  it('sem nada guardado, nao lembra de ninguem', () => {
    expect(lembrado()).toBeNull();
  });

  it('esquecer apaga', () => {
    lembrar(EU);
    esquecer();
    expect(lembrado()).toBeNull();
  });
});

describe('eu lembrado — o valor nao confiavel', () => {
  // Estes sao o motivo de existir `saneado`. Sem ele, um valor pela metade
  // pinta `undefined` no lugar do nome na barra de topo — que e' PIOR que o
  // pisca, porque mostra coisa errada em vez de nao mostrar nada.
  it('JSON quebrado nao derruba, so nao lembra', () => {
    armazem.mapa.set(CHAVE, '{ isto nao e json');
    expect(lembrado()).toBeNull();
  });

  it('objeto sem os campos obrigatorios nao lembra', () => {
    armazem.mapa.set(CHAVE, JSON.stringify({ nome: 'Téo' }));
    expect(lembrado()).toBeNull();
  });

  it('papel que nao existe nao lembra', () => {
    // O caso da edicao a mao: alguem trocando o papel para se ver como dono.
    // Aqui isso nem chega a pintar; e mesmo que chegasse, quem decide papel e'
    // o servidor, que nunca consulta este armazenamento.
    armazem.mapa.set(CHAVE, JSON.stringify({ ...EU, papel: 'PRESIDENTE' }));
    expect(lembrado()).toBeNull();
  });

  it('fotoUrl de tipo errado vira null em vez de contaminar a tela', () => {
    armazem.mapa.set(CHAVE, JSON.stringify({ ...EU, fotoUrl: 42 }));
    expect(lembrado()).toEqual({ ...EU, fotoUrl: null });
  });
});

describe('eu lembrado — armazenamento que lanca', () => {
  // Aba anonima, dado de site bloqueado, e o SERVIDOR (onde `localStorage` nem
  // e' uma variavel). Nos tres o painel tem de voltar a funcionar como antes
  // deste arquivo existir — piscando, mas inteiro.
  it('ler nao propaga a excecao', () => {
    armazem.lanca = true;
    expect(() => lembrado()).not.toThrow();
    expect(lembrado()).toBeNull();
  });

  it('guardar nao propaga a excecao', () => {
    armazem.lanca = true;
    expect(() => lembrar(EU)).not.toThrow();
  });

  it('esquecer nao propaga a excecao', () => {
    armazem.lanca = true;
    expect(() => esquecer()).not.toThrow();
  });
});
