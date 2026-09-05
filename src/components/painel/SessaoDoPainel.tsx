'use client';
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { usePathname } from 'next/navigation';
import { painelApi, ignorarAborto, type Eu } from '@/lib/api';

/// `eu` buscado UMA VEZ por visita ao painel, aqui, e compartilhado por
/// contexto — não uma busca por tela. Antes eram seis: `NavPainel`,
/// `AgendaDoDia`, e as quatro páginas com `eu` no corpo, cada uma com seu
/// próprio `useState`/`useEffect`/`AbortController`. Isso só passou a ser
/// possível quando as abas do painel viraram `next/link` (`1b127b9`): a
/// partir daí `layout.tsx` persiste entre as telas, então um provider
/// montado aqui sobrevive à navegação em vez de remontar a cada troca.
///
/// A mais visível das seis buscas era a de `NavPainel`: ver o comentário
/// sobre a barra de seções lá para o resto do conserto.
type SessaoDoPainel = {
  eu: Eu | null;
  /// Distingue "a resposta ainda não voltou" de "não há sessão" — as duas
  /// deixam `eu` em `null`, e quem consome precisa saber qual é qual. A
  /// tela de equipe, por exemplo, decide o que mostrar (nada, "carregando",
  /// ou um dos dois ramos) a partir disto, não só de `eu`.
  carregando: boolean;
  /// Exposto para `NavPainel` atualizar `eu.fotoUrl` localmente depois de
  /// trocar a foto — sem refazer a busca, que traria o mesmo dado de novo.
  setEu: Dispatch<SetStateAction<Eu | null>>;
};

const Contexto = createContext<SessaoDoPainel | null>(null);

export function ProvedorDaSessao({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const [eu, setEu] = useState<Eu | null>(null);
  const [carregando, setCarregando] = useState(true);
  const naEntrada = caminho === '/painel/login';

  useEffect(() => {
    // Na entrada não há sessão para buscar, e buscar levaria a: `eu()` passa
    // `loginEm: LOGIN_DO_PAINEL`, e um 401 na própria tela de login
    // redirecionaria para a tela de login — laço. Mesma guarda que
    // `NavPainel` já usava antes de a busca vir para cá.
    if (naEntrada) { setCarregando(false); return; }
    const ctrl = new AbortController();
    painelApi.eu(ctrl.signal).then(setEu).catch(ignorarAborto).finally(() => setCarregando(false));
    return () => ctrl.abort();
  }, [naEntrada]);

  return <Contexto.Provider value={{ eu, carregando, setEu }}>{children}</Contexto.Provider>;
}

/// `eu` já chegou (ou está a caminho) quando qualquer tela do painel monta —
/// leia daqui, não busque de novo. Lança se usado fora de `ProvedorDaSessao`,
/// que `src/app/painel/layout.tsx` já monta para todo o painel.
export function useEu(): SessaoDoPainel {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useEu() fora de ProvedorDaSessao — falta o provider no layout.');
  return ctx;
}
