'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SECOES, rotuloDaSecao } from '@/components/painel/secoes';

/// A navegação do painel no celular, em lugar da barra fixa do rodapé.
///
/// A barra de baixo alcançava o polegar, mas cobria a última linha de toda
/// tela — e o `pb-24` que a compensava aparecia como folga morta em quem só
/// ia ler a agenda. Aqui a navegação some quando não está em uso: uma linha
/// no cabeçalho, que também diz onde você está.
///
/// Em linha própria, e não ao lado do nome: em 360px o nome já divide a
/// linha com o papel ("dono") e o "sair", e um alvo de toque espremido entre
/// eles seria pior que a barra que saiu.
export function SeletorDeSecao({ caminho, dono, carregando }:
  { caminho: string; dono: boolean; carregando: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  // Trocar de seção navega mas não desmonta este componente (o layout do
  // painel é o mesmo): sem isto o menu ficaria aberto sobre a tela nova.
  useEffect(() => setAberto(false), [caminho]);

  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    // `pointerdown`, não `click`: fecha no toque, antes de o dedo subir, e
    // não engole o toque no que estava embaixo.
    document.addEventListener('pointerdown', foraDaCaixa);
    return () => document.removeEventListener('pointerdown', foraDaCaixa);
  }, [aberto]);

  return (
    <div ref={caixa} className="relative md:hidden pb-3"
         onKeyDown={(e) => {
           if (e.key !== 'Escape' || !aberto) return;
           setAberto(false);
           // O foco está num link da lista que vai deixar de existir; sem
           // devolvê-lo ao botão, ele volta para o começo da página.
           botao.current?.focus();
         }}>
      <button ref={botao} type="button" disabled={carregando}
              aria-expanded={aberto} aria-haspopup="menu" aria-controls="secoes-do-painel"
              onClick={() => setAberto((a) => !a)}
              className="flex w-full items-center justify-between gap-2 border border-borda
                         bg-superficie px-3 py-2.5 font-letreiro text-sm uppercase
                         tracking-[0.06em] text-tinta disabled:text-lbl">
        {/* Enquanto `carregando`, o rótulo já é honesto — ele não depende de
            `dono`, só do caminho. O que espera é a LISTA: sem saber se você
            é dono ela nasceria com quatro itens e viraria seis. */}
        {rotuloDaSecao(caminho)}
        <span aria-hidden className={`text-lbl transition-transform ${aberto ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {aberto && (
        <nav id="secoes-do-painel" aria-label="Seções do painel"
             className="absolute inset-x-0 top-full z-30 flex flex-col border-x border-b
                        border-borda bg-superficie shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          {SECOES.filter((s) => !s.soDono || dono).map((s) => {
            const ativo = caminho === s.href;
            return (
              <Link key={s.href} href={s.href} aria-current={ativo ? 'page' : undefined}
                    onClick={() => setAberto(false)}
                    className={`relative px-3 py-3 font-letreiro text-sm uppercase
                                tracking-[0.06em] ${ativo ? 'text-acento' : 'text-sub'}`}>
                {/* A mesma barra sólida de latão das abas do desktop, de pé:
                    numa lista de largura total uma barra deitada leria como
                    separador entre dois itens, não como marca de um. */}
                {ativo && <span aria-hidden className="absolute left-0 inset-y-1 w-[3px] bg-latao" />}
                {s.rotulo}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
