import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaOwner, prismaApp, limparBanco } from './setup';

const prismaAdminTeste = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_ADMIN_TEST }),
});

const dadosBarbearia = (slug: string) => ({
  slug, nome: 'Nova', endereco: 'Rua Um, 1',
  horarioResumo: 'seg a sex, 9h-18h', whatsappContato: '11900000000',
});

beforeEach(limparBanco);
afterAll(() => prismaAdminTeste.$disconnect());

describe('o papel do admin', () => {
  it('conecta como brutus_admin', async () => {
    const [{ current_user }] = await prismaAdminTeste.$queryRawUnsafe<{ current_user: string }[]>(
      'SELECT current_user',
    );
    expect(current_user).toBe('brutus_admin');
  });

  it('NÃO tem bypassrls', async () => {
    const [{ rolbypassrls }] = await prismaOwner.$queryRawUnsafe<{ rolbypassrls: boolean }[]>(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'brutus_admin'`,
    );
    expect(rolbypassrls).toBe(false);
  });

  it('cria barbearia — a capacidade que o brutus_app não tem', async () => {
    await expect(
      prismaAdminTeste.barbearia.create({ data: dadosBarbearia('nova') }),
    ).resolves.toBeTruthy();
  });

  it('desativa barbearia', async () => {
    const b = await prismaAdminTeste.barbearia.create({ data: dadosBarbearia('nova') });
    await prismaAdminTeste.barbearia.update({ where: { id: b.id }, data: { ativo: false } });
    const depois = await prismaOwner.barbearia.findUnique({ where: { id: b.id } });
    expect(depois!.ativo).toBe(false);
  });

  it('continua sujeito ao RLS: sem tenant apontado, não enxerga barbeiro', async () => {
    const b = await prismaOwner.barbearia.create({ data: dadosBarbearia('nova') });
    await prismaOwner.barbeiro.create({
      data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
    });
    const todos = await prismaAdminTeste.barbeiro.findMany();
    expect(todos).toHaveLength(0);
  });
});

describe('o papel da aplicação', () => {
  it('brutus_app continua SEM poder criar barbearia', async () => {
    await expect(
      prismaApp.barbearia.create({ data: dadosBarbearia('proibida') }),
    ).rejects.toThrow();
  });

  it('brutus_app continua SEM poder desativar barbearia', async () => {
    const b = await prismaOwner.barbearia.create({ data: dadosBarbearia('nova') });
    await expect(
      prismaApp.barbearia.update({ where: { id: b.id }, data: { ativo: false } }),
    ).rejects.toThrow();
  });
});
