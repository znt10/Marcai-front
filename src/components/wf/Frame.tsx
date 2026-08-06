/// A moldura do wireframe. No celular é a coluna de 300px do desenho
/// original, intocada; no desktop ela cresce e ganha borda, senão vira uma
/// tira branca no meio de uma tela de 1440px.
///
/// `largo` é só para a tela que se reorganiza em duas colunas no desktop (a
/// home). O resto do sistema é conteúdo estreito por natureza — alargar
/// além da conta só afastaria o rótulo do campo dele.
export function Frame({
  largo = false, children,
}: { largo?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`w-[300px] max-w-full mx-auto p-3.5 flex flex-col gap-2.5
                  bg-white text-traco [font-family:var(--font-mao)]
                  md:w-full md:p-6 md:gap-3.5 md:my-8
                  md:rounded-wf md:border-[1.5px] md:border-traco
                  ${largo ? 'md:max-w-[900px]' : 'md:max-w-[460px]'}`}
    >
      {children}
    </div>
  );
}
