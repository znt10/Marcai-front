/// A logo da casa (spec 2026-11-05): o dono sobe pela tela Equipe, e ela
/// aparece em destaque na vitrine e no agendado.
///
/// Irmã de `lib/foto.ts`, com uma diferença: a logo não é cortada num
/// formato fixo. Desde 07/11/2026 o upload tira o fundo LISO e corta rente ao
/// desenho (`limparLogo`), e a tela a mostra como banner, no formato dela.
/// Reduzimos pelo LADO MAIOR, mantendo a proporção, e nunca ampliamos. O
/// fundo transparente fica: WebP guarda alfa, e o JPEG (que não guarda) é só
/// a última saída.
///
/// Mora no banco como data URL, como a foto. O servidor NÃO confia nisto —
/// `app/services/logo.py` refaz as checagens.

import { contraste } from './paletas';

/// Espelha LOGO_LADO_MAXIMO_PX do `tenant/config.py` — mudar aqui exige mudar lá.
export const LADO_MAXIMO = 512;

/// Espelha LOGO_TAMANHO_MAXIMO_BYTES. Aqui serve para escolher a qualidade;
/// quem recusa de verdade é o servidor.
export const TETO_BYTES = 60 * 1024;

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

/// O tamanho em que a logo sai do aparelho: o lado maior em até
/// `LADO_MAXIMO`, a proporção intacta, e nada de ampliar a que já é pequena —
/// ampliar só gastaria bytes num borrão.
export function medidasDaLogo(largura: number, altura: number): { largura: number; altura: number } {
  const fator = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * fator)),
    altura: Math.max(1, Math.round(altura * fator)),
  };
}

/// Um resumo curto do conteúdo, para o endereço `/logo?v=<versão>`. A rota
/// responde com cache longo; trocar a logo muda a versão, e o celular busca a
/// nova em vez de mostrar a antiga.
///
/// Dois FNV-1a de 32 bits com sementes diferentes, e não `crypto` do Node:
/// este arquivo também roda no navegador (a tela Equipe), e o `target`
/// ES2017 do tsconfig não aceita BigInt. Não precisa ser criptográfico — só
/// mudar quando a logo muda.
export function versaoDaLogo(dataUrl: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < dataUrl.length; i++) {
    const c = dataUrl.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return (hex(a) + hex(b)).slice(0, 12);
}

/// Os bytes que a rota `/logo` devolve, ou nulo — sem logo, mime fora da
/// lista ou base64 estragado. Nulo vira 404, nunca 500: a tela cai no desenho
/// do tipo, e uma logo ruim no banco não derruba a vitrine.
///
/// Confere o mime de novo, e não só no back: SVG servido do domínio da casa
/// é script, e esta rota é a última porta antes do navegador.
const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

export function respostaDaLogo(logoUrl: string | null | undefined): { tipo: string; bytes: Uint8Array<ArrayBuffer> } | null {
  if (!logoUrl) return null;
  const casou = DATA_URL.exec(logoUrl.trim());
  if (!casou) return null;
  const tipo = casou[1].toLowerCase();
  if (!TIPOS.includes(tipo)) return null;
  try {
    const binario = atob(casou[2].replace(/\s/g, ''));
    return { tipo, bytes: Uint8Array.from(binario, (c) => c.charCodeAt(0)) };
  } catch {
    return null;
  }
}

type Medidas = { largura: number; altura: number };

