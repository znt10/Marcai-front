import { ImageResponse } from 'next/og';
import { buscarNoDjango, type Barbearia } from '@/lib/tenant';
import { ALTURA_MINIATURA, LARGURA_MINIATURA } from '@/lib/miniatura';

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
  const linha = b ? b.endereco : 'Agendamento para barbearias';

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
          background: '#14100e',
          color: '#f2ebe1',
          borderLeft: '24px solid #febc1a',
        }}
      >
        {b ? (
          <div style={{ fontSize: 30, color: '#c98a45', letterSpacing: 6, textTransform: 'uppercase' }}>
            Barbearia
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
          <div style={{ fontSize: 34, color: '#a3948a', marginTop: 28 }}>{linha}</div>
        ) : null}
        <div
          style={{
            display: 'flex',
            marginTop: 56,
            fontSize: 34,
            fontWeight: 700,
            color: '#241a10',
            background: '#febc1a',
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
