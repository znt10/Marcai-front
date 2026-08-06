import { describe, it, expect } from 'vitest';
import { validarDuracao } from '@/lib/servicos';
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from '@/lib/config';

const corte = { duracaoMinimaMin: 20 };

describe('validarDuracao', () => {
  it('aceita exatamente o piso do serviço', () => {
    expect(() => validarDuracao(20, corte)).not.toThrow();
  });
  it('recusa um minuto abaixo do piso do serviço', () => {
    expect(() => validarDuracao(19, corte)).toThrow(/pelo menos 20/);
  });
  it('aceita exatamente o mínimo global', () => {
    expect(() => validarDuracao(DURACAO_MINIMA_MIN, { duracaoMinimaMin: 10 })).not.toThrow();
  });
  it('recusa abaixo do mínimo global', () => {
    expect(() => validarDuracao(DURACAO_MINIMA_MIN - 1, { duracaoMinimaMin: 10 })).toThrow();
  });
  it('aceita exatamente o máximo global', () => {
    expect(() => validarDuracao(DURACAO_MAXIMA_MIN, corte)).not.toThrow();
  });
  it('recusa acima do máximo global mesmo com piso baixo', () => {
    expect(() => validarDuracao(DURACAO_MAXIMA_MIN + 1, { duracaoMinimaMin: 10 }))
      .toThrow(/no máximo 60/);
  });
});
