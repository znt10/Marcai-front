'use client';
import { abrir, useAvisoDaMensalidade } from '@/components/painel/avisoDaMensalidade';
import { RECOLHIDA_POR_MS } from '@/lib/mensalidade';

/// O aviso da mensalidade recolhido, na barra de cima ao lado do "claro". Um
/// toque devolve a faixa: recolher nunca tira do dono o caminho para pagar.
/// Some sozinho quando a faixa volta (passadas as 24 h) ou deixa de existir.
export function BotaoDoAvisoRecolhido() {
  const { recolhivel, recolhidaEm } = useAvisoDaMensalidade();
  const recolhida = recolhidaEm != null && Date.now() - recolhidaEm < RECOLHIDA_POR_MS;
  if (!recolhivel || !recolhida) return null;
  return (
    <button
      onClick={abrir}
      aria-label="Abrir o aviso da mensalidade"
      className="relative text-[12.5px] lg:text-[16px] font-medium text-sub hover:text-acento"
    >
      mensalidade
      <span aria-hidden className="absolute -right-2 -top-0.5 size-[7px] rounded-full bg-acento" />
    </button>
  );
}
