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

describe('a logo da tela: medidas e endereço, sempre banner (José, 07/11)', async () => {
  const { medidasDosBytes, logoParaTela } = await import('@/lib/logo');

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

  it('a logo da tela leva o endereço e as medidas, e quadrada não vira círculo', () => {
    const quadrada = dataUrl('image/webp', webpVp8x(512, 512));
    expect(logoParaTela(quadrada)).toEqual({
      src: `/logo?v=${versaoDaLogo(quadrada)}`, largura: 512, altura: 512,
    });
  });

  it('sem medidas continua mostrando a logo', () => {
    expect(logoParaTela(dataUrl('image/png', new Uint8Array(20)))).toMatchObject({ largura: null, altura: null });
  });

  it('logo estragada não vira imagem quebrada: a tela mostra o desenho do tipo', () => {
    expect(logoParaTela(null)).toBeNull();
    expect(logoParaTela('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(logoParaTela('data:image/png;base64,@@@')).toBeNull();
  });
});


describe('limparLogo: fundo liso fora e corte rente (José, 07/11)', async () => {
  const { limparLogo } = await import('@/lib/logo');

  /// Uma imagem w x h de `fundo`, com um retângulo `cor` de (x0,y0) a (x1,y1).
  const imagem = (w: number, h: number, fundo: number[], cor: number[], [x0, y0, x1, y1]: number[]) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dentro = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      px.set(dentro ? cor : fundo, (y * w + x) * 4);
    }
    return px;
  };
  const alfa = (r: { px: Uint8ClampedArray; w: number }, x: number, y: number) => r.px[(y * r.w + x) * 4 + 3];

  it('fundo preto liso vira transparente e a logo é cortada rente', () => {
    const px = imagem(100, 100, [0, 0, 0, 255], [220, 180, 120, 255], [30, 40, 69, 59]);
    const r = limparLogo(px, 100, 100);
    // 40 x 20 de desenho + 4% do lado maior (2px) de margem de cada lado.
    expect([r.w, r.h]).toEqual([44, 24]);
    expect(alfa(r, 0, 0)).toBe(0);
    expect(alfa(r, 22, 12)).toBe(255);
  });

  it('fundo branco liso também sai', () => {
    const px = imagem(80, 80, [255, 255, 255, 255], [20, 20, 20, 255], [10, 10, 69, 29]);
    const r = limparLogo(px, 80, 80);
    expect(r.w).toBeLessThan(80);
    expect(alfa(r, 0, 0)).toBe(0);
  });

  it('borda já transparente: só corta', () => {
    const px = imagem(60, 60, [0, 0, 0, 0], [200, 30, 30, 255], [20, 20, 39, 39]);
    const r = limparLogo(px, 60, 60);
    expect(r.w).toBeLessThan(60);
    expect(alfa(r, Math.floor(r.w / 2), Math.floor(r.h / 2))).toBe(255);
  });

  it('borda variada (foto) não é mexida', () => {
    const px = new Uint8ClampedArray(50 * 50 * 4);
    for (let i = 0; i < 50 * 50; i++) px.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4);
    const r = limparLogo(px, 50, 50);
    expect([r.w, r.h]).toEqual([50, 50]);
    expect(r.px).toBe(px);
  });
});

describe('logoSomeNoFundo (José, 07/11)', async () => {
  const { logoSomeNoFundo } = await import('@/lib/logo');

  it('dourado claro sem fundo some no nude e aparece no preto', () => {
    const elys = { media: [205, 172, 128] as [number, number, number], transparente: 0.7 };
    expect(logoSomeNoFundo(elys, '#f6e6e0')).toBe(true);
    expect(logoSomeNoFundo(elys, '#0d0a0b')).toBe(false);
  });

  it('logo com placa própria nunca é repintada', () => {
    expect(logoSomeNoFundo({ media: [250, 250, 250], transparente: 0 }, '#f6f0e3')).toBe(false);
  });
});
