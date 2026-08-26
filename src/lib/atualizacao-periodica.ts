/// O miolo da atualização automática do painel, sem React e sem `window`.
///
/// O relógio entra INJETADO pelo mesmo motivo que `slotsLivres` recebe o
/// `agora`: um ciclo que chamasse `setInterval` por dentro só poderia ser
/// testado esperando tempo real passar, e um teste que espera 30 segundos
/// ninguém roda. Aqui o teste dispara o temporizador quando quer.
///
/// Quem liga isto numa tela é `useAtualizacaoPeriodica`.

export type Relogio = {
  agendar: (fn: () => void, ms: number) => number;
  cancelar: (id: number) => void;
};

/// O relógio de verdade. `as unknown as number` porque o `setTimeout` do
/// Node devolve `Timeout` e o do navegador devolve `number` — este código só
/// roda no navegador, mas o TypeScript vê os dois tipos.
export const relogioDoNavegador: Relogio = {
  agendar: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  cancelar: (id) => clearTimeout(id),
};

export type EntradaCiclo = {
  intervaloMs: number;
  /// Consultada a cada toque, nunca guardada: a aba pode ter mudado de
  /// estado entre o agendamento e o disparo.
  visivel: () => boolean;
  aoTocar: () => void;
  relogio?: Relogio;
};

export type Ciclo = {
  iniciar: () => void;
  parar: () => void;
  aoMudarVisibilidade: () => void;
};

export function criarCiclo(e: EntradaCiclo): Ciclo {
  const relogio = e.relogio ?? relogioDoNavegador;
  let id: number | null = null;

  const parar = () => {
    if (id !== null) { relogio.cancelar(id); id = null; }
  };

  const agendar = () => {
    parar();
    id = relogio.agendar(tocar, e.intervaloMs);
  };

  /// Continua reagendando mesmo com a aba escondida: o que se evita é a
  /// BUSCA, não o temporizador. Parar o ciclo aqui exigiria religá-lo em
  /// algum outro lugar, e é assim que uma tela volta do bolso congelada.
  function tocar() {
    if (e.visivel()) e.aoTocar();
    agendar();
  }

  return {
    iniciar: agendar,

    parar,

    /// Voltar para a aba busca na hora — é o gesto real de pegar o celular
    /// e querer ver agora, não daqui a 30 segundos. E reinicia a contagem,
    /// senão o temporizador que já estava correndo tocaria logo em seguida,
    /// duas buscas coladas.
    aoMudarVisibilidade: () => {
      if (!e.visivel()) return;
      e.aoTocar();
      agendar();
    },
  };
}
