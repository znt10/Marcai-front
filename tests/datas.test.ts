import { describe, it, expect } from 'vitest';
import {
  localParaUtc, utcParaLocal, formatarHora, formatarDiaLongo,
  diaDeHoje, somarDias, diaSemanaDe,
} from '@/lib/datas';

describe('localParaUtc', () => {
  it('16:00 em São Paulo é 19:00 UTC', () => {
    expect(localParaUtc('2026-08-05', 16 * 60).toISOString())
      .toBe('2026-08-05T19:00:00.000Z');
  });

  it('meia-noite local não escorrega de dia', () => {
    expect(localParaUtc('2026-08-05', 0).toISOString())
      .toBe('2026-08-05T03:00:00.000Z');
  });
});

describe('utcParaLocal', () => {
  it('é o inverso de localParaUtc', () => {
    const ida = localParaUtc('2026-08-05', 16 * 60);
    expect(utcParaLocal(ida)).toEqual({ dia: '2026-08-05', minutos: 960 });
  });
});

describe('formatação', () => {
  it('formata a hora local, não a UTC', () => {
    expect(formatarHora(new Date('2026-08-05T19:00:00Z'))).toBe('16:00');
  });

  it('formata o dia longo', () => {
    expect(formatarDiaLongo(new Date('2026-08-05T19:00:00Z'))).toBe('qua 5 ago');
  });
});

describe('navegação de dias', () => {
  it('diaDeHoje usa o fuso local', () => {
    // 02:00 UTC de dia 6 ainda é dia 5 em São Paulo
    expect(diaDeHoje(new Date('2026-08-06T02:00:00Z'))).toBe('2026-08-05');
  });

  it('somarDias atravessa o mês', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('diaSemanaDe devolve 0 para domingo', () => {
    expect(diaSemanaDe('2026-08-09')).toBe(0);
    expect(diaSemanaDe('2026-08-05')).toBe(3);
  });
});

describe('localParaUtc no limite do dia', () => {
  it('1440 minutos é a meia-noite do dia seguinte, não data inválida', () => {
    const fim = localParaUtc('2026-08-07', 24 * 60);
    expect(Number.isNaN(fim.getTime())).toBe(false);
    expect(fim.getTime()).toBe(localParaUtc('2026-08-08', 0).getTime());
  });

  it('meia-noite continua sendo o começo do próprio dia', () => {
    expect(localParaUtc('2026-08-07', 0).getTime())
      .toBeLessThan(localParaUtc('2026-08-07', 1).getTime());
  });
});
