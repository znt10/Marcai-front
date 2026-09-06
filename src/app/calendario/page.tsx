import { Frame, Sub } from '@/components/wf';
import { MiniCalendario } from '@/components/MiniCalendario';
import { urlAgendar } from '@/lib/escolha';

export default async function Calendario({
  searchParams,
}: { searchParams: Promise<{ barbeiroId?: string; servicoId?: string; inicio?: string }> }) {
  const { barbeiroId, servicoId, inicio } = await searchParams;
  // `inicio` não desenha nada nesta tela: quem chegou aqui veio TROCAR de dia.
  // Ele viaja junto só para o "voltar" poder desistir de verdade — devolvendo
  // a pessoa ao horário que ela já tinha na mão, e não a um formulário limpo.
  const voltar = urlAgendar({ barbeiroId, servicoId, inicio });
  // Os dois são obrigatórios: a grade de dias com vaga depende da duração,
  // que é por barbeiro E serviço. Sem um deles não há o que desenhar.
  if (!barbeiroId || !servicoId) {
    return (
      <Frame>
        <Sub>Escolhe o barbeiro e o serviço antes.</Sub>
        <a href={voltar} className="text-[11px] md:text-xs text-lbl">‹ voltar</a>
      </Frame>
    );
  }
  return (
    <Frame>
      <a href={voltar} className="text-[11px] md:text-xs text-lbl">‹ voltar</a>
      <h1>Escolher outro dia</h1>
      <MiniCalendario barbeiroId={barbeiroId} servicoId={servicoId} />
    </Frame>
  );
}
