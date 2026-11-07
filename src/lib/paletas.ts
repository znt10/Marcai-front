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
/// O painel é outra história: ele tem claro/escuro e o desenho do Figma. Da
/// paleta do estabelecimento ele pega o DESTAQUE e, desde 07/11/2026, o CHÃO
/// de cada modo, por variáveis `--painel-*` que o bloco `.painel` do
/// `globals.css` lê (com o chão da Preto e amarelo como valor de fallback).

import type { CSSProperties } from 'react';
import type { Tipo } from './tipos';

export type Paleta = 'PRETO_AMARELO' | 'BRANCO_ROSE' | 'PRETO_ROSE' | 'BRANCO_DOURADO';

export const PALETAS_EM_ORDEM: Paleta[] = ['PRETO_AMARELO', 'BRANCO_ROSE', 'PRETO_ROSE', 'BRANCO_DOURADO'];

/// O claro e o escuro de cada cor (07/11/2026): o dono troca a tela do
/// cliente para a outra do par na Equipe. A mesma tabela do back
/// (`tenant.models.PAR_DA_PALETA`), que recusa qualquer outra troca.
export const PAR_DA_PALETA: Record<Paleta, Paleta> = {
  PRETO_ROSE: 'BRANCO_ROSE', BRANCO_ROSE: 'PRETO_ROSE',
  PRETO_AMARELO: 'BRANCO_DOURADO', BRANCO_DOURADO: 'PRETO_AMARELO',
};

/// Os tokens do `@theme` que as telas do cliente usam.
export type Tokens = {
  fundo: string; superficie: string; borda: string; tinta: string; sub: string; lbl: string;
  apagado: string; acento: string; latao: string; livre: string; mut: string; 'mut-borda': string;
  linha: string; superficie2: string; 'borda-suave': string; 'acento-forte': string;
  'no-acento': string;
};

/// O chão do painel num dos modos dele: fundo, cartões, fios e letras.
/// Até 07/11/2026 era a nogueira (marrom) fixa no `globals.css` para toda
/// casa; agora cada paleta traz o seu, no mesmo tom das telas do cliente.
export type ChaoDoPainel = {
  fundo: string; superficie: string; superficie2: string; borda: string; 'borda-suave': string;
  tinta: string; sub: string; lbl: string; apagado: string; mut: string; 'mut-borda': string;
  linha: string;
};

/// O painel num dos modos dele: o chão e o destaque.
type Destaque = { acento: string; acentoForte: string; noAcento: string; chao: ChaoDoPainel };

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

/// Os chãos (07/11/2026, depois de o José aprovar o Preto e rosé): fundo e
/// cartão no mesmo tom, um degrau só entre eles, sem o marrom de antes. Os
/// escuros puxam para a cor do destaque (âmbar, vinho); os claros são o
/// creme e o nude, com o cartão um tom acima do fundo em vez de branco puro.
const CHAO_AMBAR_ESCURO: ChaoDoPainel = {
  fundo: '#0d0c0b', superficie: '#181615', superficie2: '#2a2725', borda: '#2c2927',
  'borda-suave': '#282523', tinta: '#f4efe4', sub: '#a8a199', lbl: '#8f8880', apagado: '#8f8880',
  mut: '#121110', 'mut-borda': '#23201e', linha: '#1c1a18',
};
const CHAO_VINHO_ESCURO: ChaoDoPainel = {
  fundo: '#0d0a0b', superficie: '#161113', superficie2: '#2c2226', borda: '#2e2327',
  'borda-suave': '#2a2024', tinta: '#f4eced', sub: '#a8979b', lbl: '#8f7e83', apagado: '#8f7e83',
  mut: '#120e10', 'mut-borda': '#241b1f', linha: '#1d1619',
};
const CHAO_CREME_CLARO: ChaoDoPainel = {
  fundo: '#f6f0e3', superficie: '#fbf7ee', superficie2: '#efe5d0', borda: '#e5d9c0',
  'borda-suave': '#ebe1cc', tinta: '#2a2316', sub: '#685d48', lbl: '#776a52', apagado: '#776a52',
  mut: '#f1eadb', 'mut-borda': '#e3d8c2', linha: '#ebe1cc',
};
const CHAO_NUDE_CLARO: ChaoDoPainel = {
  fundo: '#f6e6e0', superficie: '#fbf1ed', superficie2: '#f1ddd6', borda: '#ebd2ca',
  'borda-suave': '#efdbd4', tinta: '#3b2220', sub: '#7a5a55', lbl: '#7d625d', apagado: '#7d625d',
  mut: '#f3e2dc', 'mut-borda': '#e8cfc8', linha: '#efdbd4',
};

/// O painel das casas de âmbar e dourado: âmbar sobre o preto, e o âmbar
/// escuro do Figma sobre o creme.
const AMBAR_NO_PAINEL: DefinicaoDaPaleta['painel'] = {
  escuro: { acento: '#d9a34a', acentoForte: '#e8b360', noAcento: '#241a10', chao: CHAO_AMBAR_ESCURO },
  claro: { acento: '#a66b22', acentoForte: '#d9a34a', noAcento: '#241a10', chao: CHAO_CREME_CLARO },
};

