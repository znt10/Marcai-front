import { describe, it, expect } from 'vitest';
import { extrairSlug } from '@/lib/tenant';

describe('extrairSlug', () => {
  it.each([
    ['brutus.seuapp.com.br',      'seuapp.com.br', 'brutus'],
    ['brutus.localhost:3000',     'localhost',     'brutus'],
    ['dontony.localhost',         'localhost',     'dontony'],
  ])('%s → %s', (host, base, esperado) => {
    expect(extrairSlug(host, base)).toBe(esperado);
  });

  it.each([
    ['seuapp.com.br',       'seuapp.com.br', 'domínio nu'],
    ['localhost:3000',      'localhost',     'localhost puro'],
    ['www.seuapp.com.br',   'seuapp.com.br', 'reservado www'],
    ['api.seuapp.com.br',   'seuapp.com.br', 'reservado api'],
    ['painel.seuapp.com.br','seuapp.com.br', 'reservado painel'],
    ['outrodominio.com',    'seuapp.com.br', 'domínio alheio'],
    ['BRUTUS!.localhost',   'localhost',     'slug inválido'],
  ])('%s não resolve (%s)', (host, base) => {
    expect(extrairSlug(host, base)).toBeNull();
  });
});
