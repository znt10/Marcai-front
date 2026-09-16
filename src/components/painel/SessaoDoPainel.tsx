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
  // Nasce VAZIO, igual ao servidor. A cópia lembrada entra logo abaixo, num
  // efeito, e a diferença entre as duas coisas é o que mantém a hidratação
  // inteira.
  //
  // Antes isto era `useState(lembrado)`, para o cabeçalho já nascer com o nome
  // e as abas em vez de esperar `/api/auth/eu` — o pisca de toda carga de
  // página. A intenção era boa e o efeito, o contrário: no servidor
  // `localStorage` não existe, então o HTML vinha "sem ninguém", enquanto o
  // PRIMEIRO render do cliente já vinha com nome, avatar e seis abas. React
  // compara exatamente esses dois e reclamava "Hydration failed... this tree
  // will be regenerated on the client" — e a palavra que importa ali é
  // REGENERATED: ele descartava a árvore do servidor e repintava tudo no
  // cliente. Ou seja, o pisca acontecia do mesmo jeito, agora com um erro
  // junto e com o trabalho de renderização feito duas vezes.
  //
  // Com a cópia entrando depois da hidratação, o pisca é o mesmo de antes (um
  // quadro), e o erro some. Não há terceira opção enquanto o nome vier do
  // `localStorage`: o servidor não tem como saber quem é, e o primeiro render
  // do cliente TEM que ser igual ao do servidor.
  const [eu, setEu] = useState<Eu | null>(null);
  // `carregando` responde "ainda não sei quem é". Começa em `true` para os
  // dois lados concordarem; o efeito da cópia o desliga no quadro seguinte,
  // sem esperar a rede, e a revalidação abaixo corrige o desenho se o
  // servidor discordar.
  const [carregando, setCarregando] = useState(true);

  // DEPOIS da hidratação, nunca durante o render: é este atraso de um quadro
  // que faz o cliente começar igual ao servidor. `[]` porque a cópia só
  // interessa na montagem — daí em diante quem manda é a revalidação.
  useEffect(() => {
    const copia = lembrado();
    if (copia) {
      setEu(copia);
      setCarregando(false);
    }
  }, []);
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
