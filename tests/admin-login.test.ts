import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { esperaDe, registrarFalha, limparFalhas, falhasDe, _zerarTravas } from '@/lib/trava-ip';
import {
  ADMIN_TRAVA_BASE_MS, ADMIN_TRAVA_TETO_MS,
  ADMIN_TRAVA_TENTATIVAS, ADMIN_TRAVA_BLOQUEIO_MS,
} from '@/lib/config';
import { POST as login } from '@/app/api/admin/auth/login/route';

beforeAll(async () => {
  process.env.ADMIN_USUARIO = 'dono';
  process.env.ADMIN_SENHA_HASH = await hash('senha-longa-de-teste');
  process.env.ADMIN_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-aqui';
});

beforeEach(_zerarTravas);

const pedido = (corpo: unknown, ip = '10.0.0.1') =>
  new Request('http://admin.localhost/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(corpo),
  });

describe('trava por IP', () => {
  it('IP limpo não espera', () => {
    expect(esperaDe('10.0.0.1')).toBe(0);
  });

  it('a espera dobra a cada falha', () => {
    registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeGreaterThan(0);
    expect(esperaDe('10.0.0.1')).toBeLessThanOrEqual(ADMIN_TRAVA_BASE_MS);
    registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeGreaterThan(ADMIN_TRAVA_BASE_MS);
  });

  it('antes do limite, a espera fica no teto curto', () => {
    for (let i = 0; i < ADMIN_TRAVA_TENTATIVAS - 1; i++) registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeLessThanOrEqual(ADMIN_TRAVA_TETO_MS);
  });

  it('atingido o limite de tentativas, bloqueia por 10 minutos', () => {
    for (let i = 0; i < ADMIN_TRAVA_TENTATIVAS; i++) registrarFalha('10.0.0.1');
    const espera = esperaDe('10.0.0.1');
    expect(espera).toBeGreaterThan(ADMIN_TRAVA_TETO_MS);
    expect(espera).toBeLessThanOrEqual(ADMIN_TRAVA_BLOQUEIO_MS);
    expect(Math.round(espera / 60_000)).toBe(10);
  });

  it('errar mais ainda não estica além dos 10 minutos', () => {
    for (let i = 0; i < 40; i++) registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeLessThanOrEqual(ADMIN_TRAVA_BLOQUEIO_MS);
  });

  it('a trava é POR IP: um IP travado não afeta o outro', () => {
    for (let i = 0; i < 5; i++) registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.2')).toBe(0);
  });

  it('acerto limpa o contador', () => {
    registrarFalha('10.0.0.1');
    limparFalhas('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBe(0);
  });
});

describe('POST /api/admin/auth/login', () => {
  it('senha certa devolve 200 e planta o cookie', async () => {
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }));
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sessao_admin=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=lax');
  });

  it('senha errada devolve 401 sem cookie', async () => {
    const r = await login(pedido({ usuario: 'dono', senha: 'errada' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('usuário errado responde a MESMA coisa que senha errada', async () => {
    const a = await login(pedido({ usuario: 'ninguem', senha: 'x' }, '10.0.0.7'));
    const b = await login(pedido({ usuario: 'dono', senha: 'x' }, '10.0.0.8'));
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });

  it('depois de uma falha, o mesmo IP recebe 429', async () => {
    await login(pedido({ usuario: 'dono', senha: 'errada' }, '10.0.0.9'));
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }, '10.0.0.9'));
    expect(r.status).toBe(429);
  });

  it('a trava NÃO derruba a conta: outro IP entra normalmente', async () => {
    for (let i = 0; i < ADMIN_TRAVA_TENTATIVAS; i++) {
      await login(pedido({ usuario: 'dono', senha: 'errada' }, '10.0.0.9'));
    }
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }, '10.0.0.10'));
    expect(r.status).toBe(200);
  });

  it('ser barrado NÃO conta como nova falha', async () => {
    // Uma senha errada, e as seguintes morrem no 429 sem chegar ao argon2 —
    // então o contador não avança sozinho. Chegar ao bloqueio de 10 min exige
    // teimosia de verdade: esperar cada espera antes de errar de novo.
    await login(pedido({ usuario: 'dono', senha: 'errada' }, '10.0.0.11'));
    for (let i = 0; i < 4; i++) {
      await login(pedido({ usuario: 'dono', senha: 'errada' }, '10.0.0.11'));
    }
    expect(falhasDe('10.0.0.11')).toBe(1);
  });

  it('depois do limite, a resposta diz que está bloqueado por 10 min', async () => {
    // Direto no contador: pelo HTTP isso levaria 15 segundos de esperas.
    for (let i = 0; i < ADMIN_TRAVA_TENTATIVAS; i++) registrarFalha('10.0.0.12');
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }, '10.0.0.12'));
    expect(r.status).toBe(429);
    expect((await r.json()).erro).toContain('10 min');
  });
});
