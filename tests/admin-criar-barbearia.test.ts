import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { POST as criar } from '@/app/api/admin/barbearias/route';

beforeEach(limparBanco);

const corpoValido = {
  slug: 'novabarbearia', nome: 'Nova Barbearia', endereco: 'Rua Um, 1',
  horarioResumo: 'seg a sex, 9h-18h', whatsappContato: '11900000000',
  donoNome: 'Zé', donoWhatsapp: '11911112222',
};

const pedido = (corpo: unknown) =>
  new Request('http://admin.localhost/api/admin/barbearias', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });

describe('POST /api/admin/barbearias', () => {
  it('cria a barbearia e devolve o link de convite', async () => {
    const r = await criar(pedido(corpoValido));
    expect(r.status).toBe(201);
    const corpo = await r.json();
    expect(corpo.slug).toBe('novabarbearia');
    expect(corpo.linkConvite).toContain('novabarbearia.');
  });

  it('a barbearia nasce com exatamente um DONO, sem senha', async () => {
    await criar(pedido(corpoValido));
    const barbeiros = await prismaOwner.barbeiro.findMany();
    expect(barbeiros).toHaveLength(1);
    expect(barbeiros[0].papel).toBe('DONO');
    expect(barbeiros[0].senhaHash).toBeNull();
    expect(barbeiros[0].conviteTokenHash).not.toBeNull();
    expect(barbeiros[0].conviteExpiraEm!.getTime()).toBeGreaterThan(Date.now());
  });

  it('guarda só o HASH do convite, nunca o token em claro', async () => {
    const r = await criar(pedido(corpoValido));
    const { linkConvite } = await r.json();
    const token = linkConvite.split('/').pop();
    const [barbeiro] = await prismaOwner.barbeiro.findMany();
    expect(barbeiro.conviteTokenHash).not.toBe(token);
  });

  it('recusa slug repetido com 409', async () => {
    await criar(pedido(corpoValido));
    const r = await criar(pedido(corpoValido));
    expect(r.status).toBe(409);
  });

  it('recusa slug reservado', async () => {
    const r = await criar(pedido({ ...corpoValido, slug: 'admin' }));
    expect(r.status).toBe(422);
  });

  it('recusa slug fora do formato', async () => {
    const r = await criar(pedido({ ...corpoValido, slug: 'NÃO VALE' }));
    expect(r.status).toBe(422);
  });

  it('normaliza o slug para minúsculas', async () => {
    const r = await criar(pedido({ ...corpoValido, slug: 'NovaBarbearia' }));
    expect(r.status).toBe(201);
    expect((await r.json()).slug).toBe('novabarbearia');
  });

  it('falha ao criar o dono NÃO deixa barbearia órfã', async () => {
    const r = await criar(pedido({ ...corpoValido, donoWhatsapp: '' }));
    expect(r.status).toBe(422);
    expect(await prismaOwner.barbearia.findMany()).toHaveLength(0);
  });

  it('o dono é carimbado com a barbearia recém-criada', async () => {
    await criar(pedido(corpoValido));
    const [barbearia] = await prismaOwner.barbearia.findMany();
    const [dono] = await prismaOwner.barbeiro.findMany();
    expect(dono.barbeariaId).toBe(barbearia.id);
  });
});
