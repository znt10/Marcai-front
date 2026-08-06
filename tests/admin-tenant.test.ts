import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { comBarbeariaAdmin } from '@/lib/tenant';

async function duasBarbearias() {
  const a = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
            horarioResumo: 'ter a sáb, 10h–19h', whatsappContato: '11955554444' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: a.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Tony', whatsapp: '11933334444', papel: 'DONO' },
  });
  return { a, b };
}

beforeEach(limparBanco);

describe('comBarbeariaAdmin', () => {
  it('enxerga só o tenant apontado', async () => {
    const { a } = await duasBarbearias();
    const barbeiros = await comBarbeariaAdmin(a.id, (tx) => tx.barbeiro.findMany());
    expect(barbeiros.map((x) => x.nome)).toEqual(['Téo']);
  });

  it('o tenant não sobrevive ao fim da transação', async () => {
    const { a, b } = await duasBarbearias();
    const um = await comBarbeariaAdmin(a.id, (tx) => tx.barbeiro.findMany());
    const dois = await comBarbeariaAdmin(b.id, (tx) => tx.barbeiro.findMany());
    expect(um.map((x) => x.nome)).toEqual(['Téo']);
    expect(dois.map((x) => x.nome)).toEqual(['Tony']);
  });

  it('escreve carimbando o tenant certo', async () => {
    const { a } = await duasBarbearias();
    await comBarbeariaAdmin(a.id, (tx) =>
      tx.barbeiro.create({
        data: { barbeariaId: a.id, nome: 'Rael', whatsapp: '11955556666' },
      }),
    );
    const todos = await prismaOwner.barbeiro.findMany({ where: { barbeariaId: a.id } });
    expect(todos).toHaveLength(2);
  });

  it('recusa escrita carimbada com outro tenant', async () => {
    const { a, b } = await duasBarbearias();
    await expect(
      comBarbeariaAdmin(a.id, (tx) =>
        tx.barbeiro.create({
          data: { barbeariaId: b.id, nome: 'Intruso', whatsapp: '11900000000' },
        }),
      ),
    ).rejects.toThrow();
  });
});
