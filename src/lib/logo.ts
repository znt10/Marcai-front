/// A logo da casa (spec 2026-11-05): o dono sobe pela tela Equipe, e ela
/// aparece em destaque na vitrine e no agendado.
///
/// Irmã de `lib/foto.ts`, com uma diferença que muda tudo: a logo NÃO é
/// cortada. Uma logo comprida tem de aparecer comprida, e uma redonda,
/// redonda — então reduzimos pelo LADO MAIOR, mantendo a proporção, e nunca
/// ampliamos. O fundo transparente também fica: WebP guarda alfa, e o JPEG
/// (que não guarda) é só a última saída.
///
/// Mora no banco como data URL, como a foto. O servidor NÃO confia nisto —
/// `app/services/logo.py` refaz as checagens.

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

/// O `src` das telas do cliente: `/logo?v=<versão>`, ou nulo sem logo.
export function srcDaLogo(logoUrl: string | null | undefined): string | null {
  return logoUrl ? `/logo?v=${versaoDaLogo(logoUrl)}` : null;
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

  for (const t of tentativasDaLogo(img.naturalWidth, img.naturalHeight)) {
    if (semSuporte.has(t.tipo)) continue;
    // Mudar o tamanho do canvas o limpa: ele volta transparente.
    tela.width = t.largura;
    tela.height = t.altura;
    if (t.tipo === 'image/jpeg') {
      pincel.fillStyle = fundo;
      pincel.fillRect(0, 0, t.largura, t.altura);
    }
    // A imagem INTEIRA, sem recorte.
    pincel.drawImage(img, 0, 0, t.largura, t.altura);
    const url = tela.toDataURL(t.tipo, t.qualidade);
    // `toDataURL` cai para PNG quando o tipo não é suportado (o WebP no
    // Safari): sem conferir o prefixo, mandaríamos um PNG achando que é WebP.
    if (!url.startsWith(`data:${t.tipo}`)) { semSuporte.add(t.tipo); continue; }
    if (bytesDe(url) <= TETO_BYTES) return url;
  }
  throw new ErroDeLogo('Essa logo é pesada demais. Tenta uma mais simples?');
}
