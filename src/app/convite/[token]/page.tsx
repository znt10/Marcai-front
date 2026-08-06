import { barbeariaAtual } from '@/lib/tenant';
import { Frame, StatusBar, Sub } from '@/components/wf';
import { DefinirSenha } from '@/components/DefinirSenha';

export default async function Convite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Resolve o tenant pelo subdomínio: o link do convite aponta para a
  // barbearia dele, e um 404 aqui já diz que o endereço está errado.
  const b = await barbeariaAtual();

  return (
    <Frame>
      <StatusBar />
      <h1 className="text-[17px] md:text-2xl font-normal m-0">Criar sua senha</h1>
      <Sub>{b.nome}</Sub>
      <DefinirSenha token={token} />
    </Frame>
  );
}
