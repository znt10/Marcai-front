import Link from 'next/link';
import { barbeariaAtual } from '@/lib/tenant';
import { cartaoDestaPagina } from '@/lib/miniatura';
import { FormAgendamento } from '@/components/FormAgendamento';

export async function generateMetadata() {
  const b = await barbeariaAtual();
  return {
    title: `Marcar horário · ${b.nome}`,
    ...(await cartaoDestaPagina(b.nome, `Escolha o serviço, o barbeiro e o horário. ${b.endereco}.`)),
  };
}

/// A tela de marcar, no desenho "Fluxo do cliente — v2" (sem a trilha
/// 1-2-3-4 do topo, que saiu a pedido: os números das etapas já dizem onde a
/// pessoa está). O `.fluxo` em `globals.css` é o escopo de estilo dela.
///
/// Não usa `<Frame>`: o cabeçalho sangra de borda a borda com o fio embaixo,
/// e o `Frame` põe o respiro em volta de tudo.
export default async function Agendar({
  searchParams,
}: { searchParams: Promise<{ barbeiroId?: string; servicoId?: string; inicio?: string }> }) {
  const b = await barbeariaAtual();
  // A volta do calendário chega por aqui. Ler no servidor e passar como prop
  // evita useSearchParams() e a fronteira de Suspense que ele exigiria.
  const { barbeiroId, servicoId, inicio } = await searchParams;

  return (
    <div className="fluxo min-h-dvh">
      <header className="border-b border-borda">
        {/* O cabeçalho inteiro é a volta para a vitrine. O desenho não tem o
            "‹ a barbearia" do rodapé, e sem isto a única saída seria o voltar
            do navegador. */}
        <Link href="/" aria-label={`Voltar para a barbearia ${b.nome}`}
              className="mx-auto flex max-w-[1100px] items-center gap-[9px]
                         px-[18px] pt-4 pb-3.5 sm:px-7 md:px-10 md:py-5">
          <img src="/marca.png" alt="" width={22} height={22}
               className="rounded-[5px] shrink-0 md:size-[28px]" />
          <span className="text-[16px] md:text-[19px] font-extrabold text-tinta">Marcaí</span>
          {/* O horário de funcionamento e o endereço ficaram na vitrine: aqui
              a pessoa já decidiu entrar, e o topo só confirma onde ela está. */}
          <span className="ml-1.5 min-w-0 truncate border-l border-borda pl-1.5
                           text-[10.5px] md:text-xs font-semibold uppercase text-lbl">
            {b.nome} barbearia
          </span>
        </Link>
      </header>

      <main className="mx-auto max-w-[1100px] px-[18px] pt-[18px] pb-8 sm:px-7 md:px-10 md:pt-8">
        <FormAgendamento inicial={{ barbeiroId, servicoId, inicio }} />
      </main>
    </div>
  );
}
