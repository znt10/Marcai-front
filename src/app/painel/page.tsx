import { Frame, Lbl, Box } from '@/components/wf';

export default function Painel() {
  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Painel do barbeiro</h1>
      <Lbl>Chega na próxima etapa.</Lbl>
      <a href="/"><Box variante="fill">← voltar para agendar um corte</Box></a>
    </Frame>
  );
}
