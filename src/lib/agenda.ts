import type { Prisma } from '@prisma/client';
import { slotsLivres, unirSlots, type Slot } from './slots';

/// A ponte entre o banco e o motor puro de `slots.ts`: lê o que o dia precisa
/// e entrega ao cálculo. Recebe `tx` — nunca abre transação própria — para
/// que toda leitura aconteça dentro do `comBarbearia()` de quem chamou.
export async function slotsDoDia(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  barbeiroId: string | 'qualquer',
  servicoId: string,
  dia: string,
  agora: Date,
): Promise<Slot[]> {
  const vinculos = await tx.barbeiroServico.findMany({
    where: {
      servicoId, ativo: true,
      ...(barbeiroId === 'qualquer' ? {} : { barbeiroId }),
      barbeiro: { ativo: true },
    },
    include: { barbeiro: { select: { id: true, ordem: true } } },
  });
  if (vinculos.length === 0) return [];

  const ids = vinculos.map((v) => v.barbeiroId);
  const [expedientes, bloqueios, agendamentos] = await Promise.all([
    tx.horarioTrabalho.findMany({ where: { barbeiroId: { in: ids } } }),
    tx.bloqueio.findMany({ where: { barbeiroId: { in: ids } } }),
    tx.agendamento.findMany({
      where: { barbeiroId: { in: ids }, status: 'CONFIRMADO' },
      select: { barbeiroId: true, inicio: true, fim: true },
    }),
  ]);

  const listas = vinculos.map((v) =>
    slotsLivres({
      barbeiroId: v.barbeiroId,
      duracaoMin: v.duracaoMin,
      expediente: expedientes.filter((h) => h.barbeiroId === v.barbeiroId),
      bloqueios:  bloqueios.filter((b) => b.barbeiroId === v.barbeiroId),
      agendamentos: agendamentos.filter((a) => a.barbeiroId === v.barbeiroId),
      dia, agora,
    }),
  );

  const ordem = new Map(vinculos.map((v) => [v.barbeiroId, v.barbeiro.ordem]));
  return unirSlots(listas, ordem);
}
