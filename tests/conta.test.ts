import { describe, it, expect } from 'vitest';
import {
  separarHistorico, codigoValido, SENHA_MINIMA_CONTA, type ItemHistorico,
} from '@/lib/conta';

function item(codigo: string, inicio: string, status = 'CONFIRMADO'): ItemHistorico {
  return {
    codigo, servicoNome: 'Corte', barbeiroNome: 'Brutus',
    inicio, status, podeCancelar: false,
  };
}

const agora = new Date('2026-10-20T12:00:00Z');

describe('separarHistorico', () => {
  it('próximos em ordem crescente, passados em ordem decrescente', () => {
    const r = separarHistorico([
      item('f2', '2026-10-25T10:00:00Z'),
      item('p1', '2026-10-01T10:00:00Z'),
      item('f1', '2026-10-21T10:00:00Z'),
      item('p2', '2026-10-10T10:00:00Z'),
    ], agora);
    expect(r.proximos.map((i) => i.codigo)).toEqual(['f1', 'f2']);
    expect(r.passados.map((i) => i.codigo)).toEqual(['p2', 'p1']);
  });

  it('cancelado no futuro vai para os passados', () => {
    const r = separarHistorico([
      item('c', '2026-10-30T10:00:00Z', 'CANCELADO'),
      item('f', '2026-10-22T10:00:00Z'),
    ], agora);
    expect(r.proximos.map((i) => i.codigo)).toEqual(['f']);
    expect(r.passados.map((i) => i.codigo)).toEqual(['c']);
  });

  it('o instante exato de agora ainda é próximo', () => {
    const r = separarHistorico([item('x', agora.toISOString())], agora);
    expect(r.proximos).toHaveLength(1);
  });

  it('não muda a lista de entrada', () => {
    const entrada = [item('b', '2026-10-25T10:00:00Z'), item('a', '2026-10-22T10:00:00Z')];
    separarHistorico(entrada, agora);
    expect(entrada.map((i) => i.codigo)).toEqual(['b', 'a']);
  });
});

describe('codigoValido', () => {
  it('só seis dígitos', () => {
    expect(codigoValido('123456')).toBe(true);
    expect(codigoValido('12345')).toBe(false);
    expect(codigoValido('1234567')).toBe(false);
    expect(codigoValido('12345a')).toBe(false);
    expect(codigoValido('123 56')).toBe(false);
    expect(codigoValido('')).toBe(false);
    expect(codigoValido('123456\n')).toBe(false);
  });
});

it('senha mínima é 6', () => {
  expect(SENHA_MINIMA_CONTA).toBe(6);
});
