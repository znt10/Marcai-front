/// A moldura, separada em duas responsabilidades.
///
/// Os 300px do desenho original eram a moldura do APARELHO, não uma medida da
/// interface. Presa neles, uma janela de 550px ficava com uma tira no meio e
/// faixa vazia dos dois lados. Então a superfície ocupa a tela inteira, em
/// qualquer largura, e quem tem teto é o conteúdo — por legibilidade, não por
/// formato.
///
/// `largo` é para as telas que se reorganizam em mais de uma coluna: a home e
/// o quadro do dia. O resto do sistema é conteúdo estreito por natureza — sem
/// o teto de 560px, a tela de confirmado esticaria o texto por 1440px.
export function Frame({
  largo = false, children,
}: { largo?: boolean; children: React.ReactNode }) {
  return (
    <div className="w-full min-h-dvh p-5 sm:p-7 md:p-10">
      <div
        className={`mx-auto w-full flex flex-col gap-3 md:gap-3.5
                    ${largo ? 'max-w-[1100px]' : 'max-w-[560px]'}`}
      >
        {children}
      </div>
    </div>
  );
}
