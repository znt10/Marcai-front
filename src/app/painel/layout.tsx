import { NavPainel } from '@/components/painel/NavPainel';
import { ProvedorDaSessao } from '@/components/painel/SessaoDoPainel';

/// O painel inteiro passa por aqui, inclusive `/painel/login` — a `NavPainel`
/// se apaga sozinha lá, em vez de este arquivo precisar saber quais rotas são
/// públicas.
///
/// `[&_.moldura]:min-h-0` desarma o `min-h-dvh` do `Frame` só aqui: com a
/// barra de topo somada a uma altura de tela inteira, TODA tela do painel
/// nasceria rolável por uns 90px de nada.
///
/// `ProvedorDaSessao` é Client Component; este arquivo continua Server
/// Component (React não suporta contexto em Server Component) — ele só
/// importa o provider e o renderiza, sem precisar de `'use client'` próprio.
/// Envolve `NavPainel` E `children`: as duas telas do painel que ainda
/// buscam `eu` (as páginas dentro de `children`) dependem do mesmo contexto.
export default function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  return (
    <div className="[&_.moldura]:min-h-0">
      <ProvedorDaSessao>
        <NavPainel />
        {children}
      </ProvedorDaSessao>
    </div>
  );
}
