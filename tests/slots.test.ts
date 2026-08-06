import { describe, it, expect } from 'vitest';
import { slotsLivres, unirSlots, type EntradaSlots } from '@/lib/slots';
import { localParaUtc, formatarHora } from '@/lib/datas';

const DIA = '2026-08-05'; // quarta-feira
const QUA = 3;

function base(over: Partial<EntradaSlots> = {}): EntradaSlots {
  return {
    barbeiroId: 'teo',
    duracaoMin: 40,
    expediente: [{ diaSemana: QUA, minutosInicio: 9 * 60, minutosFim: 20 * 60 }],
    bloqueios: [],
    agendamentos: [],
    dia: DIA,
    agora: localParaUtc(DIA, 0),
    ...over,
  };
}

const horas = (s: ReturnType<typeof slotsLivres>) => s.map((x) => formatarHora(x.inicio));

describe('expediente', () => {
  it('dia sem expediente devolve vazio', () => {
    expect(slotsLivres(base({ expediente: [] }))).toEqual([]);
  });

  it('barbeiro que não atende na quarta devolve vazio', () => {
    expect(slotsLivres(base({
      expediente: [{ diaSemana: 1, minutosInicio: 540, minutosFim: 1200 }],
    }))).toEqual([]);
  });

  it('gera a grade de 30 em 30 a partir da abertura', () => {
    const r = horas(slotsLivres(base()));
    expect(r.slice(0, 4)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('o passo é a granularidade, não a duração', () => {
    const r = horas(slotsLivres(base({ duracaoMin: 40 })));
    expect(r[1]).toBe('09:30'); // não 09:40
  });

  it('o último slot cabe inteiro no expediente', () => {
    const r = horas(slotsLivres(base({ duracaoMin: 60 })));
    expect(r.at(-1)).toBe('19:00'); // 19:30 + 60min passaria das 20h
  });

  it('duração diferente produz grade diferente', () => {
    const curto = horas(slotsLivres(base({ duracaoMin: 30 })));
    const longo = horas(slotsLivres(base({ duracaoMin: 60 })));
    expect(curto.length).toBeGreaterThan(longo.length);
  });
});

describe('bloqueios', () => {
  it('bloqueio semanal remove os slots do intervalo', () => {
    const r = horas(slotsLivres(base({
      bloqueios: [{ repeteSemanalmente: true, diaSemana: QUA,
                    minutosInicio: 12 * 60, minutosFim: 13 * 60,
                    inicio: null, fim: null }],
    })));
    expect(r).not.toContain('12:00');
    expect(r).not.toContain('12:30');
    expect(r).toContain('13:00');
  });

  it('bloqueio semanal de outro dia da semana não afeta', () => {
    const r = horas(slotsLivres(base({
      bloqueios: [{ repeteSemanalmente: true, diaSemana: 1,
                    minutosInicio: 12 * 60, minutosFim: 13 * 60,
                    inicio: null, fim: null }],
    })));
    expect(r).toContain('12:00');
  });

  it('bloqueio pontual só afeta o dia dele', () => {
    const r = horas(slotsLivres(base({
      bloqueios: [{ repeteSemanalmente: false, diaSemana: null,
                    minutosInicio: null, minutosFim: null,
                    inicio: localParaUtc('2026-08-06', 9 * 60),
                    fim:    localParaUtc('2026-08-06', 11 * 60) }],
    })));
    expect(r).toContain('09:00');
  });
});

describe('agendamentos existentes', () => {
  it('remove os slots que o agendamento cobre', () => {
    const r = horas(slotsLivres(base({
      agendamentos: [{ inicio: localParaUtc(DIA, 9 * 60),
                       fim:    localParaUtc(DIA, 9 * 60 + 40) }],
    })));
    expect(r).not.toContain('09:00');
    expect(r).not.toContain('09:30'); // 09:30+40 invade 09:00–09:40
    expect(r).toContain('10:00');
  });

  it('fronteira semiaberta: quem termina 16:40 não bloqueia 16:40', () => {
    const r = horas(slotsLivres(base({
      duracaoMin: 20,
      agendamentos: [{ inicio: localParaUtc(DIA, 16 * 60),
                       fim:    localParaUtc(DIA, 16 * 60 + 40) }],
    })));
    expect(r).toContain('17:00');
  });

  it('brecha: barba de 30 cabe entre cortes de 40', () => {
    const ags = [
      { inicio: localParaUtc(DIA, 9 * 60),  fim: localParaUtc(DIA, 9 * 60 + 40) },
      { inicio: localParaUtc(DIA, 10 * 60 + 30), fim: localParaUtc(DIA, 11 * 60 + 10) },
    ];
    expect(horas(slotsLivres(base({ duracaoMin: 30, agendamentos: ags })))).toContain('10:00');
    expect(horas(slotsLivres(base({ duracaoMin: 60, agendamentos: ags })))).not.toContain('10:00');
  });

  it('dia inteiro tomado devolve vazio', () => {
    const r = slotsLivres(base({
      agendamentos: [{ inicio: localParaUtc(DIA, 9 * 60),
                       fim:    localParaUtc(DIA, 20 * 60) }],
    }));
    expect(r).toEqual([]);
  });
});

describe('horário que já passou', () => {
  it('com agora no meio do expediente, o passado some', () => {
    const r = horas(slotsLivres(base({ agora: localParaUtc(DIA, 15 * 60) })));
    expect(r).not.toContain('09:00');
    expect(r).toContain('15:00');
    expect(r).toContain('16:00');
  });
});

describe('tanto faz', () => {
  const ordem = new Map([['teo', 0], ['rael', 1]]);

  it('mesmo horário nos dois vira um slot só, do de menor ordem', () => {
    const teo  = slotsLivres(base({ barbeiroId: 'teo',  duracaoMin: 40 }));
    const rael = slotsLivres(base({ barbeiroId: 'rael', duracaoMin: 40 }));
    const u = unirSlots([teo, rael], ordem);
    const noveHoras = u.filter((s) => formatarHora(s.inicio) === '09:00');
    expect(noveHoras).toHaveLength(1);
    expect(noveHoras[0].barbeiroId).toBe('teo');
  });

  it('horário que só um tem aparece atribuído a ele', () => {
    const teo = slotsLivres(base({
      barbeiroId: 'teo', duracaoMin: 40,
      agendamentos: [{ inicio: localParaUtc(DIA, 9 * 60),
                       fim:    localParaUtc(DIA, 9 * 60 + 40) }],
    }));
    const rael = slotsLivres(base({ barbeiroId: 'rael', duracaoMin: 40 }));
    const u = unirSlots([teo, rael], ordem);
    const nove = u.find((s) => formatarHora(s.inicio) === '09:00');
    expect(nove?.barbeiroId).toBe('rael');
  });
});
