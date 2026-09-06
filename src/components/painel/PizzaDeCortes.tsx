'use client';
import { useState } from 'react';
import { Lbl } from '@/components/wf';
import type { LinhaDoResumo } from '@/lib/api';
import { porcentagens } from '@/lib/resumo';

/// A divisão dos cortes do período entre a equipe — "que pedaço do movimento
/// foi meu".
///
/// Ela NÃO responde "quem fez mais": as linhas por barbeiro, com o número e a
/// barra, já respondem isso e respondem melhor. Duas fatias de 40 e 43 cortes
/// são indistinguíveis a olho; os dois números, não. A pizza existe para a
/// outra pergunta, a de proporção, e é por isso que as duas coisas convivem
/// na tela em vez de uma substituir a outra.
///
/// ## Por que QUATRO cores, e não seis
///
/// Numa pizza qualquer fatia pode ser comparada com qualquer outra — e a
/// primeira e a última ainda se encostam no anel. Então a paleta precisa
/// passar no teste de TODOS os pares, não só dos vizinhos, e é aí que o tema
/// escuro aperta: a faixa de claridade utilizável (OKLCH L entre 0.48 e 0.67)
/// não comporta seis matizes que sobrevivam a daltonismo. Cinco e seis foram
/// medidos e reprovaram; quatro passa nos cinco testes, com pior separação
/// ΔE 9.3 sob deuteranopia e 19.4 em visão normal.
///
/// Do quinto barbeiro em diante a cauda vira "outros", em cinza. Inventar uma
/// quinta cor seria produzir duas fatias que parte das pessoas lê como uma só.
const CORES = ['#b88819', '#4a8ed0', '#c2537f', '#2e7a45'];
/// Cinza de recuo, fora da paleta categórica de propósito: "outros" não é uma
/// identidade, é a ausência de uma.
const COR_OUTROS = '#6c5e54';
const MAXIMO_DE_FATIAS = CORES.length;

type Fatia = { nome: string; cortes: number; cor: string };

function fatiasDe(linhas: LinhaDoResumo[]): Fatia[] {
  const comCorte = linhas.filter((l) => l.cortes > 0).sort((a, b) => b.cortes - a.cortes);
  if (comCorte.length <= MAXIMO_DE_FATIAS) {
    return comCorte.map((l, i) => ({ nome: l.barbeiroNome, cortes: l.cortes, cor: CORES[i] }));
  }
  // Dobra a cauda em vez de gerar cor nova. Os maiores ficam nomeados porque
  // são sobre quem a pergunta é.
  const cabeca = comCorte.slice(0, MAXIMO_DE_FATIAS - 1);
  const cauda = comCorte.slice(MAXIMO_DE_FATIAS - 1);
  return [
    ...cabeca.map((l, i) => ({ nome: l.barbeiroNome, cortes: l.cortes, cor: CORES[i] })),
    {
      nome: `outros (${cauda.length})`,
      cortes: cauda.reduce((s, l) => s + l.cortes, 0),
      cor: COR_OUTROS,
    },
  ];
}

const R = 52;
const CENTRO = 60;
const ponto = (raio: number, giro: number) => [
  CENTRO + raio * Math.cos(giro * 2 * Math.PI - Math.PI / 2),
  CENTRO + raio * Math.sin(giro * 2 * Math.PI - Math.PI / 2),
];

export function PizzaDeCortes({ linhas }: { linhas: LinhaDoResumo[] }) {
  const [sobre, setSobre] = useState<number | null>(null);

  const fatias = fatiasDe(linhas);
  const total = fatias.reduce((s, f) => s + f.cortes, 0);

  // Some em dois casos, e os dois por falta de pergunta, não por falta de
  // dado: sem corte no período não há divisão nenhuma para mostrar, e com uma
  // fatia só o desenho é um círculo cheio dizendo "100%" — o número embaixo
  // já diz isso, melhor.
  if (total === 0 || fatias.length < 2) return null;

  // As porcentagens saem de `porcentagens` e nao de um `Math.round` por
  // fatia: arredondadas uma a uma elas somam 99 ou 101, e uma pizza cuja
  // legenda nao fecha em cem desmente a propria pizza.
  const pct = porcentagens(fatias.map((f) => f.cortes));
  let acumulado = 0;
  const desenhadas = fatias.map((f, i) => {
    const inicio = acumulado;
    // O ANGULO usa a fracao exata, nao a porcentagem inteira: o desenho fecha
    // a volta certinha, e o arredondamento fica so' no texto.
    acumulado += f.cortes / total;
    return { ...f, i, inicio, fim: acumulado, parte: f.cortes / total, pct: pct[i] };
  });

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg
        viewBox="0 0 120 120" width="120" height="120" className="shrink-0"
        role="img"
        aria-label={`Divisão dos ${total} cortes: ${desenhadas
          .map((f) => `${f.nome}, ${f.pct} por cento`)
          .join('; ')}`}
      >
        {desenhadas.map((f) => {
          const [x1, y1] = ponto(R, f.inicio);
          const [x2, y2] = ponto(R, f.fim);
          const maior = f.parte > 0.5 ? 1 : 0;
          const apagada = sobre !== null && sobre !== f.i;
          return (
            <path
              key={f.nome}
              // `stroke` na cor da superfície é o vão de 2px entre fatias
              // vizinhas: sem ele, duas cores encostadas viram uma mancha só
              // na borda, que é justamente onde o olho compara.
              stroke="var(--color-superficie)" strokeWidth="2"
              fill={f.cor}
              opacity={apagada ? 0.35 : 1}
              className="transition-opacity"
              onMouseEnter={() => setSobre(f.i)}
              onMouseLeave={() => setSobre(null)}
              d={`M ${CENTRO} ${CENTRO} L ${x1} ${y1} A ${R} ${R} 0 ${maior} 1 ${x2} ${y2} Z`}
            >
              {/* Tooltip nativo: identidade e número sem depender de hover
                  com o mouse — quem chega por teclado ou toque não fica sem. */}
              <title>{`${f.nome}: ${f.cortes} ${f.cortes === 1 ? 'corte' : 'cortes'} (${f.pct}%)`}</title>
            </path>
          );
        })}
      </svg>

      {/* A legenda está SEMPRE presente, e traz o nome escrito: a cor sozinha
          nunca é o único jeito de saber de quem é a fatia. O número vem junto
          porque é o que a pizza não sabe mostrar com precisão. */}
      <ul className="min-w-0 flex-1 flex flex-col gap-1.5">
        {desenhadas.map((f) => (
          <li
            key={f.nome}
            className="flex items-baseline gap-2 text-[13px] md:text-sm"
            onMouseEnter={() => setSobre(f.i)}
            onMouseLeave={() => setSobre(null)}
          >
            <span aria-hidden className="shrink-0 w-2.5 h-2.5 rounded-[2px] translate-y-[1px]"
                  style={{ backgroundColor: f.cor }} />
            {/* Texto em tinta de texto, nunca na cor da série: quem carrega a
                identidade é o quadradinho ao lado. */}
            <span className="min-w-0 truncate text-tinta">{f.nome}</span>
            <span className="ml-auto shrink-0 font-dado tabular-nums text-sub">
              {f.pct}%
            </span>
          </li>
        ))}
        <li>
          <Lbl className="mt-0.5">divisão dos cortes</Lbl>
        </li>
      </ul>
    </div>
  );
}
