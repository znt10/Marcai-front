import { describe, it, expect } from 'vitest';
import { medidasDaLogo, versaoDaLogo, LADO_MAXIMO, TETO_BYTES } from '@/lib/logo';

describe('as medidas da logo antes de subir', () => {
  it('espelha os números do back (tenant/config.py)', () => {
    expect(LADO_MAXIMO).toBe(512);
    expect(TETO_BYTES).toBe(60 * 1024);
  });

  it('a quadrada grande vira 512 dos dois lados', () => {
    expect(medidasDaLogo(1024, 1024)).toEqual({ largura: 512, altura: 512 });
  });

  it('a comprida continua comprida, sem cortar nem achatar', () => {
    expect(medidasDaLogo(2000, 100)).toEqual({ largura: 512, altura: 26 });
  });

  it('a em pé limita pela altura', () => {
    expect(medidasDaLogo(300, 900)).toEqual({ largura: 171, altura: 512 });
  });

  it('a pequena não é ampliada', () => {
    expect(medidasDaLogo(80, 80)).toEqual({ largura: 80, altura: 80 });
  });

  it('a fininha demais não some: pelo menos 1 pixel', () => {
    expect(medidasDaLogo(5000, 2)).toEqual({ largura: 512, altura: 1 });
  });
});

describe('a versão da logo no endereço', () => {
  const a = 'data:image/webp;base64,UklGRhAAAABXRUJQ';
  const b = 'data:image/webp;base64,UklGRhAAAABXRUJR';

  it('é a mesma para a mesma logo — o cache do celular vale', () => {
    expect(versaoDaLogo(a)).toBe(versaoDaLogo(a));
  });

  it('muda quando a logo muda — a nova aparece na hora', () => {
    expect(versaoDaLogo(a)).not.toBe(versaoDaLogo(b));
  });

  it('são 12 caracteres hexadecimais', () => {
    expect(versaoDaLogo(a)).toMatch(/^[0-9a-f]{12}$/);
  });
});
