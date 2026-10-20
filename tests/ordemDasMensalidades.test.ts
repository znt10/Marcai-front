import { describe, expect, it } from 'vitest';
import {
  centavosDoTexto, ordenarMensalidades, rotuloDaSituacao,
} from '../src/lib/ordemDasMensalidades';
import type { LinhaDaMensalidade } from '../src/lib/api';

const linha = (p: Partial<LinhaDaMensalidade> = {}): LinhaDaMensalidade => ({
  barbeariaId: 'b', nome: 'Brutus', ativo: true, situacao: 'EM_DIA', dias: null,
  bloqueiaEm: null, valorCentavos: 4990, pagaAte: '2026-11-05', isenta: false,
  nuncaBloquear: false, informada: null, ultimaPaga: null, ...p,
});
const informada = { cobrancaId: 'c', valorCentavos: 4991, em: '2026-10-20T15:00:00Z', porNome: 'Fulano' };

describe('ordenarMensalidades', () => {
  it('informada, bloqueada, atrasada, vencendo, o resto; empate por nome', () => {
    const l = [
      linha({ barbeariaId: '1', nome: 'Zé', situacao: 'EM_DIA' }),
      linha({ barbeariaId: '2', nome: 'Ana', situacao: 'VENCENDO' }),
      linha({ barbeariaId: '3', nome: 'Bia', situacao: 'ATRASADA' }),
      linha({ barbeariaId: '4', nome: 'Caio', situacao: 'BLOQUEADA' }),
      linha({ barbeariaId: '5', nome: 'Davi', situacao: 'ISENTA' }),
      linha({ barbeariaId: '6', nome: 'Édson', situacao: 'BLOQUEADA', informada }),
      linha({ barbeariaId: '7', nome: 'Ágata', situacao: 'EM_DIA' }),
    ];
    expect(ordenarMensalidades(l).map((x) => x.barbeariaId)).toEqual(['6', '4', '3', '2', '7', '5', '1']);
  });

  it('AGUARDANDO conta como informada, e a entrada não é mexida', () => {
    const l = [linha({ barbeariaId: 'a', nome: 'A', situacao: 'BLOQUEADA' }),
               linha({ barbeariaId: 'b', nome: 'B', situacao: 'AGUARDANDO' })];
    expect(ordenarMensalidades(l).map((x) => x.barbeariaId)).toEqual(['b', 'a']);
    expect(l[0].barbeariaId).toBe('a');
  });
});

describe('rotuloDaSituacao', () => {
  it.each([
    [{ situacao: 'BLOQUEADA', dias: 8 }, 'bloqueada há 8 dias'],
    [{ situacao: 'BLOQUEADA', dias: 1 }, 'bloqueada há 1 dia'],
    [{ situacao: 'ATRASADA', dias: 3 }, 'atrasada há 3 dias'],
    [{ situacao: 'VENCENDO', dias: 4 }, 'vence em 4 dias'],
    [{ situacao: 'VENCENDO', dias: 1 }, 'vence amanhã'],
    [{ situacao: 'VENCENDO', dias: 0 }, 'vence hoje'],
    [{ situacao: 'EM_DIA', pagaAte: '2026-11-05' }, 'em dia até 05/11'],
    [{ situacao: 'ISENTA' }, 'isenta'],
    [{ situacao: 'DESATIVADA' }, 'desativada'],
    [{ situacao: 'AGUARDANDO' }, 'avisou que pagou'],
    [{ situacao: 'VENCENDO', dias: 2, informada }, 'avisou que pagou'],
  ] as [Partial<LinhaDaMensalidade>, string][])('%j → %s', (p, texto) => {
    expect(rotuloDaSituacao(linha(p))).toBe(texto);
  });
});

describe('centavosDoTexto', () => {
  it.each([
    ['49,90', 4990], ['49.90', 4990], ['49', 4900], ['49,9', 4990], [' R$ 49,91 ', 4991],
    ['1.234,50', 123450], ['0', 0], ['0,05', 5],
  ])('%s → %d', (t, c) => expect(centavosDoTexto(t)).toBe(c));

  it.each(['', 'abc', '-5', '49,999', '4,9,0', '49,', ',50', '1.234'])('rejeita %j', (t) =>
    expect(centavosDoTexto(t)).toBeNull());
});