/// Largura e altura lidas do cabeçalho da imagem, sem decodificá-la: PNG
/// (IHDR), WebP (VP8X, VP8 e VP8L, os três que o canvas escreve) e JPEG (o
/// primeiro SOF). Nulo quando não reconhece — e aí a logo é tratada como
/// banner, que nunca recorta.
export function medidasDosBytes(tipo: string, b: Uint8Array): Medidas | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const texto = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  const ok = (m: Medidas) => (m.largura > 0 && m.altura > 0 ? m : null);

  if (tipo === 'image/png') {
    if (b.length < 24 || texto(12, 4) !== 'IHDR') return null;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return ok({ largura: v.getUint32(16), altura: v.getUint32(20) });
  }
  if (tipo === 'image/webp') {
    if (b.length < 30 || texto(0, 4) !== 'RIFF' || texto(8, 4) !== 'WEBP') return null;
    const bloco = texto(12, 4);
    if (bloco === 'VP8X') return ok({ largura: u24le(24) + 1, altura: u24le(27) + 1 });
    if (bloco === 'VP8 ') return ok({ largura: (b[26] | (b[27] << 8)) & 0x3fff, altura: (b[28] | (b[29] << 8)) & 0x3fff });
    if (bloco === 'VP8L' && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return ok({ largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1 });
    }
    return null;
  }
  if (tipo === 'image/jpeg') {
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marca = b[i + 1];
      // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC), que não são quadro.
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        return ok({ altura: u16be(i + 5), largura: u16be(i + 7) });
      }
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  return null;
}

/// Sem círculo (José, 07/11/2026): toda logo aparece no formato dela, como
/// banner — o upload já tira o fundo liso e corta rente ao desenho.
export type LogoNaTela = {
  src: string;
  /// As medidas reais, para a tela reservar o espaço antes de a logo chegar.
  largura: number | null;
  altura: number | null;
};

/// O que as telas precisam para desenhar a logo, ou nulo — e nulo também
/// para a logo estragada: aí a tela mostra o desenho do tipo, e não uma
/// imagem quebrada apontando para um `/logo` que vai dar 404.
export function logoParaTela(logoUrl: string | null | undefined): LogoNaTela | null {
  const imagem = respostaDaLogo(logoUrl);
  if (!imagem || !logoUrl) return null;
  const m = medidasDosBytes(imagem.tipo, imagem.bytes);
  return {
    src: `/logo?v=${versaoDaLogo(logoUrl)}`,
    largura: m?.largura ?? null,
    altura: m?.altura ?? null,
  };
}

export class ErroDeLogo extends Error {}

const carregar = (arquivo: File) =>
  new Promise<HTMLImageElement>((ok, erro) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('imagem ilegível')); };
    img.src = url;
  });

/// Bytes de verdade, não o comprimento da string base64 (~4/3 maior): é
/// assim que o servidor mede.
const bytesDe = (url: string) => Math.ceil((url.length - url.indexOf(',') - 1) * 0.75);

/// Devolve a data URL pronta para o `PUT /painel/logo`.
export type Tentativa = {
  tipo: 'image/webp' | 'image/png' | 'image/jpeg';
  largura: number;
  altura: number;
  qualidade?: number;
};

/// A ordem em que `prepararLogo` tenta caber nos 60 KB. O que importa é não
/// perder o fundo transparente:
///
/// 1. WebP no tamanho cheio (alfa e pequeno), com a qualidade caindo.
/// 2. PNG no tamanho cheio e depois MENOR (384 e 256 no lado maior). O Safari
///    do iPhone não gera WebP, e uma PNG de 512 com detalhe passa fácil de
///    60 KB: sem os degraus menores, ela ia direto para o JPEG.
/// 3. JPEG por último. Ele não tem alfa, e o canvas pinta o transparente de
///    PRETO; por isso `prepararLogo` pinta antes o fundo da tela do cliente.
///
/// Nenhum degrau amplia a logo, e um degrau igual ao anterior não se repete.
export function tentativasDaLogo(largura: number, altura: number): Tentativa[] {
  const cheia = medidasDaLogo(largura, altura);
  const lados = [cheia.largura >= cheia.altura ? cheia.largura : cheia.altura];
  for (const lado of [384, 256]) if (lado < lados[lados.length - 1]) lados.push(lado);
  const qualidades = [0.85, 0.75, 0.6, 0.45];
  const doLado = (lado: number) => {
    const fator = lado / Math.max(cheia.largura, cheia.altura);
    return {
      largura: Math.max(1, Math.round(cheia.largura * fator)),
      altura: Math.max(1, Math.round(cheia.altura * fator)),
    };
  };
  return [
    ...qualidades.map((qualidade) => ({ tipo: 'image/webp' as const, ...cheia, qualidade })),
    ...lados.map((lado) => ({ tipo: 'image/png' as const, ...doLado(lado) })),
    ...qualidades.map((qualidade) => ({ tipo: 'image/jpeg' as const, ...cheia, qualidade })),
  ];
}

