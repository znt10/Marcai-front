'use client';
import { Frame, Sub } from '@/components/wf';
import { Servicos } from '@/components/painel/Servicos';
import { useEu } from '@/components/painel/SessaoDoPainel';

export default function ServicosDoPainel() {
  // `eu` vem do provider do layout, buscado uma vez por sessão — não mais
  // uma busca própria desta tela. Ver `SessaoDoPainel.tsx`.
  const { eu } = useEu();

  return (
    <Frame>
      <h1>Serviços</h1>
      {/* Todos entram: cada um marca o que faz. O catálogo, embaixo, só o dono. */}
      {eu ? <Servicos eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
