import { describe, expect, it } from 'vitest';
import {
  estadoDoPortao, faixaDaMensalidade, type Mensalidade, type SituacaoDaMensalidade,
} from '../src/lib/mensalidade';

const m = (parcial: Partial<Mensalidade> = {}): Mensalidade => ({
  situacao: 'EM_DIA', dias: null, bloqueiaEm: null, pagaAte: null,
  valorCentavos: 4900, souDono: true, pix: null, pixErro: null, ...parcial,
});

describe('estadoDoPortao', () => {
  it('BLOQUEADA: o dono paga, quem não é dono fala com o dono', () => {
    expect(estadoDoPortao(m({ situacao: 'BLOQUEADA' }), true)).toBe('pagar');
    expect(estadoDoPortao(m({ situacao: 'BLOQUEADA' }), false)).toBe('falar-com-o-dono');
  });

  it.each<SituacaoDaMensalidade>([
    'DESATIVADA', 'ISENTA', 'AGUARDANDO', 'EM_DIA', 'VENCENDO', 'ATRASADA',
  ])('%s deixa o painel livre para os dois papéis', (situacao) => {
    expect(estadoDoPortao(m({ situacao }), true)).toBe('livre');
    expect(estadoDoPortao(m({ situacao }), false)).toBe('livre');
  });

  it('sem resposta (carregando ou falhou) nunca tranca', () => {
    expect(estadoDoPortao(null, true)).toBe('livre');
    expect(estadoDoPortao(null, false)).toBe('livre');
  });
});

describe('faixaDaMensalidade', () => {
  it('VENCENDO: hoje, amanhã e em N dias', () => {
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 0 })))
      .toBe('Sua mensalidade de R$ 49,00 vence hoje.');
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 1 })))
      .toBe('Sua mensalidade de R$ 49,00 vence amanhã.');
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 4 })))
      .toBe('Sua mensalidade de R$ 49,00 vence em 4 dias.');
  });

  it('ATRASADA: singular, plural e a data do bloqueio em dd/mm', () => {
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 1, bloqueiaEm: '2026-10-05' })))
      .toBe('Sua mensalidade de R$ 49,00 está vencida há 1 dia. O painel é bloqueado em 05/10.');
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 3, bloqueiaEm: '2026-12-31' })))
      .toBe('Sua mensalidade de R$ 49,00 está vencida há 3 dias. O painel é bloqueado em 31/12.');
  });

  it('ATRASADA sem data de bloqueio não promete bloqueio', () => {
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 2, bloqueiaEm: null })))
      .toBe('Sua mensalidade de R$ 49,00 está vencida há 2 dias.');
  });

  it('sem valor, a frase não inventa um', () => {
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 2, valorCentavos: null })))
      .toBe('Sua mensalidade vence em 2 dias.');
  });

  it('AGUARDANDO: aguardando confirmação', () => {
    expect(faixaDaMensalidade(m({ situacao: 'AGUARDANDO' })))
      .toBe('Pagamento informado, aguardando confirmação.');
  });

  it.each<SituacaoDaMensalidade>(['EM_DIA', 'ISENTA', 'DESATIVADA', 'BLOQUEADA'])(
    '%s não tem faixa', (situacao) => {
      expect(faixaDaMensalidade(m({ situacao }))).toBeNull();
    },
  );

  it('null (carregando) não tem faixa', () => {
    expect(faixaDaMensalidade(null)).toBeNull();
  });

  it('só o dono vê a faixa: quem não paga não é cobrado', () => {
    for (const situacao of ['VENCENDO', 'ATRASADA', 'AGUARDANDO'] as const) {
      expect(faixaDaMensalidade(m({ situacao, dias: 2, souDono: false }))).toBeNull();
    }
  });
});
