import { describe, it, expect } from 'vitest';
import { formatarPreco } from '@/lib/dinheiro';

describe('formatarPreco', () => {
  it.each([
    [4500, 'R$ 45,00'],
    [100, 'R$ 1,00'],
    [50, 'R$ 0,50'],
    [999999, 'R$ 9.999,99'],
  ])('%i centavos vira %s', (centavos, esperado) => {
    expect(formatarPreco(centavos)).toBe(esperado);
  });
});
