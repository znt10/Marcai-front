import { describe, it, expect } from 'vitest';
import { TIPOS, VOCABULARIO, vocabulario } from '@/lib/tipos';

/// As palavras de cada ramo (spec 2026-10-08). A barbearia é o texto de
/// antes, e o resto tem de vir com artigo e gênero certos.

describe('vocabulario', () => {
  it('tipo vazio ou desconhecido é a barbearia de sempre', () => {
    expect(vocabulario(undefined)).toBe(VOCABULARIO.BARBEARIA);
    expect(vocabulario(null)).toBe(VOCABULARIO.BARBEARIA);
    expect(vocabulario('MANICURE')).toBe(VOCABULARIO.BARBEARIA);
  });

  it('todo tipo tem todas as palavras, e nenhuma vazia', () => {
    const campos = Object.keys(VOCABULARIO.BARBEARIA);
    for (const t of TIPOS) {
      expect(Object.keys(VOCABULARIO[t]).sort()).toEqual([...campos].sort());
      for (const [campo, valor] of Object.entries(VOCABULARIO[t])) {
        if (typeof valor === 'string') expect(valor, `${t}.${campo}`).not.toBe('');
      }
    }
  });

  it('o artigo antes do nome: "na Brutus", "no estúdio Ana"', () => {
    expect(vocabulario('BARBEARIA').noNome('Brutus')).toBe('na Brutus');
    expect(vocabulario('SOBRANCELHA').noNome('Ana Sobrancelhas')).toBe('no estúdio Ana Sobrancelhas');
    expect(vocabulario('OUTRO').noNome('Lu Unhas')).toBe('no espaço Lu Unhas');
  });

  it('a profissional do estúdio é ela', () => {
    const v = vocabulario('SOBRANCELHA');
    expect([v.oProf, v.noProf, v.nenhumProf, v.dele])
      .toEqual(['a profissional', 'na profissional', 'nenhuma profissional', 'dela']);
  });

  it('só a barbearia fala de barbeiro, barbearia ou corte', () => {
    for (const t of ['SOBRANCELHA', 'OUTRO'] as const) {
      const v = VOCABULARIO[t];
      const tudo = JSON.stringify(v) + v.noNome('X');
      expect(tudo).not.toMatch(/barb|corte/i);
    }
  });
});
