/// As paletas que o admin escolhe ao criar o estabelecimento (spec
/// 2026-10-08, `Barbearia.paleta` no back). O tipo só sugere a padrão.
///
/// Fonte ÚNICA das cores por estabelecimento. Aqui, e não em blocos
/// `[data-paleta=…]` no CSS, porque a mesma cor é pedida em quatro lugares
/// que não leem CSS: a imagem de compartilhamento (`/miniatura`), o manifesto
/// do app instalável, a cor da barra do navegador e as próprias telas. E
/// porque assim o contraste de cada uma é conferido por teste.
///
/// Como chega na tela: o layout raiz põe `estiloDaPaleta(p)` no `style` do
/// `<html>`. As variáveis de lá ganham dos valores do `@theme` (inline vence
/// folha de estilo), e todo `bg-acento`/`text-tinta` já escrito vira a cor
/// nova sem mexer em componente nenhum. Sem estabelecimento (admin, 404),
/// nada é posto e vale o `@theme`, que É a Preto e amarelo.
///
/// O painel é outra história: ele tem claro/escuro e o desenho do Figma, e
/// fixa a própria paleta no bloco `.painel` do `globals.css`. Da paleta do
/// estabelecimento ele só pega o DESTAQUE, por variáveis `--painel-*`.

import type { CSSProperties } from 'react';
import type { Tipo } from './tipos';

export type Paleta = 'PRETO_AMARELO' | 'BRANCO_ROSE' | 'PRETO_ROSE' | 'BRANCO_DOURADO';

export const PALETAS_EM_ORDEM: Paleta[] = ['PRETO_AMARELO', 'BRANCO_ROSE', 'PRETO_ROSE', 'BRANCO_DOURADO'];

/// Os tokens do `@theme` que as telas do cliente usam.
export type Tokens = {
  fundo: string; superficie: string; borda: string; tinta: string; sub: string; lbl: string;
  apagado: string; acento: string; latao: string; livre: string; mut: string; 'mut-borda': string;
  linha: string; superficie2: string; 'borda-suave': string; 'acento-forte': string;
  'no-acento': string;
};

/// O destaque do painel num dos modos dele.
type Destaque = { acento: string; acentoForte: string; noAcento: string };

export type DefinicaoDaPaleta = {
  nome: string;
  esquema: 'dark' | 'light';
  tokens: Tokens;
  /// O degrau de superfície da tela de marcar (`.fluxo`), que lá é outro.
  superficieDoFluxo: string;
  painel: { escuro: Destaque; claro: Destaque };
  /// A cor da barra do navegador no celular, por preferência do sistema.
  barra: { escuro: string; claro: string };
};

/// Os valores de hoje — os mesmos do `@theme` e do `.painel` do
/// `globals.css` (um teste prende os dois juntos).
const PRETO_AMARELO: DefinicaoDaPaleta = {
  nome: 'Preto e amarelo',
  esquema: 'dark',
  tokens: {
    fundo: '#14100e', superficie: '#1e1815', borda: '#34291f', tinta: '#f2ebe1', sub: '#a3948a',
    lbl: '#8d7f75', apagado: '#6c5e54', acento: '#febc1a', latao: '#c98a45', livre: '#5c8a6d',
    mut: '#191411', 'mut-borda': '#29211b', linha: '#241d18', superficie2: '#413326',
    'borda-suave': '#3a2c1e', 'acento-forte': '#e8b360', 'no-acento': '#241a10',
  },
  superficieDoFluxo: '#241b15',
  painel: {
    escuro: { acento: '#d9a34a', acentoForte: '#e8b360', noAcento: '#241a10' },
    claro: { acento: '#a66b22', acentoForte: '#d9a34a', noAcento: '#241a10' },
  },
  barra: { escuro: '#1c1814', claro: '#faf6f0' },
};

/// O rosé dos dois lados: escuro para quem lê sobre claro, claro para quem
/// lê sobre escuro.
const ROSE_NO_PAINEL: DefinicaoDaPaleta['painel'] = {
  escuro: { acento: '#e59aa8', acentoForte: '#f0b4bf', noAcento: '#2a1418' },
  claro: { acento: '#a4505e', acentoForte: '#c77985', noAcento: '#ffffff' },
};

