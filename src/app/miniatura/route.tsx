import { ImageResponse } from 'next/og';
import { buscarNoDjango, type Barbearia } from '@/lib/tenant';
import { ALTURA_MINIATURA, LARGURA_MINIATURA } from '@/lib/miniatura';
import { paleta } from '@/lib/paletas';
import { vocabulario } from '@/lib/tipos';

/// A imagem do cartão de link (`og:image`), gerada com o nome da barbearia.
/// Não há logo cadastrada — o nome, no letreiro do painel, é o que identifica.
///
/// Sem `barbeariaAtual()` de propósito: ela chama `notFound()`, que é coisa de
/// página. Aqui, barbearia que não existe (ou Django fora) cai no cartão da
/// Marcaí — um preview genérico ainda é melhor que um preview quebrado.
export async function GET() {
  let b: Barbearia | null = null;
  try {
    const r = await buscarNoDjango('/api/barbearia');
    if (r.ok) b = await r.json();
  } catch {
    b = null;
  }

  const nome = b?.nome ?? 'Marcaí';
  const linha = b ? b.endereco : 'Agendamento online';
  // As cores do estabelecimento (`paletas.ts`): o cartão do link é a primeira
  // coisa que a cliente vê dele, antes de abrir. Sem estabelecimento, a de
  // sempre.
  const { tokens: cor, esquema } = paleta(b?.paleta);
  // O rótulo do ramo vai no latão sobre o escuro, como sempre; sobre o claro
  // o latão some (é cor de sombra), e vai o destaque.
  const corDoRotulo = esquema === 'dark' ? cor.latao : cor.acento;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: cor.fundo,
          color: cor.tinta,
          borderLeft: `24px solid ${cor.acento}`,
        }}
      >
        {b ? (
          <div style={{ fontSize: 30, color: corDoRotulo, letterSpacing: 6, textTransform: 'uppercase' }}>
            {vocabulario(b.tipo).Lugar}
          </div>
        ) : null}
        <div
          style={{
            fontSize: nome.length > 22 ? 72 : 104,
            fontWeight: 700,
            lineHeight: 1.05,
            marginTop: 16,
          }}
        >
          {nome}
        </div>
        {linha ? (
          <div style={{ fontSize: 34, color: cor.sub, marginTop: 28 }}>{linha}</div>
        ) : null}
        <div
          style={{
            display: 'flex',
            marginTop: 56,
            fontSize: 34,
            fontWeight: 700,
            color: cor['no-acento'],
            background: cor.acento,
            padding: '14px 28px',
            borderRadius: 8,
            alignSelf: 'flex-start',
          }}
        >
          Marque seu horário
        </div>
      </div>
    ),
    {
      width: LARGURA_MINIATURA,
      height: ALTURA_MINIATURA,
      // O WhatsApp guarda o preview por conta própria; uma hora aqui só poupa
      // o servidor de redesenhar a mesma imagem a cada link colado.
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
