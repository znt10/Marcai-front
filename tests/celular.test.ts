import { describe, it, expect } from 'vitest';
import { celular, normalizar } from '@/lib/telefone';

/// Espelha `tests/test_celular.py` do back, caso a caso. As duas regras
/// precisam concordar: o front decide se o botao "confirmar" acende, o Django
/// decide se o agendamento existe. Divergir aqui e' um botao que acende e uma
/// API que recusa — ou pior, o contrario.

describe('celular (a regra estrita do agendamento publico)', () => {
  it.each(['83982217869', '(83) 9 8221-7869', '+55 83 98221-7869', '5583982217869'])(
    'aceita %s', (entrada) => {
      expect(celular(entrada)).toBe('83982217869');
    });

  it('recusa fixo, ainda que normalizar aceite', () => {
    // O controle negativo: sem a primeira linha, este teste nao distingue
    // "a regra nova pegou" de "a regra velha ja pegava".
    expect(normalizar('8332217869')).toBe('8332217869');
    expect(celular('8332217869')).toBeNull();
  });

  it.each(['20', '23', '25', '26', '29', '30', '60', '70', '72', '76', '78', '90'])(
    'recusa o DDD %s, que nao existe', (ddd) => {
      expect(normalizar(`${ddd}982217869`)).toBe(`${ddd}982217869`);
      expect(celular(`${ddd}982217869`)).toBeNull();
    });

  it.each(['11', '99', '83', '21', '68'])('aceita o DDD %s', (ddd) => {
    expect(celular(`${ddd}982217869`)).toBe(`${ddd}982217869`);
  });

  it.each(['8398221786', '839822178690', '83882217869', '', 'nao e numero'])(
    'recusa %s', (ruim) => {
      expect(celular(ruim)).toBeNull();
    });
});
