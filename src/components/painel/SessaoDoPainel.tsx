'use client';
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { usePathname } from 'next/navigation';
import { painelApi, ignorarAborto, type Eu } from '@/lib/api';
import { lembrado, lembrar } from '@/lib/eu-lembrado';

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
  // Começa do que o navegador lembra, não de `null`. A função no `useState`
  // roda uma vez, ANTES da primeira pintura, então a barra de seções já nasce
  // com as abas certas e o cabeçalho com o nome — em vez de aparecerem quando
  // `/api/auth/eu` responde, que era o pisca de toda carga de página.
  //
  // No servidor `lembrado()` devolve `null` (não há `localStorage` lá), então
  // o HTML renderizado no servidor é o estado "sem ninguém". Isso é de
  // propósito: o painel é conteúdo de sessão, e mandar nome de gente no HTML
  // de servidor seria pior que um quadro a mais de pintura.
  const [eu, setEu] = useState<Eu | null>(lembrado);
  // `carregando` responde "ainda não sei quem é", e com a cópia em mãos eu já
  // sei — mesmo que ela possa estar velha. Quem consome usa isto para decidir
  // se desenha; a revalidação abaixo corrige o desenho se o servidor
  // discordar.
  const [carregando, setCarregando] = useState(() => lembrado() === null);
  const naEntrada = caminho === '/painel/login';

  useEffect(() => {
    // Na entrada não há sessão para buscar, e buscar levaria a: `eu()` passa
    // `loginEm: LOGIN_DO_PAINEL`, e um 401 na própria tela de login
    // redirecionaria para a tela de login — laço. Mesma guarda que
    // `NavPainel` já usava antes de a busca vir para cá.
    if (naEntrada) { setCarregando(false); return; }
    const ctrl = new AbortController();
    // Revalida SEMPRE, inclusive quando a cópia existe: nome, foto e papel
    // mudam (o dono promove alguém, alguém troca a própria foto), e a sessão
    // pode ter morrido. O que voltar daqui manda — a cópia só adiantou a
    // pintura. Um 401 nem chega a este `.then`: o `client.ts` redireciona
    // para a entrada e esquece a cópia lá.
    painelApi.eu(ctrl.signal)
      .then((atual) => { setEu(atual); lembrar(atual); })
      .catch(ignorarAborto)
      .finally(() => setCarregando(false));
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
