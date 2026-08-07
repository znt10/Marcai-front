import { Frame } from '@/components/wf';
import { AgendaDoDia } from '@/components/painel/AgendaDoDia';

export default function Painel() {
  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Agenda</h1>
      <AgendaDoDia />
    </Frame>
  );
}
