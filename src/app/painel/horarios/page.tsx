'use client';
import { Frame, Sub } from '@/components/wf';
import { Horarios } from '@/components/painel/Horarios';
import { useEu } from '@/components/painel/SessaoDoPainel';

export default function HorariosDoPainel() {
  // `eu` vem do provider do layout, buscado uma vez por sessão — não mais
  // uma busca própria desta tela. Ver `SessaoDoPainel.tsx`.
  const { eu } = useEu();

  return (
    <Frame>
      <h1>Horários</h1>
      {/* Todo mundo entra aqui: cada um mexe no seu, e o dono no de todos. */}
      {eu ? <Horarios eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
