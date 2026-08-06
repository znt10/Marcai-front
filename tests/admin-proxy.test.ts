import { describe, it, expect } from 'vitest';
import { ehHostAdmin, extrairSlug } from '@/lib/slug';

describe('ehHostAdmin', () => {
  it('reconhece o host de admin', () => {
    expect(ehHostAdmin('admin.localhost:3000', 'localhost')).toBe(true);
  });

  it('o domínio nu NÃO é admin', () => {
    expect(ehHostAdmin('localhost:3000', 'localhost')).toBe(false);
  });

  it('subdomínio de barbearia NÃO é admin', () => {
    expect(ehHostAdmin('brutus.localhost:3000', 'localhost')).toBe(false);
  });

  it('admin de outro domínio NÃO é admin daqui', () => {
    expect(ehHostAdmin('admin.outrodominio.com', 'localhost')).toBe(false);
  });

  it('é indiferente a maiúsculas', () => {
    expect(ehHostAdmin('ADMIN.localhost', 'localhost')).toBe(true);
  });

  it('o host de admin não resolve tenant nenhum', () => {
    expect(extrairSlug('admin.localhost:3000', 'localhost')).toBeNull();
  });
});
