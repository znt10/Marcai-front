import { Frame, StatusBar, Lbl } from '@/components/wf';
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
        <Lbl>Escolhe o barbeiro e o serviço antes.</Lbl>
        <a href="/" className="text-[11px] md:text-xs text-lbl">‹ voltar</a>
      </Frame>
    );
  }
  return (
    <Frame>
      <StatusBar />
      <a href="/" className="text-[11px] md:text-xs text-lbl">‹ voltar</a>
      <h1 className="text-[17px] md:text-2xl font-normal m-0">Escolher outro dia</h1>
      <MiniCalendario barbeiroId={barbeiroId} servicoId={servicoId} />
    </Frame>
  );
}
