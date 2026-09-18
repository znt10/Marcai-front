import { Frame } from '@/components/wf';
import { AgendaDoDia } from '@/components/painel/AgendaDoDia';

/// Sem `<h1>` aqui: o cabeçalho desta tela diz a data e quantos estão
/// marcados, e os dois moram no estado de `AgendaDoDia` — o título vai junto
/// com eles, em `TituloDaTela`.

export default function Painel() {
  return (
    <Frame medio>
      <AgendaDoDia />
    </Frame>
  );
}
