import { describe, it, expect } from 'vitest';
import { normalizar, formatar } from '@/lib/telefone';

describe('normalizar', () => {
  it.each([
    ['(11) 9 7777-1234', '11977771234'],
    ['11977771234',      '11977771234'],
    ['+55 11 97777-1234','11977771234'],
    ['5511977771234',    '11977771234'],
    ['(11) 3333-4444',   '1133334444'],
  ])('%s vira %s', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it.each([
    ['119777712', 'curto demais'],
    ['119777712345', 'longo demais'],
    ['0977771234', 'DDD inválido'],
    ['abc', 'texto puro'],
    ['', 'vazio'],
  ])('%s é rejeitado (%s)', (entrada) => {
    expect(normalizar(entrada)).toBeNull();
  });
});

describe('formatar', () => {
  it('formata celular', () => {
    expect(formatar('11977771234')).toBe('(11) 9 7777-1234');
  });
  it('formata fixo', () => {
    expect(formatar('1133334444')).toBe('(11) 3333-4444');
  });
});
