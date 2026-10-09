import { describe, expect, it } from 'vitest';
import { precisaAtualizar } from '@/lib/versao';

/// A faixa "atualize" aparece por cima de quem está marcando um horário. Ela
/// só pode aparecer quando houve deploy de verdade, nunca por um fetch que
/// caiu no meio do expediente.
describe('precisaAtualizar', () => {
  it('avisa quando o servidor está num build diferente', () => {
    expect(precisaAtualizar('1760000000000', '1760000999999')).toBe(true);
  });

  it('não avisa quando as duas versões são a mesma', () => {
    expect(precisaAtualizar('1760000000000', '1760000000000')).toBe(false);
  });

  it('não avisa quando a resposta do servidor não veio', () => {
    expect(precisaAtualizar('1760000000000', undefined)).toBe(false);
    expect(precisaAtualizar('1760000000000', '')).toBe(false);
  });

  it('não avisa quando o próprio aparelho não sabe em que versão está', () => {
    expect(precisaAtualizar(undefined, '1760000999999')).toBe(false);
    expect(precisaAtualizar('', '1760000999999')).toBe(false);
  });

  it('não avisa em desenvolvimento', () => {
    expect(precisaAtualizar('dev', '1760000999999')).toBe(false);
  });
});
