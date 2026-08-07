import { describe, it, expect, beforeAll } from 'vitest';
import { emitirSessao, lerSessao, type Sessao } from '@/lib/auth';
import { estaTravado, aposFalha, LIMPO } from '@/lib/trava-barbeiro';
import { BARBEIRO_TRAVA_TENTATIVAS, BARBEIRO_TRAVA_MIN } from '@/lib/config';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
  process.env.ADMIN_JWT_SECRET  = 'segredo-do-admin-com-mais-de-32-bytes-aqui';
});

const sessao: Sessao = {
  sub: '11111111-1111-1111-1111-111111111111',
  bid: '22222222-2222-2222-2222-222222222222',
  papel: 'BARBEIRO',
  tv: 0,
};

describe('sessão do barbeiro', () => {
  it('o que é emitido volta inteiro', async () => {
    expect(await lerSessao(await emitirSessao(sessao))).toEqual(sessao);
  });

  it('cookie ausente não é sessão', async () => {
    expect(await lerSessao(undefined)).toBeNull();
  });

  it('token adulterado é recusado', async () => {
    const jwt = await emitirSessao(sessao);
    expect(await lerSessao(jwt.slice(0, -2) + 'xx')).toBeNull();
  });

  // O mecanismo por trás do teste cruzado da Tarefa 4: os dois segredos são
  // diferentes, então nem o painel lê cookie de admin nem o contrário.
  it('token assinado com o segredo do admin não abre o painel', async () => {
    const { SignJWT } = await import('jose');
    const doAdmin = await new SignJWT({ bid: sessao.bid, papel: 'DONO', tv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sessao.sub)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET));
    expect(await lerSessao(doAdmin)).toBeNull();
  });
});

describe('trava por barbeiro', () => {
  const agora = new Date('2026-08-07T12:00:00Z');

  it('barbeiro sem bloqueio não está travado', () => {
    expect(estaTravado({ bloqueadoAte: null }, agora)).toBe(false);
  });

  it('bloqueio que já venceu não trava', () => {
    const antes = new Date(agora.getTime() - 60_000);
    expect(estaTravado({ bloqueadoAte: antes }, agora)).toBe(false);
  });

  it('bloqueio no futuro trava', () => {
    const depois = new Date(agora.getTime() + 60_000);
    expect(estaTravado({ bloqueadoAte: depois }, agora)).toBe(true);
  });

  it('errar antes do limite só conta', () => {
    expect(aposFalha(0, agora)).toEqual({ tentativasLogin: 1, bloqueadoAte: null });
  });

  it('a quinta falha bloqueia por 15 minutos', () => {
    const r = aposFalha(BARBEIRO_TRAVA_TENTATIVAS - 1, agora);
    expect(r.tentativasLogin).toBe(BARBEIRO_TRAVA_TENTATIVAS);
    expect(r.bloqueadoAte).not.toBeNull();
    const min = (r.bloqueadoAte!.getTime() - agora.getTime()) / 60_000;
    expect(Math.round(min)).toBe(BARBEIRO_TRAVA_MIN);
  });

  it('acertar zera tudo', () => {
    expect(LIMPO).toEqual({ tentativasLogin: 0, bloqueadoAte: null });
  });
});
