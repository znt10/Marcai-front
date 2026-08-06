import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Barbearia, Prisma } from '@prisma/client';
import { prisma } from './db';
import { TTL_CACHE_TENANT_MS } from './config';

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

/// Traduz o `host` da requisição no slug da barbearia. Implementada em
/// `./slug` para que o proxy possa importá-la sem arrastar o Prisma junto;
/// reexportada aqui porque é daqui que o resto do sistema (e o teste) a lê.
export { extrairSlug } from './slug';

const cacheSlug = new Map<string, { valor: Barbearia | null; expiraEm: number }>();

/// Só para teste: cada caso recria a barbearia com um uuid novo, e um slug
/// cacheado do caso anterior apontaria para um id que o TRUNCATE já apagou —
/// o RLS então filtraria tudo e o sintoma sairia como "barbeiro não faz esse
/// serviço", bem longe da causa.
export function _limparCacheTenant() { cacheSlug.clear(); }

async function buscarPorSlug(slug: string): Promise<Barbearia | null> {
  const guardado = cacheSlug.get(slug);
  if (guardado && guardado.expiraEm > Date.now()) return guardado.valor;

  // Barbearia está FORA do RLS de propósito: é lida antes de existir tenant.
  const valor = await prisma.barbearia.findFirst({ where: { slug, ativo: true } });
  cacheSlug.set(slug, { valor, expiraEm: Date.now() + TTL_CACHE_TENANT_MS });
  return valor;
}

async function resolver(slug: string | null): Promise<Barbearia> {
  if (!slug) notFound();
  const barbearia = await buscarPorSlug(slug);
  if (!barbearia) notFound();
  return barbearia;
}

/// Para SERVER COMPONENTS, que não recebem a Request em mãos e leem o header
/// do contexto assíncrono do Next. Envolvida em cache() do React: várias
/// chamadas na mesma requisição batem no banco uma vez só.
export const barbeariaAtual = cache(async (): Promise<Barbearia> =>
  resolver((await headers()).get('x-barbearia-slug')));

/// Para ROUTE HANDLERS, que recebem a Request. Ler o header dela em vez do
/// contexto ambiente deixa o fluxo de dados explícito — e é o que torna as
/// rotas chamáveis direto no teste, sem simular o runtime do Next.
///
/// O header vem do proxy, que o apaga antes de escrever o próprio: o valor
/// aqui nunca é o que o cliente mandou.
export const barbeariaDaRequisicao = (req: Request): Promise<Barbearia> =>
  resolver(req.headers.get('x-barbearia-slug'));
