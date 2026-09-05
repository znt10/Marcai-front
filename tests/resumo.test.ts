import { describe, it, expect } from 'vitest';
import { periodoDoAtalho, atalhoDoPeriodo } from '@/lib/resumo';

// 2026-09-05 e' um sabado, e o mes ja' comecou — os tres atalhos dao
// intervalos diferentes entre si, que e' o que faz o teste valer.
const HOJE = '2026-09-05';

describe('periodoDoAtalho', () => {
  it('hoje e um dia so', () => {
    expect(periodoDoAtalho('hoje', HOJE)).toEqual({ de: HOJE, ate: HOJE });
  });

  it('7 dias INCLUI hoje — sao sete dias, nao oito', () => {
    expect(periodoDoAtalho('7dias', HOJE)).toEqual({ de: '2026-08-30', ate: HOJE });
  });

  it('o mes vai do dia 1 ate hoje, nao ate o fim do mes', () => {
    // Ate' o fim do mes seria pedir dia que ainda nao aconteceu: o numero
    // sairia igual e o rotulo mentiria sobre o periodo.
    expect(periodoDoAtalho('mes', HOJE)).toEqual({ de: '2026-09-01', ate: HOJE });
  });

  it('o mes no dia 1 e um dia so', () => {
    expect(periodoDoAtalho('mes', '2026-09-01')).toEqual({
      de: '2026-09-01', ate: '2026-09-01',
    });
  });

  it('7 dias atravessa a virada do mes', () => {
    expect(periodoDoAtalho('7dias', '2026-09-02')).toEqual({
      de: '2026-08-27', ate: '2026-09-02',
    });
  });
});

describe('atalhoDoPeriodo', () => {
  it('reconhece cada atalho de volta', () => {
    for (const a of ['hoje', '7dias', 'mes'] as const) {
      expect(atalhoDoPeriodo(periodoDoAtalho(a, HOJE), HOJE)).toBe(a);
    }
  });

  it('intervalo digitado a mao nao acende atalho nenhum', () => {
    expect(atalhoDoPeriodo({ de: '2026-07-10', ate: '2026-08-03' }, HOJE)).toBeNull();
  });

  it('no dia 1 do mes, hoje e mes sao o mesmo intervalo e hoje ganha', () => {
    // Empate real: os dois produzem {de: 01, ate: 01}. Acender os dois seria
    // mentira; a ordem da lista decide, e `hoje` vem primeiro.
    expect(atalhoDoPeriodo({ de: '2026-09-01', ate: '2026-09-01' }, '2026-09-01'))
      .toBe('hoje');
  });
});
