import { describe, it, expect, beforeEach } from 'vitest';
import { lerRascunho, salvarRascunho, limparRascunho } from '@/lib/rascunho';

/// O que se guarda aqui é o modo de falha que o cliente relatou: ir ao
/// calendário e voltar com o nome e o telefone apagados. Cada ida é um
/// carregamento inteiro de página (todo link do produto é `<a href>`), e sem
/// isto o estado do React morre junto.
///
/// A suíte roda em `node`, sem DOM, então o armazenamento é de mentira aqui.
/// Não vale a pena arrastar jsdom para o projeto por causa de quatro métodos —
/// e o dublê tem a vantagem de deixar a borda que mais importa (o
/// `sessionStorage` que LANÇA) ser escrita como um caso de teste comum.
const CHAVE = 'rascunho-agendamento';

class Armazem {
  mapa = new Map<string, string>();
  lanca = false;
  private confere() { if (this.lanca) throw new Error('acesso negado ao armazenamento'); }
  getItem(k: string) { this.confere(); return this.mapa.get(k) ?? null; }
  setItem(k: string, v: string) { this.confere(); this.mapa.set(k, v); }
  removeItem(k: string) { this.confere(); this.mapa.delete(k); }
}

let armazem: Armazem;
beforeEach(() => {
  armazem = new Armazem();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = armazem;
});

describe('rascunho do agendamento', () => {
  it('devolve vazio quando nunca se digitou nada', () => {
    expect(lerRascunho()).toEqual({ nome: '', whats: '' });
  });

  it('atravessa o carregamento de página', () => {
    salvarRascunho({ nome: 'Maria Teste', whats: '(83) 9 8801-0990' });
    // `lerRascunho` não guarda nada em memória: lê do armazenamento da aba,
    // que é justamente o que sobrevive ao `<a href>`.
    expect(lerRascunho()).toEqual({ nome: 'Maria Teste', whats: '(83) 9 8801-0990' });
  });

  it('sai da aba quando o agendamento confirma', () => {
    // O balcão é um aparelho só: o próximo cliente não pode achar o telefone
    // do anterior no formulário.
    salvarRascunho({ nome: 'Maria', whats: '83988010990' });
    limparRascunho();
    expect(lerRascunho()).toEqual({ nome: '', whats: '' });
  });

  it('não deixa lixo quando a pessoa apaga os dois campos', () => {
    salvarRascunho({ nome: 'Maria', whats: '83988010990' });
    salvarRascunho({ nome: '', whats: '' });
    expect(armazem.mapa.has(CHAVE)).toBe(false);
  });

  it('guarda um campo só, se for só um que está preenchido', () => {
    salvarRascunho({ nome: 'Maria', whats: '' });
    expect(lerRascunho()).toEqual({ nome: 'Maria', whats: '' });
  });

  // ---- As bordas que quebrariam o formulário na cara do cliente ----

  it('sobrevive a conteúdo corrompido no armazenamento', () => {
    armazem.mapa.set(CHAVE, 'isto não é json');
    expect(lerRascunho()).toEqual({ nome: '', whats: '' });
  });

  it('recusa tipo que não é string', () => {
    // Versão anterior do app, ou alguém editando o armazenamento à mão: um
    // número aqui viraria `.trim is not a function` na hora de habilitar o
    // botão de confirmar.
    armazem.mapa.set(CHAVE, JSON.stringify({ nome: 42, whats: null }));
    expect(lerRascunho()).toEqual({ nome: '', whats: '' });
  });

  it('esquece em vez de quebrar quando o armazenamento lança', () => {
    // Aba anônima, cookies de terceiros bloqueados, disco cheio: o próprio
    // `sessionStorage` lança. Formulário que quebra ao ser digitado é muito
    // pior do que um que esquece.
    armazem.lanca = true;
    expect(() => salvarRascunho({ nome: 'Maria', whats: '83988010990' })).not.toThrow();
    expect(lerRascunho()).toEqual({ nome: '', whats: '' });
    expect(() => limparRascunho()).not.toThrow();
  });
});
