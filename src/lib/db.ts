import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/// Runtime SEMPRE usa DATABASE_URL_APP (papel brutus_app, sujeito a RLS).
/// Trocar por DATABASE_URL desliga o isolamento inteiro — o dono ignora RLS.
///
/// Prisma 7 não aceita mais `datasources: { db: { url } }` no construtor: a
/// conexão direta passa por um driver adapter. O @prisma/adapter-pg mantém a
/// própria pool a partir da connection string — é por ela que o
/// `set_config(..., true)` de comBarbearia() precisa morrer com a transação.
const criar = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_APP }),
  });

const global_ = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = global_.prisma ?? criar();
if (process.env.NODE_ENV !== 'production') global_.prisma = prisma;
