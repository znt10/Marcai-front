import { barbeariaAtual } from '@/lib/tenant';
import { Frame, Sub } from '@/components/wf';
import { DefinirSenha } from '@/components/DefinirSenha';

export default async function Convite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Resolve o tenant pelo subdomínio: o link do convite aponta para a
  // barbearia dele, e um 404 aqui já diz que o endereço está errado.
  const b = await barbeariaAtual();

  return (
    <Frame>
      <h1>Criar sua senha</h1>
      <Sub>{b.nome}</Sub>
      <DefinirSenha token={token} />
    </Frame>
  );
}
