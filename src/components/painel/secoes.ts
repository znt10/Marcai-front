/// As seções do painel, e o nome da seção em que você está.
///
/// A lista morava dentro de `NavPainel.tsx`. Saiu de lá porque o seletor do
/// celular (`SeletorDeSecao`) precisa da mesma lista, e duas cópias dela
/// divergem na primeira seção nova: seria uma aba no desktop que não aparece
/// no dropdown, ou o contrário.
///
/// Sem `'use client'` de propósito: aqui não há hook nem JSX, só dado e uma
/// função pura — é o que deixa `tests/secoes.test.ts` importar isto direto,
/// sem precisar de biblioteca para renderizar componente.
export type Secao = { href: string; rotulo: string; soDono?: boolean };

export const SECOES: Secao[] = [
  { href: '/painel', rotulo: 'agenda' },
  { href: '/painel/dia', rotulo: 'quadro' },
  { href: '/painel/horarios', rotulo: 'horários' },
  { href: '/painel/servicos', rotulo: 'serviços' },
  { href: '/painel/equipe', rotulo: 'equipe', soDono: true },
  // No fim, e junto de `equipe`, porque as duas são as seções de quem
  // administra — e porque entrar no meio reordenaria cinco abas que a equipe
  // já sabe onde ficam. O barbeiro comum continua vendo quatro.
  { href: '/painel/resumo', rotulo: 'resumo', soDono: true },
];

/// O rótulo da seção atual, para o botão do seletor no celular.
///
/// Casa o caminho inteiro, não o prefixo: `/painel` é prefixo de todas as
/// rotas do painel, e por prefixo `/painel/novo` responderia "agenda" — o
/// botão mentiria sobre onde você está.
///
/// Fora da lista (`/painel/novo`, e qualquer subrota) devolve "painel": é o
/// único texto do botão, e vazio ele viraria uma seta solta.
export function rotuloDaSecao(caminho: string): string {
  return SECOES.find((s) => s.href === caminho)?.rotulo ?? 'painel';
}
