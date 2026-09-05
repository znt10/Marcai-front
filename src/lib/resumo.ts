import { somarDias } from '@/lib/datas';

/// Os atalhos de período do resumo, e a volta deles.
///
/// Mora aqui, e não dentro do componente, porque é a única parte da tela que
/// dá teste barato: a suíte do front roda em `node`, sem DOM, e o que estiver
/// no `.tsx` fica sem cobertura. Mesmo recorte de `slots.ts` e `datas.ts`.
///
/// Todo intervalo daqui é INCLUSIVO nas duas pontas — é o que a rota
/// `/painel/resumo` espera, e o que o dono lê quando escolhe "1 a 5".

export type Atalho = 'hoje' | '7dias' | 'mes';
export type Periodo = { de: string; ate: string };

/// A ordem importa duas vezes: é a ordem dos botões na tela e é o critério
/// de desempate de `atalhoDoPeriodo` (no dia 1 do mês, "hoje" e "mês" são o
/// mesmo intervalo, e acender os dois seria mentira).
export const ATALHOS: readonly { chave: Atalho; rotulo: string }[] = [
  { chave: 'hoje', rotulo: 'hoje' },
  { chave: '7dias', rotulo: '7 dias' },
  { chave: 'mes', rotulo: 'este mês' },
];

export function periodoDoAtalho(atalho: Atalho, hoje: string): Periodo {
  switch (atalho) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    // -6 e não -7: o intervalo inclui hoje, então sete dias são hoje mais
    // seis para trás. Com -7 o rótulo diria 7 e o número seria de 8.
    case '7dias':
      return { de: somarDias(hoje, -6), ate: hoje };
    // Até HOJE, e não até o fim do mês: o resumo só conta corte que já
    // aconteceu, então pedir dias futuros daria o mesmo número com um rótulo
    // que mente sobre o período.
    case 'mes':
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  }
}

/// Qual botão deve estar aceso para o intervalo atual — `null` quando o dono
/// digitou um intervalo próprio. Sem isso, mexer nos campos de data deixaria
/// um atalho aceso apontando para um período que não é mais o dele.
export function atalhoDoPeriodo(p: Periodo, hoje: string): Atalho | null {
  const igual = ATALHOS.find(({ chave }) => {
    const alvo = periodoDoAtalho(chave, hoje);
    return alvo.de === p.de && alvo.ate === p.ate;
  });
  return igual?.chave ?? null;
}
