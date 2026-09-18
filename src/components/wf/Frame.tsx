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
///
/// `medio` é o meio-termo das telas do painel. Elas não são texto corrido: são
/// listas de cartões com duas ou três colunas dentro de cada um, e nos 560px
/// de leitura confortável para um parágrafo elas viram uma tira estreita no
/// meio do monitor — com o cartão quebrando linha que no celular não quebra.
/// 760px é o que devolve a proporção do desenho sem soltar o texto na largura
/// inteira.
export function Frame({
  largo = false, medio = false, children,
}: { largo?: boolean; medio?: boolean; children: React.ReactNode }) {
  return (
    // `moldura` nao pinta nada: e' o gancho que deixa um layout desarmar o
// `min-h-dvh` daqui (ver src/app/painel/layout.tsx).
    <div className="moldura w-full min-h-dvh p-5 sm:p-7 md:p-10">
      <div
        className={`mx-auto w-full flex flex-col gap-3 md:gap-3.5
                    ${largo ? 'max-w-[1100px]' : medio ? 'max-w-[760px]' : 'max-w-[560px]'}`}
      >
        {children}
      </div>
    </div>
  );
}