/// A Preto e amarelo é o `@theme` do `globals.css` e o chão de fallback do
/// `.painel` (um teste prende os dois juntos).
const PRETO_AMARELO: DefinicaoDaPaleta = {
  nome: 'Preto e amarelo',
  esquema: 'dark',
  // Preto grafite com um calor leve (07/11/2026); era a nogueira marrom, e
  // um primeiro preto com âmbar demais saiu esverdeado.
  tokens: {
    fundo: '#0d0c0b', superficie: '#181615', borda: '#2c2927', tinta: '#f4efe4', sub: '#a8a199',
    lbl: '#8f8880', apagado: '#6b655e', acento: '#febc1a', latao: '#c98a45', livre: '#5c8a6d',
    mut: '#121110', 'mut-borda': '#23201e', linha: '#1c1a18', superficie2: '#2a2725',
    'borda-suave': '#282523', 'acento-forte': '#e8b360', 'no-acento': '#241a10',
  },
  superficieDoFluxo: '#1b1917',
  painel: AMBAR_NO_PAINEL,
  barra: { escuro: '#0d0c0b', claro: '#f6f0e3' },
};

/// O rosé dos dois lados: escuro para quem lê sobre claro, claro para quem
/// lê sobre escuro.
const ROSE_NO_PAINEL: DefinicaoDaPaleta['painel'] = {
  escuro: { acento: '#e59aa8', acentoForte: '#f0b4bf', noAcento: '#2a1418', chao: CHAO_VINHO_ESCURO },
  claro: { acento: '#a4505e', acentoForte: '#c77985', noAcento: '#ffffff', chao: CHAO_NUDE_CLARO },
};

export const PALETAS: Record<Paleta, DefinicaoDaPaleta> = {
  PRETO_AMARELO,

  /// O tema Rosé do kit (`Marcai-kit/tema/tema-rose.css`, 28/10/2026): fundo
  /// nude e o rosé da logo nos botões, para logo e tela ficarem no mesmo tom.
  /// O rosé do kit (#a35a57) dá 4.4 no fundo nude; o `acento` desce um tom
  /// (#9c5452) para passar dos 4.5 — as logos ficam no do kit.
  BRANCO_ROSE: {
    nome: 'Rosé',
    esquema: 'light',
    // 07/11/2026: o cartão deixou de ser quase branco e virou um nude um
    // degrau acima do fundo.
    tokens: {
      fundo: '#f6e6e0', superficie: '#fbf1ed', borda: '#ebd2ca', tinta: '#3b2220', sub: '#7a5a55',
      lbl: '#7d625d', apagado: '#b39a95', acento: '#9c5452', latao: '#d4a49c', livre: '#3f7a57',
      mut: '#f3e2dc', 'mut-borda': '#e8cfc8', linha: '#efdbd4', superficie2: '#f1ddd6',
      'borda-suave': '#efdbd4', 'acento-forte': '#8a4a47', 'no-acento': '#ffffff',
    },
    superficieDoFluxo: '#f3e0d9',
    painel: ROSE_NO_PAINEL,
    barra: { escuro: '#f6e6e0', claro: '#f6e6e0' },
  },

  /// Preto com o destaque rosé. Até 07/11/2026 herdava o chão da barbearia
  /// (Preto e amarelo), e o cartaz da logo saía marrom; agora os pretos são
  /// mais fundos e puxam para o vinho, o tom que casa com o rosé.
  PRETO_ROSE: {
    ...PRETO_AMARELO,
    nome: 'Preto e rosé',
    tokens: {
      fundo: '#0d0a0b', superficie: '#161113', borda: '#2e2327', tinta: '#f4eced', sub: '#a8979b',
      lbl: '#8f7e83', apagado: '#6b5b60', acento: '#f0a6b4', latao: '#b77a86', livre: '#5c8a6d',
      mut: '#120e10', 'mut-borda': '#241b1f', linha: '#1d1619', superficie2: '#2c2226',
      'borda-suave': '#2a2024', 'acento-forte': '#e9b3bd', 'no-acento': '#2a1418',
    },
    superficieDoFluxo: '#1a1417',
    painel: ROSE_NO_PAINEL,
    barra: { escuro: '#0d0a0b', claro: '#f6e6e0' },
  },

  BRANCO_DOURADO: {
    nome: 'Branco e dourado',
    esquema: 'light',
    // 07/11/2026: cartão em creme do mesmo tom do fundo, em vez de branco.
    tokens: {
      fundo: '#f6f0e3', superficie: '#fbf7ee', borda: '#e5d9c0', tinta: '#2a2316', sub: '#685d48',
      lbl: '#776a52', apagado: '#a3977f', acento: '#8a6516', latao: '#d8b56a', livre: '#3f7a57',
      mut: '#f1eadb', 'mut-borda': '#e3d8c2', linha: '#ebe1cc', superficie2: '#efe5d0',
      'borda-suave': '#ebe1cc', 'acento-forte': '#75550f', 'no-acento': '#ffffff',
    },
    superficieDoFluxo: '#f2ead8',
    painel: {
      escuro: { acento: '#d9b45a', acentoForte: '#e8c97a', noAcento: '#241a10', chao: CHAO_AMBAR_ESCURO },
      claro: { acento: '#8a6516', acentoForte: '#b8902e', noAcento: '#ffffff', chao: CHAO_CREME_CLARO },
    },
    barra: { escuro: '#f6f0e3', claro: '#f6f0e3' },
  },
};

/// A que o admin vê já escolhida ao trocar o tipo — a mesma do back
/// (`tenant/tipos.py::PALETA_PADRAO`), que vale quando a paleta não vem.
export const PALETA_PADRAO: Record<Tipo, Paleta> = {
  BARBEARIA: 'PRETO_AMARELO',
  SOBRANCELHA: 'BRANCO_ROSE',
  MANICURE: 'BRANCO_ROSE',
  MAQUIAGEM: 'BRANCO_ROSE',
  CABELEIREIRA: 'BRANCO_ROSE',
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
    for (const [nome, cor] of Object.entries(destaque.chao)) vars[`--painel-${nome}-${modo}`] = cor;
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
