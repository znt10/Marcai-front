import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lerMeusDados, salvarMeusDados, esquecerMeusDados } from '@/lib/meus-dados';

/// O par de `rascunho.ts`, e a diferenca entre os dois e' a VIDA do dado:
/// o rascunho atravessa a ida ao calendario e morre quando a aba fecha; este
/// atravessa VISITAS, para quem ja' marcou uma vez nao redigitar nome e
/// telefone na proxima.

const memoria = () => {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => { dados.set(k, v); },
    removeItem: (k: string) => { dados.delete(k); },
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', memoria());
});

describe('os meus dados guardados entre visitas', () => {
  it('devolve nulo quando nunca marcou nada', () => {
    expect(lerMeusDados()).toBeNull();
  });

  it('lembra o que foi salvo', () => {
    salvarMeusDados({ nome: 'Jose Cicero', whats: '(83) 9 8221-7869' });
    expect(lerMeusDados()).toEqual({ nome: 'Jose Cicero', whats: '(83) 9 8221-7869' });
  });

  it('esquece quando mandam esquecer', () => {
    // E' o botao "nao e voce?" da tela. Sem ele, o balcao da barbearia — um
    // aparelho so' — ficaria com o telefone do cliente anterior esperando o
    // proximo, que foi o motivo de o rascunho nunca ter sido localStorage.
    salvarMeusDados({ nome: 'Jose', whats: '83982217869' });
    esquecerMeusDados();
    expect(lerMeusDados()).toBeNull();
  });

  it('recusa o que esta guardado com a forma errada', () => {
    // Versao anterior do app, ou edicao a mao. Prefilar o campo com
    // `undefined` seria pior que nao lembrar.
    localStorage.setItem('marcai:meus-dados', JSON.stringify({ nome: 42 }));
    expect(lerMeusDados()).toBeNull();
  });

  it('nao guarda nada quando os dois campos estao vazios', () => {
    salvarMeusDados({ nome: '  ', whats: '' });
    expect(lerMeusDados()).toBeNull();
  });

  it('nao quebra quando o localStorage LANCA', () => {
    // Aba anonima e "bloquear dados de sites" fazem o proprio acesso lancar.
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
      removeItem: () => { throw new Error('bloqueado'); },
    });
    expect(() => salvarMeusDados({ nome: 'x', whats: 'y' })).not.toThrow();
    expect(lerMeusDados()).toBeNull();
    expect(() => esquecerMeusDados()).not.toThrow();
  });
});
