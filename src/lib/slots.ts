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

/// Os dois formatos de bloqueio traduzidos para instantes do dia pedido — o
/// semanal virando hora daquela data, o pontual entrando só se encostar no dia.
///
/// Exportada porque o quadro do dia precisa **exatamente** desta tradução para
/// desenhar as faixas. Uma segunda cópia seria uma segunda regra de
/// recorrência, e a que diverge é sempre a que ninguém está olhando.
export function bloqueiosDoDia(
  bloqueios: BloqueioSlot[], dia: string, diaSemana: number,
): { inicio: Date; fim: Date }[] {
  const abre = localParaUtc(dia, 0);
  const fecha = localParaUtc(dia, 24 * 60);

  return bloqueios.flatMap((b) => {
    if (b.repeteSemanalmente) {
      if (b.diaSemana !== diaSemana) return [];
      return [{
        inicio: localParaUtc(dia, b.minutosInicio!),
        fim:    localParaUtc(dia, b.minutosFim!),
      }];
    }
    // Descartar o pontual de outra data não muda o que o motor decide (ele não
    // colidiria mesmo), e é o que deixa a lista servir para desenhar o dia.
    return colide(b.inicio!, b.fim!, abre, fecha) ? [{ inicio: b.inicio!, fim: b.fim! }] : [];
  });
}

export function slotsLivres(e: EntradaSlots): Slot[] {
  const diaSemana = diaSemanaDe(e.dia);
  const jornada = e.expediente.find((h) => h.diaSemana === diaSemana);
  if (!jornada) return []; // barbeiro não declarou expediente nesse dia

  const limite = new Date(e.agora.getTime() + ANTECEDENCIA_MINIMA_MIN * 60_000);

  const intervalosBloqueados = bloqueiosDoDia(e.bloqueios, e.dia, diaSemana);

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
