import { describe, it, expect } from 'vitest';
import {
  NOME_DA_CATEGORIA, daCategoria, slugDaCategoria, tipoDaCategoria,
} from '@/lib/categorias';
import { TIPOS } from '@/lib/tipos';

/// O admin separado por ramo: a entrada lista as categorias, e cada uma
/// mostra só os seus.

describe('endereço da categoria', () => {
  it('ida e volta para todo tipo', () => {
    for (const t of TIPOS) expect(tipoDaCategoria(slugDaCategoria(t))).toBe(t);
  });

  it('o endereço é em minúscula', () => {
    expect(slugDaCategoria('SOBRANCELHA')).toBe('sobrancelha');
  });

  it('o que não é tipo não é categoria', () => {
    expect(tipoDaCategoria('manicure')).toBeNull();
    expect(tipoDaCategoria('BARBEARIA')).toBeNull();
    expect(tipoDaCategoria('')).toBeNull();
  });

  it('toda categoria tem nome', () => {
    for (const t of TIPOS) expect(NOME_DA_CATEGORIA[t]).toBeTruthy();
  });
});

describe('daCategoria', () => {
  const lista = [
    { slug: 'brutus', tipo: 'BARBEARIA' as const },
    { slug: 'ana', tipo: 'SOBRANCELHA' as const },
    { slug: 'antiga' },
  ];

  it('só os do tipo', () => {
    expect(daCategoria(lista, 'SOBRANCELHA').map((b) => b.slug)).toEqual(['ana']);
    expect(daCategoria(lista, 'OUTRO')).toEqual([]);
  });

  it('sem tipo (back de antes) conta como barbearia', () => {
    expect(daCategoria(lista, 'BARBEARIA').map((b) => b.slug)).toEqual(['brutus', 'antiga']);
  });
});
