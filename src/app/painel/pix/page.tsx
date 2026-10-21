'use client';
import { Frame } from '@/components/wf';
import { TituloDaTela } from '@/components/painel/pecas';
import { PixDoBarbeiro } from '@/components/painel/PixDoBarbeiro';

export default function PixDoPainel() {
  return (
    <Frame medio>
      <TituloDaTela titulo="Pix">
        Sua chave Pix e se o cliente paga ao marcar. Vale só para os seus horários.
      </TituloDaTela>
      <PixDoBarbeiro />
    </Frame>
  );
}
