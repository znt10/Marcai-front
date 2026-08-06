/// Servida quando o Host é o domínio nu — o proxy reescreve `/` para cá.
/// Deliberadamente fora do visual do wireframe: aqui não há barbearia
/// nenhuma, é a vitrine do produto.
export default function Institucional() {
  return (
    <main className="[font-family:system-ui] mx-auto max-w-[560px] px-6 py-10 md:px-10 md:py-16">
      <h1 className="text-2xl md:text-4xl">Agenda para barbearias</h1>
      <p className="mt-4 md:text-lg">Seu cliente marca sozinho pelo celular. Você vê o dia inteiro numa tela.</p>
      <p className="mt-3 md:text-lg">Cada barbearia tem o próprio endereço: <code>suabarbearia.seuapp.com.br</code></p>
    </main>
  );
}
