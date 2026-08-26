import { Frame, Sub } from '@/components/wf';
import { MiniCalendario } from '@/components/MiniCalendario';

export default async function Calendario({
  searchParams,
}: { searchParams: Promise<{ barbeiroId?: string; servicoId?: string }> }) {
  const { barbeiroId, servicoId } = await searchParams;
  // Os dois são obrigatórios: a grade de dias com vaga depende da duração,
  // que é por barbeiro E serviço. Sem um deles não há o que desenhar.
  if (!barbeiroId || !servicoId) {
    return (
      <Frame>
        <Sub>Escolhe o barbeiro e o serviço antes.</Sub>
        <a href="/agendar" className="text-[11px] md:text-xs text-lbl">‹ voltar</a>
      </Frame>
    );
  }
  return (
    <Frame>
      <a href="/agendar" className="text-[11px] md:text-xs text-lbl">‹ voltar</a>
      <h1>Escolher outro dia</h1>
      <MiniCalendario barbeiroId={barbeiroId} servicoId={servicoId} />
    </Frame>
  );
}
