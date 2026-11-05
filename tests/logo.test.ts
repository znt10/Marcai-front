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

describe('a imagem que a rota /logo devolve', async () => {
  const { respostaDaLogo, srcDaLogo } = await import('@/lib/logo');
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngDataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

  it('sem logo, nada: a rota responde 404 e a tela mostra o desenho do tipo', () => {
    expect(respostaDaLogo(null)).toBeNull();
    expect(respostaDaLogo(undefined)).toBeNull();
  });

  it('SVG no banco não sai, nem que alguém o tenha posto lá por fora', () => {
    expect(respostaDaLogo('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
  });

  it('base64 estragado vira 404, nunca 500', () => {
    expect(respostaDaLogo('data:image/png;base64,@@@')).toBeNull();
    expect(respostaDaLogo('https://exemplo.com/logo.png')).toBeNull();
  });

  it('a logo válida sai com o tipo e os bytes originais', () => {
    const r = respostaDaLogo(pngDataUrl);
    expect(r?.tipo).toBe('image/png');
    expect(Array.from(r!.bytes)).toEqual(Array.from(png));
  });

  it('o endereço da logo leva a versão; sem logo, nenhum endereço', () => {
    expect(srcDaLogo(null)).toBeNull();
    expect(srcDaLogo(undefined)).toBeNull();
    expect(srcDaLogo(pngDataUrl)).toBe(`/logo?v=${versaoDaLogo(pngDataUrl)}`);
  });
});
