'use client';
import { useSyncExternalStore } from 'react';

/// O que a faixa da mensalidade e o botão da barra de cima dividem: se há uma
/// faixa que se recolhe e se ela está recolhida agora. A faixa mora no
/// `PortaoDaMensalidade` e o botão na `NavPainel`, irmãos no layout — daí um
/// estado de módulo em vez de contexto.
///
/// O instante do recolhimento fica no aparelho (`localStorage`); sem ele (aba
/// anônima) a faixa só volta ao recarregar.

const CHAVE = 'marcai:faixa-da-mensalidade-recolhida-em';

type Estado = { recolhivel: boolean; recolhidaEm: number | null };

let estado: Estado = { recolhivel: false, recolhidaEm: null };
const ouvintes = new Set<() => void>();

function mudar(novo: Partial<Estado>) {
  estado = { ...estado, ...novo };
  ouvintes.forEach((o) => o());
}

export function lerRecolhidaEm(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/// O portão diz se a faixa de agora é das que se recolhem.
export function definirRecolhivel(recolhivel: boolean) {
  if (estado.recolhivel !== recolhivel) mudar({ recolhivel });
}

export function carregarRecolhida() {
  mudar({ recolhidaEm: lerRecolhidaEm() });
}

export function recolher() {
  const agora = Date.now();
  try { localStorage.setItem(CHAVE, String(agora)); } catch { /* sem storage */ }
  mudar({ recolhidaEm: agora });
}

export function abrir() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem storage */ }
  mudar({ recolhidaEm: null });
}

const SERVIDOR: Estado = { recolhivel: false, recolhidaEm: null };

export function useAvisoDaMensalidade(): Estado {
  return useSyncExternalStore(
    (o) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
    () => estado,
    () => SERVIDOR,
  );
}
