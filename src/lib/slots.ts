import { GRANULARIDADE_MIN, ANTECEDENCIA_MINIMA_MIN } from './config';
import { localParaUtc, diaSemanaDe } from './datas';

export type Slot = { inicio: Date; fim: Date; barbeiroId: string };

export type BloqueioSlot = {
  repeteSemanalmente: boolean;
  diaSemana: number | null;
  minutosInicio: number | null;
  minutosFim: number | null;
  inicio: Date | null;
  fim: Date | null;
};

export type EntradaSlots = {
  barbeiroId: string;
  /// Vem do BarbeiroServico. A função NÃO conhece Servico nem BarbeiroServico.
  duracaoMin: number;
  expediente: { diaSemana: number; minutosInicio: number; minutosFim: number }[];
  bloqueios: BloqueioSlot[];
  agendamentos: { inicio: Date; fim: Date }[];
  dia: string;
  /// Injetado, nunca new Date() interno — senão todo teste de "já passou"
  /// vira refém do relógio da máquina.
  agora: Date;
};

/// Intervalos semiabertos [início, fim): quem termina 16:40 não colide com
/// quem começa 16:40.
const colide = (aIni: Date, aFim: Date, bIni: Date, bFim: Date) =>
  aIni < bFim && aFim > bIni;

export function slotsLivres(e: EntradaSlots): Slot[] {
  const diaSemana = diaSemanaDe(e.dia);
  const jornada = e.expediente.find((h) => h.diaSemana === diaSemana);
  if (!jornada) return []; // barbeiro não declarou expediente nesse dia

  const limite = new Date(e.agora.getTime() + ANTECEDENCIA_MINIMA_MIN * 60_000);

  const intervalosBloqueados = e.bloqueios.flatMap((b) => {
    if (b.repeteSemanalmente) {
      if (b.diaSemana !== diaSemana) return [];
      return [{
        inicio: localParaUtc(e.dia, b.minutosInicio!),
        fim:    localParaUtc(e.dia, b.minutosFim!),
      }];
    }
    return [{ inicio: b.inicio!, fim: b.fim! }];
  });

  const livres: Slot[] = [];
  for (let m = jornada.minutosInicio; m + e.duracaoMin <= jornada.minutosFim; m += GRANULARIDADE_MIN) {
    const inicio = localParaUtc(e.dia, m);
    const fim = new Date(inicio.getTime() + e.duracaoMin * 60_000);

    if (inicio < limite) continue;
    if (intervalosBloqueados.some((b) => colide(inicio, fim, b.inicio, b.fim))) continue;
    if (e.agendamentos.some((a) => colide(inicio, fim, a.inicio, a.fim))) continue;

    livres.push({ inicio, fim, barbeiroId: e.barbeiroId });
  }
  return livres;
}

/// "Tanto faz": une os slots de vários barbeiros. Mesmo horário em dois
/// barbeiros vira um slot só, do de menor `ordem`.
export function unirSlots(listas: Slot[][], ordemPorBarbeiro: Map<string, number>): Slot[] {
  const porInstante = new Map<number, Slot>();
  for (const slot of listas.flat()) {
    const chave = slot.inicio.getTime();
    const atual = porInstante.get(chave);
    if (!atual) { porInstante.set(chave, slot); continue; }
    const a = ordemPorBarbeiro.get(slot.barbeiroId) ?? Number.MAX_SAFE_INTEGER;
    const b = ordemPorBarbeiro.get(atual.barbeiroId) ?? Number.MAX_SAFE_INTEGER;
    if (a < b) porInstante.set(chave, slot);
  }
  return [...porInstante.values()].sort((x, y) => x.inicio.getTime() - y.inicio.getTime());
}