/// Devolve a data URL pronta para o `PUT /painel/logo`. `fundo` é a cor do
/// fundo da tela do cliente: só é usada se a logo tiver de virar JPEG, para o
/// transparente sair no tom da tela, e não preto.
export async function prepararLogo(arquivo: File, fundo: string): Promise<string> {
  // O `accept` do input é sugestão: o seletor deixa escolher qualquer arquivo.
  if (!TIPOS.includes(arquivo.type)) {
    throw new ErroDeLogo('Escolhe uma imagem (JPG, PNG ou WebP).');
  }

  const img = await carregar(arquivo).catch(() => {
    throw new ErroDeLogo('Não consegui abrir essa imagem. Tenta outra?');
  });
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new ErroDeLogo('Não consegui abrir essa imagem. Tenta outra?');
  }

  const tela = document.createElement('canvas');
  const pincel = tela.getContext('2d');
  if (!pincel) throw new ErroDeLogo('Não consegui preparar a logo aqui. Tenta outra?');
  const semSuporte = new Set<string>();

  // Fundo liso fora e corte rente ao desenho (07/11/2026), antes de reduzir.
  const fonte = limparNoCanvas(img) ?? img;
  const larguraFonte = fonte instanceof HTMLImageElement ? fonte.naturalWidth : fonte.width;
  const alturaFonte = fonte instanceof HTMLImageElement ? fonte.naturalHeight : fonte.height;

  for (const t of tentativasDaLogo(larguraFonte, alturaFonte)) {
    if (semSuporte.has(t.tipo)) continue;
    // Mudar o tamanho do canvas o limpa: ele volta transparente.
    tela.width = t.largura;
    tela.height = t.altura;
    if (t.tipo === 'image/jpeg') {
      pincel.fillStyle = fundo;
      pincel.fillRect(0, 0, t.largura, t.altura);
    }
    // A imagem INTEIRA, sem recorte.
    pincel.drawImage(fonte, 0, 0, t.largura, t.altura);
    const url = tela.toDataURL(t.tipo, t.qualidade);
    // `toDataURL` cai para PNG quando o tipo não é suportado (o WebP no
    // Safari): sem conferir o prefixo, mandaríamos um PNG achando que é WebP.
    if (!url.startsWith(`data:${t.tipo}`)) { semSuporte.add(t.tipo); continue; }
    if (bytesDe(url) <= TETO_BYTES) return url;
  }
  throw new ErroDeLogo('Essa logo é pesada demais. Tenta uma mais simples?');
}

/// O lado maior em que a limpeza trabalha: o bastante para a logo final
/// (512) sair nítida, e pouco o bastante para o laço ser instantâneo.
const LADO_DA_LIMPEZA = 1024;

