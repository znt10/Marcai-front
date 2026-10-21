import { barbeariaAtual } from '@/lib/tenant';
import { CabecalhoConta } from '@/components/conta/CabecalhoConta';
import { NovaSenha } from '@/components/conta/NovaSenha';

export const metadata = { title: 'Senha nova' };

export default async function NovaSenhaPagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = await barbeariaAtual();
  return (
    <div className="fluxo min-h-dvh">
      <CabecalhoConta nome={b.nome} tipo={b.tipo} />
      <main className="mx-auto max-w-[1100px] px-[18px] pt-6 pb-10 sm:px-7 md:px-10 md:pt-10">
        <NovaSenha token={token} />
      </main>
    </div>
  );
}
