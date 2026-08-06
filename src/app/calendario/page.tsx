import { Frame, StatusBar, Lbl } from '@/components/wf';
import { MiniCalendario } from '@/components/MiniCalendario';

export default async function Calendario({
  searchParams,
}: { searchParams: Promise<{ barbeiroId?: string; servicoId?: string }> }) {
  const { barbeiroId = 'qualquer', servicoId } = await searchParams;
  if (!servicoId) {
    return <Frame><Lbl>Escolhe o serviço antes.</Lbl><a href="/">‹ voltar</a></Frame>;
  }
  return (
    <Frame>
      <StatusBar />
      <a href="/" className="text-[11px] text-lbl">‹ voltar</a>
      <h1 className="text-[17px] font-normal m-0">Escolher outro dia</h1>
      <MiniCalendario barbeiroId={barbeiroId} servicoId={servicoId} />
    </Frame>
  );
}
