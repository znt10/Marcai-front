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
  const { respostaDaLogo } = await import('@/lib/logo');
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

});

describe('a ordem das tentativas ao reduzir a logo (iPhone não gera WebP)', async () => {
  const { tentativasDaLogo } = await import('@/lib/logo');

  it('tenta PNG menor antes de cair no JPEG, que perde o fundo transparente', () => {
    const t = tentativasDaLogo(2000, 500);
    const primeiroJpeg = t.findIndex((x) => x.tipo === 'image/jpeg');
    const pngs = t.filter((x) => x.tipo === 'image/png');
    expect(t[0].tipo).toBe('image/webp');
    expect(pngs.map((x) => x.largura)).toEqual([512, 384, 256]);
    expect(t.slice(primeiroJpeg).every((x) => x.tipo === 'image/jpeg')).toBe(true);
    expect(primeiroJpeg).toBeGreaterThan(t.lastIndexOf(pngs[pngs.length - 1]));
  });

  it('o PNG menor mantém a proporção', () => {
    const png256 = tentativasDaLogo(2000, 500).find((x) => x.tipo === 'image/png' && x.largura === 256);
    expect(png256).toMatchObject({ largura: 256, altura: 64 });
  });

  it('logo já pequena não ganha tentativa ampliada nem repetida', () => {
    const pngs = tentativasDaLogo(300, 100).filter((x) => x.tipo === 'image/png');
    expect(pngs.map((x) => x.largura)).toEqual([300, 256]);
    expect(tentativasDaLogo(80, 80).filter((x) => x.tipo === 'image/png').map((x) => x.largura)).toEqual([80]);
  });
});

describe('logo quadrada vira redonda; banner fica banner (José, 06/11)', async () => {
  const { medidasDosBytes, formatoDaLogo, logoParaTela } = await import('@/lib/logo');

  // Cabeçalhos mínimos, do jeito que o canvas os escreve.
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  const webpVp8x = (w: number, h: number) => {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8);
    b.set([(w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16], 24);
    b.set([(h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16], 27);
    return b;
  };
  const webpVp8 = (w: number, h: number) => {
    const b = new Uint8Array(30);
    b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    b.set([...'WEBPVP8 '].map((c) => c.charCodeAt(0)), 8);
    b.set([0x9d, 0x01, 0x2a], 23);
    new DataView(b.buffer).setUint16(26, w, true); new DataView(b.buffer).setUint16(28, h, true);
    return b;
  };
  const jpeg = (w: number, h: number) => Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3,
  ]);
  const dataUrl = (tipo: string, b: Uint8Array) => `data:${tipo};base64,${Buffer.from(b).toString('base64')}`;

  it('lê largura e altura de PNG, WebP e JPEG', () => {
    expect(medidasDosBytes('image/png', png(512, 128))).toEqual({ largura: 512, altura: 128 });
    expect(medidasDosBytes('image/webp', webpVp8x(400, 400))).toEqual({ largura: 400, altura: 400 });
    expect(medidasDosBytes('image/webp', webpVp8(300, 200))).toEqual({ largura: 300, altura: 200 });
    expect(medidasDosBytes('image/jpeg', jpeg(640, 480))).toEqual({ largura: 640, altura: 480 });
  });

  it('cabeçalho que não reconhece: sem medidas, e não quebra', () => {
    expect(medidasDosBytes('image/png', new Uint8Array(5))).toBeNull();
    expect(medidasDosBytes('image/jpeg', Uint8Array.from([0xff, 0xd8, 0x00]))).toBeNull();
  });

  it('até 25% de diferença entre os lados é redonda; mais que isso é banner', () => {
    expect(formatoDaLogo(400, 400)).toBe('redonda');
    expect(formatoDaLogo(500, 400)).toBe('redonda');
    expect(formatoDaLogo(400, 500)).toBe('redonda');
    expect(formatoDaLogo(512, 400)).toBe('banner');
    expect(formatoDaLogo(512, 128)).toBe('banner');
  });

  it('a logo da tela leva o endereço, o formato e as medidas', () => {
    const quadrada = dataUrl('image/webp', webpVp8x(512, 512));
    expect(logoParaTela(quadrada)).toEqual({
      src: `/logo?v=${versaoDaLogo(quadrada)}`, redonda: true, largura: 512, altura: 512,
    });
    expect(logoParaTela(dataUrl('image/png', png(512, 128)))?.redonda).toBe(false);
  });

  it('sem medidas fica banner: nunca recorta o que não sabe o formato', () => {
    expect(logoParaTela(dataUrl('image/png', new Uint8Array(20)))).toMatchObject({ redonda: false, largura: null });
  });

  it('logo estragada não vira imagem quebrada: a tela mostra o desenho do tipo', () => {
    expect(logoParaTela(null)).toBeNull();
    expect(logoParaTela('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(logoParaTela('data:image/png;base64,@@@')).toBeNull();
  });
});
