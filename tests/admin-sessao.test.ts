import { describe, it, expect, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { conferirSenha, emitirSessao, lerSessao } from '@/lib/admin-sessao';

beforeAll(async () => {
  process.env.ADMIN_USUARIO = 'dono';
  process.env.ADMIN_SENHA_HASH = await hash('senha-longa-de-teste');
  process.env.ADMIN_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-aqui';
});

describe('conferirSenha', () => {
  it('aceita usuário e senha corretos', async () => {
    await expect(conferirSenha('dono', 'senha-longa-de-teste')).resolves.toBe(true);
  });

  it('recusa senha errada', async () => {
    await expect(conferirSenha('dono', 'outra')).resolves.toBe(false);
  });

  it('recusa usuário errado', async () => {
    await expect(conferirSenha('ninguem', 'senha-longa-de-teste')).resolves.toBe(false);
  });

  it('usuário inexistente demora o mesmo que senha errada', async () => {
    const cronometrar = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };
    // Aquece: a primeira chamada carrega o binário do argon2 e distorceria a
    // medição do ramo que rodasse primeiro.
    await conferirSenha('dono', 'x');
    await conferirSenha('ninguem', 'x');

    const comUsuarioErrado = await cronometrar(() => conferirSenha('ninguem', 'x'));
    const comSenhaErrada = await cronometrar(() => conferirSenha('dono', 'x'));
    // O verify roda nos dois casos; a diferença tem que ser ruído, não sinal.
    const razao = Math.max(comUsuarioErrado, comSenhaErrada) /
                  Math.min(comUsuarioErrado, comSenhaErrada);
    expect(razao).toBeLessThan(3);
  });
});

describe('sessão', () => {
  it('o token emitido é aceito de volta', async () => {
    await expect(lerSessao(await emitirSessao())).resolves.toBe(true);
  });

  it('recusa lixo', async () => {
    await expect(lerSessao('nao-e-um-jwt')).resolves.toBe(false);
  });

  it('recusa ausência de token', async () => {
    await expect(lerSessao(undefined)).resolves.toBe(false);
  });

  it('recusa token assinado com outro segredo', async () => {
    const bom = await emitirSessao();
    const original = process.env.ADMIN_JWT_SECRET;
    process.env.ADMIN_JWT_SECRET = 'um-segredo-completamente-diferente-32b!';
    await expect(lerSessao(bom)).resolves.toBe(false);
    process.env.ADMIN_JWT_SECRET = original;
  });
});
