import type { Prisma } from '@prisma/client';
import { prisma } from './db';

/// Executa `fn` com o RLS apontando para `barbeariaId`.
///
/// O 3º argumento `true` de set_config é is_local: a variável morre com a
/// TRANSAÇÃO. Com `false` ela viveria na SESSÃO — e como a conexão volta
/// para a pool, o próximo pedido herdaria este tenant. Vazamento cruzado
/// intermitente, dependente de temporização. Nunca trocar para `false`.
export function comBarbearia<T>(
  barbeariaId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.barbearia_id', ${barbeariaId}, true)`;
    return fn(tx);
  });
}
