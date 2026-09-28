import type { Metadata } from 'next';
import { headers } from 'next/headers';

/// O cartão que o WhatsApp monta quando alguém cola (ou o bot manda) um link
/// da barbearia. Sem as tags `og:`, ele mostra só o endereço cru — e link cru
/// num número desconhecido é o que ninguém clica.
///
/// A imagem sai de `/miniatura` e precisa de endereço ABSOLUTO: o WhatsApp não
/// resolve caminho relativo. `metadataBase` não serve aqui porque cada
/// barbearia é um host, e ele é fixo por build.

export const LARGURA_MINIATURA = 1200;
export const ALTURA_MINIATURA = 630;

/// `https://<host>` — o jeito como o CLIENTE chegou, não o salto interno.
/// Localhost fica em http, que é como o dev roda; o resto, sem cabeçalho que
/// diga o contrário, é https: o WhatsApp não mostra imagem de preview em http.
export function origemDoPedido(host: string, protoEncaminhado: string | null): string {
  const local = /^([a-z0-9-]+\.)*localhost(:\d+)?$/i.test(host);
  const proto = protoEncaminhado?.split(',')[0].trim() || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function cartaoDoLink({
  origem,
  titulo,
  descricao,
}: {
  origem: string;
  titulo: string;
  descricao: string;
}): Pick<Metadata, 'openGraph'> {
  return {
    openGraph: {
      title: titulo,
      description: descricao,
      type: 'website',
      siteName: 'Marcaí',
      locale: 'pt_BR',
      images: [{ url: `${origem}/miniatura`, width: LARGURA_MINIATURA, height: ALTURA_MINIATURA }],
    },
  };
}

/// Atalho para as páginas: lê o host da requisição e monta o cartão.
export async function cartaoDestaPagina(titulo: string, descricao: string) {
  const h = await headers();
  const origem = origemDoPedido(h.get('host') ?? '', h.get('x-forwarded-proto'));
  return cartaoDoLink({ origem, titulo, descricao });
}
