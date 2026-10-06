import { describe, expect, it } from 'vitest';
import { textoDasNaoEnviadas } from '@/lib/whatsapp-saudacao';

describe('textoDasNaoEnviadas', () => {
  it('não diz nada quando tudo saiu', () => {
    expect(textoDasNaoEnviadas(0)).toBeNull();
  });

  it('fala no singular para uma', () => {
    expect(textoDasNaoEnviadas(1)).toBe(
      '1 cliente não recebeu a mensagem — o WhatsApp do Marcaí estava fora do ar.',
    );
  });

  it('fala no plural para várias', () => {
    expect(textoDasNaoEnviadas(3)).toBe(
      '3 clientes não receberam a mensagem — o WhatsApp do Marcaí estava fora do ar.',
    );
  });
});
