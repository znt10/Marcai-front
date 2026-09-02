import { NavPainel } from '@/components/painel/NavPainel';

/// O painel inteiro passa por aqui, inclusive `/painel/login` — a `NavPainel`
/// se apaga sozinha lá, em vez de este arquivo precisar saber quais rotas são
/// públicas.
///
/// `pb-24` no celular: a barra de seções é `fixed`, então não empurra nada.
/// Sem essa folga, o último botão de cada tela nasce embaixo dela.
///
/// `[&_.moldura]:min-h-0` desarma o `min-h-dvh` do `Frame` só aqui: com a
/// barra de topo somada a uma altura de tela inteira, TODA tela do painel
/// nasceria rolável por uns 90px de nada.
export default function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-24 md:pb-0 [&_.moldura]:min-h-0">
      <NavPainel />
      {children}
    </div>
  );
}
