/// Prepara a foto ANTES de ela sair do aparelho: recorta no quadrado do meio,
/// reduz e reencoda. É o que faz a foto caber na coluna de texto onde ela mora,
/// sem storage de arquivo nenhum do outro lado.
///
/// Por que aqui e não no servidor: a vitrine é renderizada no SERVIDOR, então
/// cada foto entra embutida no HTML da primeira tela que o cliente abre na
/// calçada. Uma foto de câmera tem 3–5 MB; mandá-la inteira para o servidor
/// reduzir gastaria os dados de quem está no 4G para jogar 99% fora. Reduzindo
/// antes, sobe ~6 KB.
///
/// O servidor NÃO confia nisto — `app/services/foto.py` refaz as checagens.
/// Aqui é conveniência de quem usa a tela; lá é a regra.

/// Espelha FOTO_LADO_PX do `tenant/config.py`. Quadrado porque todo lugar que
/// desenha a foto é um círculo — recortar depois, no CSS, faria o navegador
/// carregar pixel que ninguém vê.
const LADO = 128;

/// Espelha FOTO_TAMANHO_MAXIMO_BYTES. Aqui serve para escolher a qualidade;
/// quem recusa de verdade é o servidor.
const TETO_BYTES = 20 * 1024;

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

const carregar = (arquivo: File) =>
  new Promise<HTMLImageElement>((ok, erro) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('imagem ilegível')); };
    img.src = url;
  });

export class ErroDeFoto extends Error {}

/// Devolve a data URL pronta para o `PUT /painel/foto`.
export async function prepararFoto(arquivo: File): Promise<string> {
  // O `accept` do input é sugestão — o seletor do sistema deixa escolher
  // "todos os arquivos" em quase todo aparelho.
  if (!TIPOS.includes(arquivo.type)) {
    throw new ErroDeFoto('Escolhe uma foto (JPG, PNG ou WebP).');
  }

  const img = await carregar(arquivo).catch(() => {
    throw new ErroDeFoto('Não consegui abrir essa foto. Tenta outra?');
  });

  // O quadrado do MEIO, e não a imagem esticada: uma foto de retrato virando
  // 128×128 deformaria o rosto, que é justamente o conteúdo.
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  if (!lado) throw new ErroDeFoto('Não consegui abrir essa foto. Tenta outra?');
  const x = (img.naturalWidth - lado) / 2;
  const y = (img.naturalHeight - lado) / 2;

  const tela = document.createElement('canvas');
  tela.width = LADO;
  tela.height = LADO;
  const pincel = tela.getContext('2d');
  if (!pincel) throw new ErroDeFoto('Não consegui preparar a foto aqui. Tenta outra?');
  pincel.drawImage(img, x, y, lado, lado, 0, 0, LADO, LADO);

  // WebP primeiro; JPEG onde ele não existir. A qualidade cai por degraus até
  // caber — uma foto com muito detalhe fica maior na mesma medida, e um valor
  // fixo ou desperdiçaria nitidez ou estouraria o teto.
  for (const tipo of ['image/webp', 'image/jpeg']) {
    for (const qualidade of [0.8, 0.7, 0.6, 0.45]) {
      const url = tela.toDataURL(tipo, qualidade);
      // `toDataURL` cai para PNG quando o tipo não é suportado — checar o
      // prefixo é o que evita mandar um PNG de 40 KB achando que é WebP.
      if (!url.startsWith(`data:${tipo}`)) break;
      // O tamanho que importa é o dos BYTES, não o da string base64, que é
      // ~4/3 maior — é assim que o servidor mede.
      if (Math.ceil((url.length - url.indexOf(',') - 1) * 0.75) <= TETO_BYTES) return url;
    }
  }
  throw new ErroDeFoto('Essa foto é pesada demais. Tenta uma mais simples?');
}
