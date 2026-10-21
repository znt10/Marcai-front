import { barbeariaAtual } from '@/lib/tenant';
import { CabecalhoConta } from '@/components/conta/CabecalhoConta';
import { ContaTela } from '@/components/conta/ContaTela';

export const metadata = { title: 'Minha conta' };

/// A conta global do cliente, vista de dentro de um estabelecimento. No
/// `.fluxo`, como a tela de marcar.
export default async function Conta() {
  const b = await barbeariaAtual();
  return (
    <div className="fluxo min-h-dvh">
      <CabecalhoConta nome={b.nome} tipo={b.tipo} />
      <main className="mx-auto max-w-[1100px] px-[18px] pt-6 pb-10 sm:px-7 md:px-10 md:pt-10">
        <ContaTela />
      </main>
    </div>
  );
}
