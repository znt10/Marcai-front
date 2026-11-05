import { buscarNoDjango, type Barbearia } from '@/lib/tenant';
import { respostaDaLogo } from '@/lib/logo';

/// A logo da casa como imagem de verdade (spec 2026-11-05).
///
/// Ela mora no banco como data URL, mas não vai embutida na página: no App
/// Router todo `<img>` com data URL viaja duas vezes (no HTML e no payload do
/// RSC), e são até 80 KB de base64 em cada visita. Por aqui ela vai uma vez, e
/// o celular a guarda.
///
/// O cache é de um ano e `immutable` porque o endereço muda junto com a logo:
/// as telas pedem `/logo?v=<versão>` (`srcDaLogo`), e a versão é um resumo do
/// conteúdo. O host faz parte da chave do cache, então uma casa não vê a logo
/// da outra.
///
/// Sem `barbeariaAtual()`, como o `/miniatura`: ela chama `notFound()`, que é
/// coisa de página. Aqui, qualquer falha é 404 e a tela já tem o desenho do
/// tipo para mostrar.
export async function GET() {
  let b: Barbearia | null = null;
  try {
    const r = await buscarNoDjango('/api/barbearia');
    if (r.ok) b = await r.json();
  } catch {
    b = null;
  }

  const logo = respostaDaLogo(b?.logoUrl);
  if (!logo) return new Response(null, { status: 404 });

  return new Response(logo.bytes, {
    headers: {
      'Content-Type': logo.tipo,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // O mime vem conferido, mas o navegador não precisa adivinhar nada.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
