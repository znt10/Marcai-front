import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PALETAS, PALETAS_EM_ORDEM, PALETA_PADRAO, contraste, estiloDaPaleta, paleta,
} from '@/lib/paletas';
import { TIPOS } from '@/lib/tipos';

/// As quatro paletas do estabelecimento (spec 2026-10-08). O que este
/// arquivo prende: que nenhuma deixa texto ilegível, e que a Preto e amarelo
/// é exatamente o que a Brutus já vê.

const CSS = readFileSync(resolve(__dirname, '../src/app/globals.css'), 'utf8');

/// `--color-x: #rrggbb` de dentro do primeiro bloco que casa com `seletor`.
function cores(seletor: RegExp): Record<string, string> {
  const inicio = CSS.search(seletor);
  const bloco = CSS.slice(inicio, CSS.indexOf('\n}', inicio));
  return Object.fromEntries(
    [...bloco.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

describe('a Preto e amarelo é a de hoje', () => {
  it('os mesmos valores do @theme', () => {
    expect(PALETAS.PRETO_AMARELO.tokens).toEqual(
      Object.fromEntries(Object.keys(PALETAS.PRETO_AMARELO.tokens).map((k) => [k, cores(/@theme \{/)[k]])),
    );
  });

  it('o mesmo âmbar do painel escuro e do claro', () => {
    const { escuro, claro } = PALETAS.PRETO_AMARELO.painel;
    expect(CSS).toContain(`var(--painel-acento-escuro, ${escuro.acento})`);
    expect(CSS).toContain(`var(--painel-acento-forte-escuro, ${escuro.acentoForte})`);
    expect(CSS).toContain(`var(--painel-acento-claro, ${claro.acento})`);
    expect(CSS).toContain(`var(--painel-acento-forte-claro, ${claro.acentoForte})`);
    expect(CSS).toContain(`var(--fluxo-superficie2, ${PALETAS.PRETO_AMARELO.superficieDoFluxo})`);
  });
});

describe('contraste (WCAG AA, 4.5:1)', () => {
  for (const p of PALETAS_EM_ORDEM) {
    const { tokens: t, painel } = PALETAS[p];
    it(`${p}: texto, destaque e texto sobre o destaque`, () => {
      expect(contraste(t.tinta, t.fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.tinta, t.superficie)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.sub, t.fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.acento, t.fundo)).toBeGreaterThanOrEqual(4.5);
      // O botão que conclui (`Box fill`): `text-fundo` sobre `bg-acento`.
      expect(contraste(t.fundo, t.acento)).toBeGreaterThanOrEqual(4.5);
    });

    // 3:1, e não 4.5, no painel: é o mínimo do WCAG para destaque e
    // componente (1.4.11), e o âmbar do painel claro que o Figma desenhou
    // (#a66b22, o da Brutus) já fica em 4.1. As paletas novas não podem
    // ficar abaixo dele.
    it(`${p}: o destaque no painel escuro e no claro`, () => {
      expect(contraste(painel.escuro.acento, '#1c1814')).toBeGreaterThanOrEqual(3);
      expect(contraste(painel.claro.acento, '#faf6f0')).toBeGreaterThanOrEqual(3);
    });
  }

  it('a conta bate com valores conhecidos', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});

describe('estiloDaPaleta', () => {
  it('põe os tokens do cliente, o fluxo e o destaque do painel', () => {
    const e = estiloDaPaleta('BRANCO_ROSE') as Record<string, string>;
    expect(e['--color-acento']).toBe('#a4505e');
    expect(e['--color-fundo']).toBe('#fbf6f4');
    expect(e['--fluxo-superficie2']).toBe(PALETAS.BRANCO_ROSE.superficieDoFluxo);
    expect(e['--painel-acento-escuro']).toBe(PALETAS.BRANCO_ROSE.painel.escuro.acento);
    expect(e['--painel-acento-claro']).toBe(PALETAS.BRANCO_ROSE.painel.claro.acento);
    expect(e.colorScheme).toBe('light');
  });

  it('paleta vazia ou desconhecida é a de hoje', () => {
    expect(paleta(undefined)).toBe(PALETAS.PRETO_AMARELO);
    expect(paleta('VERDE')).toBe(PALETAS.PRETO_AMARELO);
  });

  it('todo tipo sugere uma paleta que existe', () => {
    for (const t of TIPOS) expect(PALETAS[PALETA_PADRAO[t]]).toBeDefined();
  });
});
