'use client';
import { Frame } from '@/components/wf';
import { Texto, TituloDaTela } from '@/components/painel/pecas';
import { Horarios } from '@/components/painel/Horarios';
import { useEu } from '@/components/painel/SessaoDoPainel';

export default function HorariosDoPainel() {
  // `eu` vem do provider do layout, buscado uma vez por sessão — não mais
  // uma busca própria desta tela. Ver `SessaoDoPainel.tsx`.
  const { eu } = useEu();

  return (
    <Frame medio>
      <TituloDaTela titulo="Horários">
        As horas que você atende toda semana. É dentro delas que o cliente
        consegue marcar.
      </TituloDaTela>
      {/* Todo mundo entra aqui: cada um mexe no seu, e o dono no de todos. */}
      {eu ? <Horarios eu={eu} /> : <Texto>carregando…</Texto>}
    </Frame>
  );
}
