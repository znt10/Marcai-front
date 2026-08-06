import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { GET as listar } from '@/app/api/admin/barbearias/route';
import { PATCH as alterar } from '@/app/api/admin/barbearias/[id]/route';

async function cenario() {
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Rael', whatsapp: '11933334444' },
  });
  return b;
}

beforeEach(limparBanco);

describe('GET /api/admin/barbearias', () => {
  it('lista com a contagem de barbeiros', async () => {
    await cenario();
    const { barbearias } = await (await listar()).json();
    expect(barbearias).toHaveLength(1);
    expect(barbearias[0].slug).toBe('brutus');
    expect(barbearias[0].barbeiros).toBe(2);
  });

  it('lista barbearia inativa também — é o painel de quem administra', async () => {
    const b = await cenario();
    await prismaOwner.barbearia.update({ where: { id: b.id }, data: { ativo: false } });
    const { barbearias } = await (await listar()).json();
    expect(barbearias[0].ativo).toBe(false);
  });

  it('conta cada tenant separadamente, sem vazar de um para o outro', async () => {
    await cenario();
    const outra = await prismaOwner.barbearia.create({
      data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
              horarioResumo: 'ter a sáb, 10h–19h', whatsappContato: '11955554444' },
    });
    await prismaOwner.barbeiro.create({
      data: { barbeariaId: outra.id, nome: 'Tony', whatsapp: '11977778888', papel: 'DONO' },
    });

    const { barbearias } = await (await listar()).json();
    const porSlug = Object.fromEntries(
      barbearias.map((b: { slug: string; barbeiros: number }) => [b.slug, b.barbeiros]),
    );
    expect(porSlug).toEqual({ brutus: 2, dontony: 1 });
  });

  it('lista vazia quando não há barbearia nenhuma', async () => {
    const { barbearias } = await (await listar()).json();
    expect(barbearias).toEqual([]);
  });
});

describe('PATCH /api/admin/barbearias/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const pedido = (corpo: unknown) =>
    new Request('http://admin.localhost/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });

  it('desativa', async () => {
    const b = await cenario();
    const r = await alterar(pedido({ ativo: false }), params(b.id));
    expect(r.status).toBe(200);
    const depois = await prismaOwner.barbearia.findUnique({ where: { id: b.id } });
    expect(depois!.ativo).toBe(false);
  });

  it('reativa', async () => {
    const b = await cenario();
    await alterar(pedido({ ativo: false }), params(b.id));
    await alterar(pedido({ ativo: true }), params(b.id));
    const depois = await prismaOwner.barbearia.findUnique({ where: { id: b.id } });
    expect(depois!.ativo).toBe(true);
  });

  it('id inexistente devolve 404', async () => {
    const r = await alterar(pedido({ ativo: false }), params('00000000-0000-0000-0000-000000000000'));
    expect(r.status).toBe(404);
  });

  it('corpo sem ativo booleano devolve 422', async () => {
    const b = await cenario();
    const r = await alterar(pedido({ ativo: 'sim' }), params(b.id));
    expect(r.status).toBe(422);
  });
});
