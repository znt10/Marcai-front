import { describe, expect, it } from 'vitest';
import {
  aindaRecolhida, estadoDoPortao, faixaDaMensalidade, jeitoDePagar,
  rotuloDaFaixa,
  type Mensalidade, type SituacaoDaMensalidade,
} from '../src/lib/mensalidade';

const m = (parcial: Partial<Mensalidade> = {}): Mensalidade => ({
  situacao: 'EM_DIA', dias: null, bloqueiaEm: null, pagaAte: null,
  valorCentavos: 4900, souDono: true, pix: null, pixErro: null, pagamentoAutomatico: false, ...parcial,
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
      .toEqual({ texto: 'Sua mensalidade de R$ 49,00 vence hoje.', mostraPix: true, podeRecolher: true });
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 1 })))
      .toEqual({ texto: 'Sua mensalidade de R$ 49,00 vence amanhã.', mostraPix: true, podeRecolher: true });
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 4 })))
      .toEqual({ texto: 'Sua mensalidade de R$ 49,00 vence em 4 dias.', mostraPix: true, podeRecolher: true });
  });

  it('ATRASADA: singular, plural e a data do bloqueio em dd/mm', () => {
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 1, bloqueiaEm: '2026-10-05' })))
      .toEqual({ texto: 'Sua mensalidade de R$ 49,00 está vencida há 1 dia. O painel é bloqueado em 05/10.', mostraPix: true, podeRecolher: false });
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 3, bloqueiaEm: '2026-12-31' })))
      .toEqual({ texto: 'Sua mensalidade de R$ 49,00 está vencida há 3 dias. O painel é bloqueado em 31/12.', mostraPix: true, podeRecolher: false });
  });

  it('ATRASADA sem data de bloqueio não promete bloqueio', () => {
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 2, bloqueiaEm: null })))
      .toEqual({ texto: 'Sua mensalidade de R$ 49,00 está vencida há 2 dias.', mostraPix: true, podeRecolher: false });
  });

  it('sem valor, a frase não inventa um', () => {
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 2, valorCentavos: null })))
      .toEqual({ texto: 'Sua mensalidade vence em 2 dias.', mostraPix: true, podeRecolher: true });
  });

  it('AGUARDANDO: aguardando confirmação', () => {
    expect(faixaDaMensalidade(m({ situacao: 'AGUARDANDO' })))
      .toEqual({ texto: 'Pagamento informado, aguardando confirmação.', mostraPix: false, podeRecolher: false });
  });

  it.each<SituacaoDaMensalidade>(['EM_DIA', 'ISENTA', 'DESATIVADA', 'BLOQUEADA'])(
    '%s não tem faixa', (situacao) => {
      expect(faixaDaMensalidade(m({ situacao }))).toBeNull();
    },
  );

  it('o botão do Pix só aparece onde ainda há o que pagar', () => {
    expect(faixaDaMensalidade(m({ situacao: 'VENCENDO', dias: 3 }))?.mostraPix).toBe(true);
    expect(faixaDaMensalidade(m({ situacao: 'ATRASADA', dias: 3 }))?.mostraPix).toBe(true);
    // Já avisou: um segundo Pix na cara só confunde.
    expect(faixaDaMensalidade(m({ situacao: 'AGUARDANDO' }))?.mostraPix).toBe(false);
  });

  it('null (carregando) não tem faixa', () => {
    expect(faixaDaMensalidade(null)).toBeNull();
  });

  it('só o dono vê a faixa: quem não paga não é cobrado', () => {
    for (const situacao of ['VENCENDO', 'ATRASADA', 'AGUARDANDO'] as const) {
      expect(faixaDaMensalidade(m({ situacao, dias: 2, souDono: false }))).toBeNull();
    }
  });
});

describe('jeitoDePagar', () => {
  const pixEstatico = {
    copiaECola: '000201...', qrSvg: 'data:image/svg+xml;base64,x', valorCentavos: 4901,
    link: null, automatico: false,
  };
  const pelaInfinitePay = {
    copiaECola: null, qrSvg: null, valorCentavos: 4900,
    link: 'https://checkout.infinitepay.io/x', automatico: true,
  };

  it('com link: botão que abre o link, a frase e sem "Já paguei"', () => {
    const j = jeitoDePagar(m({ pix: pelaInfinitePay }));
    expect(j).toEqual({
      tipo: 'link',
      link: 'https://checkout.infinitepay.io/x',
      valorCentavos: 4900,
      rotulo: 'Pagar mensalidade',
      frase: 'Pix ou cartão. Assim que o pagamento cair, o painel libera sozinho.',
      jaPaguei: false,
    });
  });

  it('sem link: QR, copia e cola e "Já paguei" como sempre', () => {
    const j = jeitoDePagar(m({ pix: pixEstatico }));
    expect(j).toEqual({
      tipo: 'pix',
      copiaECola: '000201...',
      qrSvg: 'data:image/svg+xml;base64,x',
      valorCentavos: 4901,
      jaPaguei: true,
    });
  });

  it('sem pix: o motivo e o "Já paguei" (como hoje)', () => {
    expect(jeitoDePagar(m({ pix: null, pixErro: 'Sem link agora.' }))).toEqual({
      tipo: 'indisponivel', texto: 'Sem link agora.', jaPaguei: true,
    });
  });

  it('link que falhou com a InfinitePay ligada: o motivo e sem "Já paguei"', () => {
    expect(jeitoDePagar(m({ pix: null, pixErro: 'Sem link agora.', pagamentoAutomatico: true }))).toEqual({
      tipo: 'indisponivel', texto: 'Sem link agora.', jaPaguei: false,
    });
  });

  it('o botão da faixa diz "Pagar mensalidade" quando é pelo link', () => {
    expect(rotuloDaFaixa(m({ pix: pelaInfinitePay }))).toBe('Pagar mensalidade');
    expect(rotuloDaFaixa(m({ pix: pixEstatico }))).toBe('Pagar com Pix');
    expect(rotuloDaFaixa(m({ pix: null }))).toBe('Pagar com Pix');
  });
});

describe('faixa recolhida', () => {
  const vencendo = m({ situacao: 'VENCENDO', dias: 0, pagaAte: '2026-10-25' });
  const H = 60 * 60 * 1000;
  const agora = Date.UTC(2026, 9, 25, 12);

  it('recolhida fica recolhida por 24 horas e depois volta aberta', () => {
    expect(aindaRecolhida(vencendo, agora - 1 * H, agora)).toBe(true);
    expect(aindaRecolhida(vencendo, agora - 23 * H, agora)).toBe(true);
    expect(aindaRecolhida(vencendo, agora - 24 * H, agora)).toBe(false);
    expect(aindaRecolhida(vencendo, null, agora)).toBe(false);
  });

  it('atrasada nunca fica recolhida', () => {
    const atrasada = m({ situacao: 'ATRASADA', dias: 1, bloqueiaEm: '2026-10-30' });
    expect(aindaRecolhida(atrasada, agora - H, agora)).toBe(false);
  });

  it('um recolhimento do futuro (relógio mexido) não segura a faixa', () => {
    expect(aindaRecolhida(vencendo, agora + H, agora)).toBe(false);
  });
});
