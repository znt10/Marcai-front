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

  it('com a Meta na frente, segue o chip: confere enquanto ele está caído', () => {
    const meta = { ligada: true, configurado: true, conectado: true, numero: '83988982852' };
    const chip = { emUso: false, configurado: true, conectado: false, numero: null, qrBase64: 'data:x' };
    const dados = { configurado: true, conectado: true, numero: '83988982852', qrBase64: null, meta, evolution: chip };
    expect(proximaConferencia(dados)).toBe(CONFERIR_CENTRAL_MS);
    expect(proximaConferencia({ ...dados, evolution: { ...chip, conectado: true, qrBase64: null } })).toBeNull();
  });
});
