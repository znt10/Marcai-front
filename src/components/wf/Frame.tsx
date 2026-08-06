/// A moldura do wireframe, separada em duas responsabilidades.
///
/// Os 300px do desenho original eram a moldura do APARELHO, não uma medida da
/// interface. Presa neles, uma janela de 550px ficava com uma tira branca no
/// meio, faixa vazia dos dois lados e um rabo de fundo bege embaixo. Então a
/// superfície branca passa a ocupar a tela inteira, em qualquer largura, e
/// quem tem teto é o conteúdo — por legibilidade, não por formato.
///
/// `largo` é só para a tela que se reorganiza em duas colunas (a home). O
/// resto do sistema é conteúdo estreito por natureza: sem o teto de 560px, a
/// tela de confirmado esticaria o texto por 1440px.
export function Frame({
  largo = false, children,
}: { largo?: boolean; children: React.ReactNode }) {
  return (
    <div className="w-full min-h-dvh bg-white p-4 sm:p-6 md:p-8">
      <div
        className={`mx-auto w-full flex flex-col gap-2.5 md:gap-3.5
                    text-traco [font-family:var(--font-mao)]
                    ${largo ? 'max-w-[1100px]' : 'max-w-[560px]'}`}
      >
        {children}
      </div>
    </div>
  );
}
