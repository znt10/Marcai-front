import { NextResponse } from 'next/server';
import type { Barbearia, Prisma } from '@prisma/client';
import { comBarbearia } from './tenant';
import { sessaoDaRequisicao, naoAutorizado } from './sessao-painel';
import { ehDono } from './autorizacao';
import type { Sessao } from './auth';

/// A abertura que as quatro rotas de `/api/painel/equipe/[id]` repetem: sessão,
/// papel e o barbeiro carregado dentro do tenant. Extraído porque copiar isso
/// quatro vezes é como uma delas acaba sem a guarda de papel.

export const SO_O_DONO = NextResponse.json(
  { erro: 'Só o dono mexe na equipe.' }, { status: 403 });

export const NAO_ENCONTRADO = NextResponse.json(
  { erro: 'Não encontrado.' }, { status: 404 });

export type Aberta = {
  sessao: Sessao;
  barbearia: Barbearia;
};

/// Devolve a sessão aberta ou a resposta pronta que a rota deve retornar.
export async function comoDono(req: Request): Promise<Aberta | NextResponse> {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) return SO_O_DONO;
  return aberta;
}

export const ehResposta = (x: unknown): x is NextResponse => x instanceof NextResponse;

/// Conta quantos donos ATIVOS a barbearia tem. É o número que sustenta as duas
/// recusas de "último dono" — sem ele, rebaixar ou desativar deixaria a
/// barbearia órfã, e só o admin da plataforma destravaria.
export function contarDonosAtivos(tx: Prisma.TransactionClient): Promise<number> {
  return tx.barbeiro.count({ where: { papel: 'DONO', ativo: true } });
}

/// Agendamentos CONFIRMADOS no futuro daquele barbeiro, e a data do último.
export async function agendaFuturaDe(
  tx: Prisma.TransactionClient, barbeiroId: string, agora: Date,
): Promise<{ quantos: number; proximoEm: Date | null }> {
  const r = await tx.agendamento.aggregate({
    where: { barbeiroId, status: 'CONFIRMADO', inicio: { gt: agora } },
    _count: { _all: true },
    _max: { inicio: true },
  });
  return { quantos: r._count._all, proximoEm: r._max.inicio };
}

/// Reaproveita `comBarbearia` carregando o barbeiro do tenant. Devolve null
/// quando o id não existe aqui — e aí a rota responde 404, que é honesto: para
/// este tenant aquele barbeiro não existe mesmo.
export function comBarbeiro<T>(
  barbeariaId: string,
  id: string,
  fn: (
    tx: Prisma.TransactionClient,
    barbeiro: { id: string; nome: string; papel: 'DONO' | 'BARBEIRO'; ativo: boolean;
                whatsapp: string; tokenVersion: number },
  ) => Promise<T>,
): Promise<T | null> {
  return comBarbearia(barbeariaId, async (tx) => {
    const barbeiro = await tx.barbeiro.findUnique({
      where: { id },
      select: { id: true, nome: true, papel: true, ativo: true,
                whatsapp: true, tokenVersion: true },
    });
    if (!barbeiro) return null;
    return fn(tx, barbeiro);
  });
}
