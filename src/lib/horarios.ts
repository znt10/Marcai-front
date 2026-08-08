/// Validações de jornada e bloqueio, **puras** como as recusas da equipe:
/// devolvem `null` quando pode, ou a mensagem quando não.
///
/// O que elas protegem é o motor de horários (`slots.ts`), que confia no que
/// está gravado: ele não desconfia de `minutosFim` menor que `minutosInicio`
/// nem de bloqueio sem dia — simplesmente calcularia errado, em silêncio.

const MINUTOS_DIA = 24 * 60;

const inteiroNoDia = (m: number) => Number.isInteger(m) && m >= 0 && m <= MINUTOS_DIA;

export function jornadaValida(p: {
  diaSemana: number; minutosInicio: number; minutosFim: number;
}): string | null {
  if (!Number.isInteger(p.diaSemana) || p.diaSemana < 0 || p.diaSemana > 6) {
    return 'Dia da semana inválido.';
  }
  if (!inteiroNoDia(p.minutosInicio) || !inteiroNoDia(p.minutosFim)) {
    return 'Horário fora do dia.';
  }
  // Igual também é recusado: jornada de duração zero não é "fechado", é uma
  // linha que o motor lê e da qual não sai slot nenhum — fechar é APAGAR a
  // linha (spec §4), e ter duas representações do mesmo estado confunde.
  if (p.minutosInicio >= p.minutosFim) {
    return 'A hora de fim tem que ser depois da de início.';
  }
  return null;
}

export function bloqueioValido(p: {
  repeteSemanalmente: boolean;
  diaSemana: number | null;
  minutosInicio: number | null;
  minutosFim: number | null;
  inicio: Date | null;
  fim: Date | null;
}): string | null {
  const temSemanal = p.diaSemana !== null || p.minutosInicio !== null || p.minutosFim !== null;
  const temPontual = p.inicio !== null || p.fim !== null;

  // O motor lê um formato OU o outro (`slots.ts:41`). Aceitar os dois juntos
  // gravaria uma linha cuja interpretação depende de qual campo alguém leu
  // primeiro — e o bug apareceria como horário sumido sem explicação.
  if (temSemanal && temPontual) {
    return 'Escolhe: toda semana ou uma vez só.';
  }

  if (p.repeteSemanalmente) {
    if (p.diaSemana === null || p.minutosInicio === null || p.minutosFim === null) {
      return 'Bloqueio de toda semana precisa de dia, hora de início e de fim.';
    }
    return jornadaValida({
      diaSemana: p.diaSemana,
      minutosInicio: p.minutosInicio,
      minutosFim: p.minutosFim,
    });
  }

  if (p.inicio === null || p.fim === null) {
    return 'Bloqueio de uma vez precisa de começo e fim.';
  }
  if (p.fim <= p.inicio) {
    return 'O fim tem que ser depois do começo.';
  }
  return null;
}
