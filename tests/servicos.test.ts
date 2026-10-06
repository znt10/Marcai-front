import { describe, it, expect } from 'vitest';
import { validarDuracao } from '@/lib/servicos';
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from '@/lib/config';

describe('validarDuracao', () => {
  it('aceita exatamente o mínimo global', () => {
    expect(() => validarDuracao(DURACAO_MINIMA_MIN)).not.toThrow();
  });
  it('recusa abaixo do mínimo global', () => {
    expect(() => validarDuracao(DURACAO_MINIMA_MIN - 1)).toThrow();
  });
  it('aceita exatamente o máximo global', () => {
    expect(() => validarDuracao(DURACAO_MAXIMA_MIN)).not.toThrow();
  });
  it('recusa acima do máximo global', () => {
    expect(() => validarDuracao(DURACAO_MAXIMA_MIN + 1)).toThrow(/no máximo 60/);
  });
  it('recusa minuto quebrado', () => {
    expect(() => validarDuracao(22.5)).toThrow(/inteiro/);
  });
  // O piso por serviço ("nunca leva menos que") saiu em 06/10/2026: o tempo
  // é de cada barbeiro, e o dono não o vê nem o edita mais.
  it('não tem mais piso por serviço', () => {
    expect(() => validarDuracao(15)).not.toThrow();
  });
});
