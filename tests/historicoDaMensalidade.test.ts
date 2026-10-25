import { describe, expect, it } from 'vitest';
import { perguntaDeRemover, rotuloDoComo } from '../src/lib/historicoDaMensalidade';

describe('rotuloDoComo', () => {
  it('diz em português como foi pago', () => {
    expect(rotuloDoComo('MANUAL')).toBe('Confirmado');
    expect(rotuloDoComo('VIGIA')).toBe('Confirmado pelo vigia');
    expect(rotuloDoComo('REGISTRO')).toBe('Registrado à mão');
    expect(rotuloDoComo('INFINITEPAY')).toBe('InfinitePay');
  });

  it('o que não conhece aparece como veio', () => {
    expect(rotuloDoComo('OUTRO')).toBe('OUTRO');
    expect(rotuloDoComo(null)).toBe('Pago');
  });
});

describe('perguntaDeRemover', () => {
  it('diz o valor, o dia e que o "pago até" não muda', () => {
    expect(perguntaDeRemover({ valorCentavos: 4990, pagaEm: '2026-10-10T15:30:00+00:00' }))
      .toBe('Remover o pagamento de R$ 49,90 de 10/10 do histórico? O "pago até" não muda.');
  });

  it('sem dia, pergunta só pelo valor', () => {
    expect(perguntaDeRemover({ valorCentavos: 100, pagaEm: null }))
      .toBe('Remover o pagamento de R$ 1,00 do histórico? O "pago até" não muda.');
  });
});
