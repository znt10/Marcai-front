import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { POST as criar } from '@/app/api/admin/barbearias/route';

beforeEach(limparBanco);
afterEach(() => vi.restoreAllMocks());

/// Exatamente os cinco campos que a rota aceita. Deixar `horarioResumo` e
/// `donoWhatsapp` sobrando aqui passaria — a rota ignora o que não conhece —
/// mas o fixture deixaria de provar que o formulário e a rota falam a mesma
/// língua, que é metade do valor deste arquivo.
const corpoValido = {
  slug: 'novabarbearia', nome: 'Nova Barbearia', endereco: 'Rua Um, 1',
  whatsappContato: '11900000000', donoNome: 'Zé',
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

  it('falha de validação NÃO deixa barbearia órfã', async () => {
    // Barbearia sem dono é órfã: ninguém entra nela para cadastrar ninguém, e
    // ela só sairia de lá pelo psql. A transação única é o que garante isso.
    const r = await criar(pedido({ ...corpoValido, whatsappContato: '' }));
    expect(r.status).toBe(422);
    expect(await prismaOwner.barbearia.findMany()).toHaveLength(0);
  });

  it('nasce SEM horário — quem escreve a frase é o dono', async () => {
    await criar(pedido(corpoValido));
    const [barbearia] = await prismaOwner.barbearia.findMany();
    // Nulo, não string vazia: são estados diferentes, e a home usa isso para
    // decidir se mostra horário nenhum.
    expect(barbearia.horarioResumo).toBeNull();
  });

  it('o número da barbearia vira o login do dono', async () => {
    await criar(pedido(corpoValido));
    const [barbearia] = await prismaOwner.barbearia.findMany();
    const [dono] = await prismaOwner.barbeiro.findMany();
    expect(dono.whatsapp).toBe(barbearia.whatsappContato);
    expect(dono.whatsapp).toBe('11900000000');
  });

  it('recusa cada campo obrigatório que falte', async () => {
    for (const campo of ['nome', 'endereco', 'donoNome', 'whatsappContato']) {
      const r = await criar(pedido({ ...corpoValido, [campo]: '' }));
      expect(r.status, `faltando ${campo}`).toBe(422);
    }
  });

  it('manda o convite no WhatsApp da barbearia, com o mesmo link da tela', async () => {
    process.env.EVOLUTION_API_URL = 'http://evolution.teste';
    process.env.EVOLUTION_INSTANCE = 'brutus';
    const espiao = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', espiao);

    const { linkConvite } = await (await criar(pedido(corpoValido))).json();

    // O link ia SÓ para a tela do admin, e o token só existe em hash: perdido
    // ali, o dono não entrava mais e a barbearia nascia sem acesso.
    const envios = espiao.mock.calls
      .filter((c) => String(c[0]).includes('/message/sendText/'))
      .map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(envios).toHaveLength(1);
    expect(envios[0].number).toBe('5511900000000');
    expect(envios[0].text).toContain(linkConvite);
  });

  it('o dono é carimbado com a barbearia recém-criada', async () => {
    await criar(pedido(corpoValido));
    const [barbearia] = await prismaOwner.barbearia.findMany();
    const [dono] = await prismaOwner.barbeiro.findMany();
    expect(dono.barbeariaId).toBe(barbearia.id);
  });
});
