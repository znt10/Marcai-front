import { BARBEIRO_TRAVA_TENTATIVAS, BARBEIRO_TRAVA_MIN } from './config';

/// A trava do barbeiro é POR CONTA e mora no BANCO — o oposto da trava do
/// admin, que é por IP e vive em memória (admin §4). Os dois motivos:
///
/// - a barbearia inteira sai do mesmo IP, e travar o IP derrubaria a equipe
///   por causa de um funcionário desmemoriado;
/// - são muitas contas, então o atacante que espera o processo reciclar
///   zeraria o contador de graça.
///
/// Funções puras: a rota do login aplica o resultado com um `update`. Assim a
/// regra é testável sem cenário, e o teste dela não depende de Postgres.

export const LIMPO = { tentativasLogin: 0, bloqueadoAte: null } as const;

export function estaTravado(
  b: { bloqueadoAte: Date | null },
  agora: Date = new Date(),
): boolean {
  return b.bloqueadoAte !== null && b.bloqueadoAte > agora;
}

export function aposFalha(
  tentativas: number,
  agora: Date = new Date(),
): { tentativasLogin: number; bloqueadoAte: Date | null } {
  const tentativasLogin = tentativas + 1;
  return {
    tentativasLogin,
    bloqueadoAte: tentativasLogin >= BARBEIRO_TRAVA_TENTATIVAS
      ? new Date(agora.getTime() + BARBEIRO_TRAVA_MIN * 60_000)
      : null,
  };
}
