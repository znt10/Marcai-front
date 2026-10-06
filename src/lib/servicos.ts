import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from './config';

export class ErroDuracao extends Error {}

/// Confere os limites gerais, os mesmos que o CHECK do banco já cobre. A
/// redundância é proposital: a mensagem daqui é legível na tela; a do CHECK
/// é um despejo do Postgres.
///
/// O piso por serviço saiu em 06/10/2026, junto com o "nunca leva menos que"
/// da tela de serviços: o tempo é de cada barbeiro.
export function validarDuracao(duracaoMin: number): void {
  if (!Number.isInteger(duracaoMin)) {
    throw new ErroDuracao('A duração precisa ser um número inteiro de minutos.');
  }
  if (duracaoMin < DURACAO_MINIMA_MIN) {
    throw new ErroDuracao(`A duração precisa ser de pelo menos ${DURACAO_MINIMA_MIN} minutos.`);
  }
  if (duracaoMin > DURACAO_MAXIMA_MIN) {
    throw new ErroDuracao(`A duração pode ser de no máximo ${DURACAO_MAXIMA_MIN} minutos.`);
  }
}
