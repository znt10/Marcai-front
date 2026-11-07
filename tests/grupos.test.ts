import { describe, it, expect } from 'vitest';
import { agrupar, type GrupoDeServico } from '@/lib/grupos';

const g = (id: string, ordem: number): GrupoDeServico => ({ id, nome: id, icone: null, ordem });
const s = (id: string, grupoId: string | null) => ({ id, grupoId });

describe('agrupar', () => {
  it('casa sem grupos devolve null (lista solta)', () => {
    expect(agrupar([s('corte', null)], [])).toBeNull();
  });

  it('segue a ordem dos grupos e a ordem dos itens', () => {
    const r = agrupar(
      [s('corte', 'cabelo'), s('barba', 'barba'), s('luzes', 'cabelo')],
      [g('barba', 1), g('cabelo', 0)],
    )!;
    expect(r.gavetas.map((x) => x.grupo.id)).toEqual(['cabelo', 'barba']);
    expect(r.gavetas[0].itens.map((x) => x.id)).toEqual(['corte', 'luzes']);
    expect(r.soltos).toEqual([]);
  });

  it('grupo sem item não vira gaveta', () => {
    const r = agrupar([s('corte', 'cabelo')], [g('cabelo', 0), g('vazio', 1)])!;
    expect(r.gavetas.map((x) => x.grupo.id)).toEqual(['cabelo']);
  });

  it('item de grupo desconhecido não some: vai para os soltos', () => {
    const r = agrupar([s('corte', 'sumiu')], [g('cabelo', 0)])!;
    expect(r.soltos.map((x) => x.id)).toEqual(['corte']);
  });
});
