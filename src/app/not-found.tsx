/// Alvo do notFound() de barbeariaAtual(): subdomínio que não corresponde a
/// nenhuma barbearia ativa cai aqui.
export default function NaoEncontrada() {
  return (
    <main className="[font-family:system-ui] mx-auto max-w-[560px] px-6 py-10 md:px-10 md:py-16">
      <h1 className="text-2xl md:text-4xl">Essa barbearia não está no ar.</h1>
      <p className="mt-4 md:text-lg">Confere o endereço que você digitou.</p>
    </main>
  );
}
