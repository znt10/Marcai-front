'use client';
import { useEffect, useRef } from 'react';
import { digitando } from '@/lib/guia';

/// O balão do guia da primeira vez (`@/lib/guia`). Desenhado DENTRO da etapa
/// que falta, logo acima do que se toca, e não flutuando por cima da página:
/// sem cálculo de posição, ele não descola do alvo ao rolar, girar o celular
/// ou abrir o teclado.
///
/// Âmbar cheio com letra escura, e texto maior que o da tela: é para quem não
/// achou o caminho sozinho, e um balão discreto seria mais um que não se vê.
export function Balao({ texto, aoPular }: { texto: string; aoPular: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Cada passo monta o seu balão, então "montou" é "o passo mudou". No
  // celular o passo seguinte quase sempre está abaixo da dobra: se o balão
  // nasceu fora da metade de cima da tela, ela rola até ele. O do primeiro
  // passo já nasce no alto, e a página não pula ao abrir. Nem pula com a
  // pessoa digitando (`digitando`).
  useEffect(() => {
    const el = ref.current;
    if (!el || digitando(document.activeElement)) return;
    const { top } = el.getBoundingClientRect();
    if (top >= 0 && top <= window.innerHeight * 0.4) return;
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calmo ? 'auto' : 'smooth', block: 'start' });
  }, []);

  return (
    <div ref={ref} role="status"
         className="relative mb-3.5 scroll-mt-4 rounded-[14px] bg-acento px-4 pt-3 pb-2.5 text-fundo">
      <p className="text-[15.5px] md:text-base font-bold leading-snug">
        <span aria-hidden>👇 </span>{texto}
      </p>
      <button type="button" onClick={aoPular}
              className="mt-1 text-[12.5px] md:text-[13px] font-semibold underline underline-offset-2">
        Já sei usar
      </button>
      {/* A ponta do balão, apontando para o que se toca logo abaixo. */}
      <span aria-hidden className="absolute -bottom-1.5 left-7 size-3 rotate-45 bg-acento" />
    </div>
  );
}

/// A dica do calendário (`mostraDicaDoCalendario`): menor que o balão, só o
/// texto em âmbar, sem fundo e sem "Já sei usar". Ela acompanha o balão do
/// horário, não disputa com ele, e por isso também não rola a tela.
export function DicaDoCalendario() {
  return (
    <p className="mb-1.5 text-[12.5px] md:text-[13px] font-semibold text-acento">
      <span aria-hidden>👇 </span>Aqui você escolhe qualquer outro dia do mês
    </p>
  );
}
