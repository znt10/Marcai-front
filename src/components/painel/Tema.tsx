'use client';
import { useEffect, useState } from 'react';

/// Claro ou escuro, no painel.
///
/// O Figma desenha as seis telas nas duas paletas, e a troca em si mora no
/// CSS (ver o bloco `.painel` em `globals.css`): aqui só se escreve
/// `data-tema` no `<html>`, e a cascata faz o resto. Nenhum componente do
/// painel sabe em que modo está, e é assim que uma tela nova nasce nos dois.
///
/// Guardado por aparelho, não por conta: quem usa o painel no tablet do balcão
/// com a luz acesa e no celular no escuro quer coisas diferentes nos dois, e
/// uma preferência no servidor daria a mesma resposta para os dois.
export type Tema = 'claro' | 'escuro';

const CHAVE = 'tema-do-painel';

/// O que o `<html>` já tem escrito — pelo script de `layout.tsx`, que roda
/// antes da primeira pintura, ou por um toque anterior nesta sessão. Sem
/// atributo, quem manda é a preferência do sistema.
function temaAtual(): Tema {
  if (typeof document === 'undefined') return 'escuro';
  const escrito = document.documentElement.dataset.tema;
  if (escrito === 'claro' || escrito === 'escuro') return escrito;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro';
}

export function BotaoDeTema() {
  // Nasce com o valor do servidor e só descobre o de verdade depois de montar:
  // `localStorage` e `matchMedia` não existem na renderização do servidor, e
  // chutar aqui é o que faria o React reclamar de hidratação.
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => setTema(temaAtual()), []);

  function trocar() {
    const novo: Tema = (tema ?? temaAtual()) === 'claro' ? 'escuro' : 'claro';
    document.documentElement.dataset.tema = novo;
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Navegador com armazenamento bloqueado: a troca vale para esta visita
      // e é isso. Deixar de trocar seria pior do que não lembrar.
    }
    setTema(novo);
  }

  return (
    <button
      onClick={trocar}
      // Enquanto não sabe o tema, o botão já existe e ocupa o lugar dele — o
      // rótulo é que espera. Sem isto o "sair" saltaria de lugar ao montar.
      className="shrink-0 text-[12.5px] font-medium text-sub hover:text-acento"
      aria-label={tema === 'claro' ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'}
    >
      {tema === null ? ' ' : tema === 'claro' ? 'escuro' : 'claro'}
    </button>
  );
}

/// Roda antes da primeira pintura, no `<head>`: sem ele, quem escolheu claro
/// veria a tela escura por um quadro a cada carregamento de página — o pisca
/// que todo produto com tema guardado tem quando a escolha só chega no React.
///
/// Fica como string porque é exatamente isso que ele precisa ser: um
/// `<script>` que já rodou quando o React monta.
export const SCRIPT_DO_TEMA = `try{var t=localStorage.getItem('${CHAVE}');`
  + `if(t==='claro'||t==='escuro')document.documentElement.dataset.tema=t;}catch(e){}`;
