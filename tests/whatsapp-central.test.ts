import { describe, expect, it } from 'vitest';
import { CONFERIR_CENTRAL_MS, proximaConferencia } from '@/lib/whatsapp-central';

const desconectado = { configurado: true, conectado: false, numero: null, qrBase64: 'data:x' };

describe('proximaConferencia', () => {
  it('confere de novo enquanto está desconectado', () => {
    expect(proximaConferencia(desconectado)).toBe(CONFERIR_CENTRAL_MS);
  });

  it('confere de novo depois de um erro (sem dados)', () => {
    expect(proximaConferencia(null)).toBe(CONFERIR_CENTRAL_MS);
  });

  it('para quando conectou', () => {
    expect(proximaConferencia({ ...desconectado, conectado: true, qrBase64: null })).toBeNull();
  });

  it('para quando não há Evolution configurada', () => {
    // Em desenvolvimento não há o que esperar: conferir de 3 em 3 segundos
    // para sempre só gastaria o back.
    expect(proximaConferencia({ ...desconectado, configurado: false, qrBase64: null })).toBeNull();
  });
});