export const PALETAS: Record<Paleta, DefinicaoDaPaleta> = {
  PRETO_AMARELO,

  BRANCO_ROSE: {
    nome: 'Branco e rosé',
    esquema: 'light',
    tokens: {
      fundo: '#fbf6f4', superficie: '#ffffff', borda: '#ead9d6', tinta: '#2b1d1f', sub: '#6e5a5d',
      lbl: '#7a6568', apagado: '#a8979a', acento: '#a4505e', latao: '#d4a0a8', livre: '#3f7a57',
      mut: '#f4ecea', 'mut-borda': '#e6d8d5', linha: '#f1e6e4', superficie2: '#f6e6e8',
      'borda-suave': '#eee0de', 'acento-forte': '#8f4250', 'no-acento': '#ffffff',
    },
    superficieDoFluxo: '#f7eaec',
    painel: ROSE_NO_PAINEL,
    barra: { escuro: '#fbf6f4', claro: '#fbf6f4' },
  },

  /// O chão da barbearia com o destaque rosé.
  PRETO_ROSE: {
    ...PRETO_AMARELO,
    nome: 'Preto e rosé',
    tokens: {
      ...PRETO_AMARELO.tokens,
      acento: '#f0a6b4', latao: '#b77a86', 'acento-forte': '#e9b3bd', 'no-acento': '#2a1418',
    },
    painel: ROSE_NO_PAINEL,
  },

  BRANCO_DOURADO: {
    nome: 'Branco e dourado',
    esquema: 'light',
    tokens: {
      fundo: '#faf7f0', superficie: '#ffffff', borda: '#e6dcc8', tinta: '#2a2316', sub: '#6b604c',
      lbl: '#7a6d55', apagado: '#a89d88', acento: '#8a6516', latao: '#d8b56a', livre: '#3f7a57',
      mut: '#f3eee2', 'mut-borda': '#e4dac6', linha: '#efe8da', superficie2: '#f4ead2',
      'borda-suave': '#ece3d0', 'acento-forte': '#75550f', 'no-acento': '#ffffff',
    },
    superficieDoFluxo: '#f6eedb',
    painel: {
      escuro: { acento: '#d9b45a', acentoForte: '#e8c97a', noAcento: '#241a10' },
      claro: { acento: '#8a6516', acentoForte: '#b8902e', noAcento: '#ffffff' },
    },
    barra: { escuro: '#faf7f0', claro: '#faf7f0' },
  },
};

/// A que o admin vê já escolhida ao trocar o tipo — a mesma do back
/// (`tenant/tipos.py::PALETA_PADRAO`), que vale quando a paleta não vem.
export const PALETA_PADRAO: Record<Tipo, Paleta> = {
  BARBEARIA: 'PRETO_AMARELO',
  SOBRANCELHA: 'BRANCO_ROSE',
  OUTRO: 'BRANCO_DOURADO',
};

/// Vazia ou desconhecida cai na de hoje.
export function paleta(p?: string | null): DefinicaoDaPaleta {
  return PALETAS[(p ?? '') as Paleta] ?? PRETO_AMARELO;
}

/// O `style` do `<html>`. `--color-*` para as telas do cliente; `--painel-*`
/// e `--fluxo-*` são lidos pelos blocos `.painel` e `.fluxo` do CSS.
export function estiloDaPaleta(p?: string | null): CSSProperties {
  const d = paleta(p);
  const vars: Record<string, string> = { colorScheme: d.esquema };
  for (const [nome, cor] of Object.entries(d.tokens)) vars[`--color-${nome}`] = cor;
  vars['--fluxo-superficie2'] = d.superficieDoFluxo;
  for (const modo of ['escuro', 'claro'] as const) {
    const destaque = d.painel[modo];
    vars[`--painel-acento-${modo}`] = destaque.acento;
    vars[`--painel-acento-forte-${modo}`] = destaque.acentoForte;
    vars[`--painel-no-acento-${modo}`] = destaque.noAcento;
  }
  return vars as CSSProperties;
}

/// Contraste WCAG entre duas cores `#rrggbb` (1 a 21). Só o teste e quem
/// escolher cor nova precisam dele, mas mora aqui junto das cores.
export function contraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [claro, escuro] = [luz(a), luz(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}
