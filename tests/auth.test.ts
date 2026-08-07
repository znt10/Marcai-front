import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { hash } from '@node-rs/argon2';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao, lerSessao, type Sessao } from '@/lib/auth';
import { estaTravado, aposFalha, LIMPO } from '@/lib/trava-barbeiro';
import { BARBEIRO_TRAVA_TENTATIVAS, BARBEIRO_TRAVA_MIN } from '@/lib/config';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as eu } from '@/app/api/auth/eu/route';
import {
  emitirSessao as emitirAdmin, lerSessao as lerAdmin, COOKIE_ADMIN,
} from '@/lib/admin-sessao';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
  process.env.ADMIN_JWT_SECRET  = 'segredo-do-admin-com-mais-de-32-bytes-aqui';
});

/// Sem isto, a segunda chamada de montarCenarioBrutus() estoura o slug único
/// — e o `limparBanco` também zera o cache de slug→Barbearia, que guardaria um
/// id que o TRUNCATE acabou de apagar.
beforeEach(limparBanco);

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

const pedidoLogin = (corpo: unknown, host = 'brutus') =>
  new Request(`http://${host}.localhost/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-barbearia-slug': host },
    body: JSON.stringify(corpo),
  });

/// Cenário com o Téo já com senha — o do seed nasce sem, de propósito.
async function comSenhaDoTeo() {
  const ctx = await montarCenarioBrutus();
  await prismaOwner.barbeiro.update({
    where: { id: ctx.teo.id }, data: { senhaHash: await hash('senha-do-teo') },
  });
  return ctx;
}

describe('POST /api/auth/login', () => {
  it('celular e senha certos devolvem cookie de sessão', async () => {
    await comSenhaDoTeo();
    const res = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'senha-do-teo' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('sessao=');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('senha errada responde o mesmo que celular inexistente', async () => {
    await comSenhaDoTeo();
    const errada = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'chutando' }));
    const inexistente = await login(pedidoLogin({ whatsapp: '11900000000', senha: 'chutando' }));

    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(await errada.json()).toEqual(await inexistente.json());
  });

  it('barbeiro sem senha ainda não entra', async () => {
    await montarCenarioBrutus();   // Téo e Rael nascem com senhaHash nulo
    const res = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'qualquer' }));
    expect(res.status).toBe(401);
  });

  it('cinco erros travam a conta', async () => {
    const ctx = await comSenhaDoTeo();
    for (let i = 0; i < BARBEIRO_TRAVA_TENTATIVAS; i++) {
      await login(pedidoLogin({ whatsapp: '11911112222', senha: 'chutando' }));
    }
    // Agora nem a senha certa entra.
    const res = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'senha-do-teo' }));
    expect(res.status).toBe(429);

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.teo.id } });
    expect(depois.bloqueadoAte).not.toBeNull();
  });

  it('acertar zera o contador', async () => {
    const ctx = await comSenhaDoTeo();
    await login(pedidoLogin({ whatsapp: '11911112222', senha: 'chutando' }));
    await login(pedidoLogin({ whatsapp: '11911112222', senha: 'senha-do-teo' }));

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.teo.id } });
    expect(depois.tentativasLogin).toBe(0);
  });
});

const comCookie = (host: string, cookie: string) =>
  new Request(`http://${host}.localhost/api/auth/eu`, {
    headers: { 'x-barbearia-slug': host, cookie },
  });

describe('os dois cruzamentos', () => {
  it('cookie da BRUTUS não vale no host da Dom Tony', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    await prismaOwner.barbearia.create({
      data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
              horarioResumo: 'ter a sáb', whatsappContato: '11977778888' },
    });

    const jwt = await emitirSessao({ sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0 });

    // No host certo, abre.
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(200);

    // No host errado, 401 — assinatura válida, não expirado, barbeiro
    // existente. É o `bid` que recusa, e é o pior bug do multi-tenant.
    const cruzado = await eu(comCookie('dontony', `sessao=${jwt}`));
    expect(cruzado.status).toBe(401);
    expect(cruzado.headers.get('set-cookie')).toContain('sessao=;');
  });

  it('cookie de admin não abre rota do painel', async () => {
    await montarCenarioBrutus();
    const doAdmin = await emitirAdmin();
    expect((await eu(comCookie('brutus', `sessao=${doAdmin}`))).status).toBe(401);
    expect((await eu(comCookie('brutus', `${COOKIE_ADMIN}=${doAdmin}`))).status).toBe(401);
  });

  it('cookie de barbeiro não abre sessão de admin', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    const jwt = await emitirSessao({ sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0 });
    expect(await lerAdmin(jwt)).toBe(false);
  });

  it('tokenVersion incrementado derruba a sessão já emitida', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    const jwt = await emitirSessao({ sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0 });
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(200);

    await prismaOwner.barbeiro.update({
      where: { id: teo.id }, data: { tokenVersion: { increment: 1 } },
    });
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(401);
  });

  it('barbeiro desativado perde a sessão', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    const jwt = await emitirSessao({ sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0 });
    await prismaOwner.barbeiro.update({ where: { id: teo.id }, data: { ativo: false } });
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(401);
  });
});
