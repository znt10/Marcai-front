import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll } from 'vitest';

// Prisma 7 nao aceita mais `datasources: { db: { url } }` no construtor do
// PrismaClient (erro: "not assignable to type PrismaClientOptions" / pede
// `adapter`). A conexao direta agora exige um driver adapter — aqui,
// @prisma/adapter-pg, que cria e gerencia sua propria pool a partir da
// connection string. Dois PrismaClient separados, cada um com sua propria
// URL e papel de banco: isso preserva o isolamento owner/app que os testes
// de RLS da Tarefa 4 exigem.

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

// Sem isso, cada arquivo de teste que importa este setup abre duas conexões
// (owner/app) que nunca fecham — a partir da Tarefa 4, com mais de um
// arquivo de teste, isso acumula pools ociosas e arrisca o Vitest não
// encerrar sozinho.
afterAll(async () => {
  await prismaOwner.$disconnect();
  await prismaApp.$disconnect();
});
