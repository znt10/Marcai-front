import { Frame } from '@/components/wf';
import { AgendaDoDia } from '@/components/painel/AgendaDoDia';

export default function Painel() {
  return (
    <Frame>
      <h1>Agenda</h1>
      <AgendaDoDia />
    </Frame>
  );
}
