import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prisma 7 nao aceita mais `datasources: { db: { url } }` no construtor do
// PrismaClient (erro: "not assignable to type PrismaClientOptions" / pede
// `adapter`). A conexao direta agora exige um driver adapter — aqui,
// @prisma/adapter-pg sobre um Pool do `pg`. Duas Pools/PrismaClient
// separados, cada um com sua propria URL e papel de banco: isso preserva o
// isolamento owner/app que os testes de RLS da Tarefa 4 exigem.

/// Papel DONO: ignora RLS. Só para montar cenário de teste.
export const prismaOwner = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_TEST }),
});

/// Papel APP: sujeito ao RLS. É o que o código sob teste usa.
export const prismaApp = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_APP_TEST }),
});

export async function limparBanco() {
  await prismaOwner.$executeRawUnsafe(`
    TRUNCATE TABLE "Agendamento", "Cliente", "Bloqueio", "HorarioTrabalho",
                   "BarbeiroServico", "Servico", "Barbeiro", "Barbearia"
    RESTART IDENTITY CASCADE
  `);
}