function limparNoCanvas(img: HTMLImageElement): HTMLCanvasElement | null {
  const escala = Math.min(1, LADO_DA_LIMPEZA / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const area = document.createElement('canvas');
  area.width = w;
  area.height = h;
  const ctx = area.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let dados: ImageData;
  try { dados = ctx.getImageData(0, 0, w, h); } catch { return null; }
  const limpa = limparLogo(dados.data, w, h);
  const saida = document.createElement('canvas');
  saida.width = limpa.w;
  saida.height = limpa.h;
  const ctx2 = saida.getContext('2d');
  if (!ctx2) return null;
  ctx2.putImageData(new ImageData(new Uint8ClampedArray(limpa.px), limpa.w, limpa.h), 0, 0);
  return saida;
}

/// Tira o fundo LISO e corta rente ao desenho (José, 07/11/2026: "toda
/// logo vira um bannerzinho"). Pura, sobre os pixels RGBA, para o teste.
///
/// - Borda já transparente: só corta.
/// - Borda de uma cor só (preto, branco, qualquer): essa cor vira
///   transparente, com a transição suave nas bordas do desenho, e corta.
/// - Borda variada (foto, logo com moldura colorida): não mexe em nada.
export function limparLogo(
  px: Uint8ClampedArray, w: number, h: number,
): { px: Uint8ClampedArray; w: number; h: number } {
  const borda: number[] = [];
  for (let x = 0; x < w; x++) borda.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) borda.push(y * w, y * w + w - 1);

  const transparentes = borda.filter((i) => px[i * 4 + 3] < 20).length;
  let saida = px;
  if (transparentes / borda.length < 0.85) {
    const opacos = borda.filter((i) => px[i * 4 + 3] >= 20);
    const mediana = (c: number) => {
      const v = opacos.map((i) => px[i * 4 + c]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const fundo = [mediana(0), mediana(1), mediana(2)];
    const dist = (i: number) => Math.max(
      Math.abs(px[i * 4] - fundo[0]), Math.abs(px[i * 4 + 1] - fundo[1]), Math.abs(px[i * 4 + 2] - fundo[2]),
    );
    const lisos = opacos.filter((i) => dist(i) <= 30).length;
    if (lisos / borda.length < 0.85) return { px, w, h };

    saida = new Uint8ClampedArray(px);
    for (let i = 0; i < w * h; i++) {
      const a = Math.min(1, Math.max(0, (dist(i) - 12) / (80 - 12)));
      const o = i * 4;
      saida[o + 3] = Math.round(px[o + 3] * a);
      if (a > 0 && a < 1) {
        // A borda do desenho misturada com o fundo: tira o fundo da mistura.
        for (let c = 0; c < 3; c++) saida[o + c] = fundo[c] + (px[o + c] - fundo[c]) / a;
      }
    }
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (saida[(y * w + x) * 4 + 3] > 12) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { px, w, h };
  const margem = Math.round(0.04 * Math.max(x1 - x0 + 1, y1 - y0 + 1));
  x0 = Math.max(0, x0 - margem); y0 = Math.max(0, y0 - margem);
  x1 = Math.min(w - 1, x1 + margem); y1 = Math.min(h - 1, y1 + margem);
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const cortada = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    cortada.set(saida.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4), y * nw * 4);
  }
  return { px: cortada, w: nw, h: nh };
}

/// A logo sem fundo próprio que some no fundo da tela (07/11/2026): a da
/// Elys é dourado claro transparente, feita para o preto, e na tela clara
/// ficava quase invisível. Nesses casos a tela redesenha o MESMO desenho
/// numa cor só, o destaque da casa (que os testes das paletas garantem
/// legível sobre o fundo).
///
/// `transparente` é a fração de pixels transparentes; `media` é a cor média
/// dos pixels desenhados. Logo com placa ou fundo próprio (pouca
/// transparência) nunca muda: ela já traz o contraste dela.
export type AmostraDaLogo = { media: [number, number, number]; transparente: number };

export const CONTRASTE_MINIMO_DA_LOGO = 2.5;

export function logoSomeNoFundo(a: AmostraDaLogo, fundo: string): boolean {
  if (a.transparente < 0.15) return false;
  const hex = `#${a.media.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  return contraste(hex, fundo) < CONTRASTE_MINIMO_DA_LOGO;
}

/// Mede a logo já carregada: cor média do que é desenho e quanto é
/// transparente. Reduz para 64px antes, que é o bastante para uma média.
export function amostrarLogo(img: HTMLImageElement): AmostraDaLogo | null {
  const lado = 64;
  const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  let r = 0, g = 0, b = 0, peso = 0, vazios = 0;
  for (let i = 0; i < px.length; i += 4) {
    const alfa = px[i + 3] / 255;
    if (alfa < 0.1) { vazios++; continue; }
    r += px[i] * alfa; g += px[i + 1] * alfa; b += px[i + 2] * alfa; peso += alfa;
  }
  if (peso === 0) return null;
  return { media: [r / peso, g / peso, b / peso], transparente: vazios / (px.length / 4) };
}
