import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { numeroExiste, enviarTexto, _limparCaches } from '@/lib/whatsapp';

beforeEach(() => {
  _limparCaches();
  process.env.EVOLUTION_API_URL = 'http://evolution.teste';
  process.env.EVOLUTION_INSTANCE = 'brutus';
  process.env.EVOLUTION_API_KEY = 'chave';
});
afterEach(() => vi.restoreAllMocks());

describe('numeroExiste', () => {
  it('exists true → existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: true, jid: 'x' }],
    }));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('existe');
  });

  it('exists false → nao_existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: false }],
    }));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('nao_existe');
  });

  it('API fora do ar → indeterminado (nunca bloqueia)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('indeterminado');
  });

  it('sem EVOLUTION_API_URL → indeterminado, sem chamada de rede', async () => {
    process.env.EVOLUTION_API_URL = '';
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('indeterminado');
    expect(spy).not.toHaveBeenCalled();
  });

  it('segunda consulta do mesmo número usa cache', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ exists: true }] });
    vi.stubGlobal('fetch', spy);
    await numeroExiste('11977771234', '1.1.1.1');
    await numeroExiste('11977771234', '1.1.1.1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('estourado o limite por IP, devolve indeterminado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: true }],
    }));
    for (let i = 0; i < 10; i++) await numeroExiste(`1197777${1000 + i}`, '2.2.2.2');
    expect(await numeroExiste('11999990000', '2.2.2.2')).toBe('indeterminado');
  });
});

describe('enviarTexto', () => {
  it('não lança quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fora do ar')));
    await expect(enviarTexto('11977771234', 'oi')).resolves.toBeUndefined();
  });
});
