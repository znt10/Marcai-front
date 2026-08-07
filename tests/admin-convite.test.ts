import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verify } from '@node-rs/argon2';
import { prismaOwner, limparBanco } from './setup';
import { POST as reemitir } from '@/app/api/admin/barbearias/[id]/convite/route';
import { POST as definirSenha } from '@/app/api/auth/convite/[token]/route';
import { gerarConvite } from '@/lib/convite';

async function barbeariaComDono() {
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const convite = gerarConvite();
  const dono = await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO',
            senhaHash: null, conviteTokenHash: convite.hash, conviteExpiraEm: convite.expiraEm },
  });
  return { b, dono, token: convite.token };
}

beforeEach(limparBanco);

const paramsId = (id: string) => ({ params: Promise.resolve({ id }) });
const paramsToken = (token: string) => ({ params: Promise.resolve({ token }) });
const pedidoVazio = () => new Request('http://admin.localhost/x', { method: 'POST' });
const pedidoSenha = (senha: string) =>
  new Request('http://brutus.localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-barbearia-slug': 'brutus' },
    body: JSON.stringify({ senha }),
  });

describe('POST /api/admin/barbearias/[id]/convite', () => {
  it('reemite e invalida o token anterior', async () => {
    const { b, token: antigo } = await barbeariaComDono();
    const r = await reemitir(pedidoVazio(), paramsId(b.id));
    expect(r.status).toBe(200);
    expect((await r.json()).linkConvite).toContain('brutus.');

    const usarAntigo = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(antigo));
    expect(usarAntigo.status).toBe(404);
  });

  it('derruba a sessão do dono incrementando tokenVersion', async () => {
    const { b, dono } = await barbeariaComDono();
    await reemitir(pedidoVazio(), paramsId(b.id));
    const depois = await prismaOwner.barbeiro.findUnique({ where: { id: dono.id } });
    expect(depois!.tokenVersion).toBe(dono.tokenVersion + 1);
    expect(depois!.senhaHash).toBeNull();
  });

  it('barbearia inexistente devolve 404', async () => {
    const r = await reemitir(pedidoVazio(), paramsId('00000000-0000-0000-0000-000000000000'));
    expect(r.status).toBe(404);
  });

  it('o token novo funciona', async () => {
    const { b } = await barbeariaComDono();
    const r = await reemitir(pedidoVazio(), paramsId(b.id));
    const novo = (await r.json()).linkConvite.split('/').pop();
    const usar = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(novo));
    expect(usar.status).toBe(200);
  });
});

describe('POST /api/auth/convite/[token]', () => {
  it('define a senha e zera o convite', async () => {
    const { dono, token } = await barbeariaComDono();
    const r = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(token));
    expect(r.status).toBe(200);

    const depois = await prismaOwner.barbeiro.findUnique({ where: { id: dono.id } });
    expect(depois!.conviteTokenHash).toBeNull();
    expect(await verify(depois!.senhaHash!, 'senha-nova-123')).toBe(true);
  });

  it('o mesmo token não serve duas vezes', async () => {
    const { token } = await barbeariaComDono();
    await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(token));
    const r = await definirSenha(pedidoSenha('outra-senha-456'), paramsToken(token));
    expect(r.status).toBe(404);
  });

  it('token expirado é recusado', async () => {
    const { dono, token } = await barbeariaComDono();
    await prismaOwner.barbeiro.update({
      where: { id: dono.id }, data: { conviteExpiraEm: new Date(Date.now() - 1000) },
    });
    const r = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(token));
    expect(r.status).toBe(404);
  });

  it('token inventado é recusado', async () => {
    await barbeariaComDono();
    const r = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken('inventado'));
    expect(r.status).toBe(404);
  });

  it('senha curta demais é recusada', async () => {
    const { token } = await barbeariaComDono();
    const r = await definirSenha(pedidoSenha('123'), paramsToken(token));
    expect(r.status).toBe(422);
  });
});

describe('linkDoConvite', () => {
  const original = process.env.NEXT_PUBLIC_URL_BASE;
  afterEach(() => { process.env.NEXT_PUBLIC_URL_BASE = original; });

  it('em desenvolvimento monta http com porta', async () => {
    process.env.NEXT_PUBLIC_URL_BASE = 'http://localhost:3000';
    const { linkDoConvite } = await import('@/lib/convite');
    expect(linkDoConvite('brutus', 'abc')).toBe('http://brutus.localhost:3000/convite/abc');
  });

  it('em produção monta https sem porta', async () => {
    process.env.NEXT_PUBLIC_URL_BASE = 'https://agenda.com.br';
    const { linkDoConvite } = await import('@/lib/convite');
    expect(linkDoConvite('brutus', 'abc')).toBe('https://brutus.agenda.com.br/convite/abc');
  });

  it('sem a variável, cai no localhost de desenvolvimento', async () => {
    delete process.env.NEXT_PUBLIC_URL_BASE;
    const { linkDoConvite } = await import('@/lib/convite');
    expect(linkDoConvite('brutus', 'abc')).toBe('http://brutus.localhost:3000/convite/abc');
  });
});
