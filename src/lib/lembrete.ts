import { LEMBRETE_ANTECEDENCIA_MIN } from './config';

/// O valor de `lembreteEnviadoEm` com que um agendamento NASCE.
///
/// Marcar um horário que já está dentro da janela do lembrete manda duas
/// mensagens em poucos minutos: a confirmação e, no tique seguinte do
/// agendador, um "Lembrete:" do que a pessoa acabou de fazer. Não é hipótese —
/// o painel marca a 30 minutos por padrão, então todo encaixe de balcão
/// produziria isso.
///
/// A correção é de conceito, não de filtro: **dentro da janela, a confirmação
/// É o lembrete**. O agendamento nasce avisado e o cron nunca o vê.
///
/// Escrever "ignora agendamento criado há menos de X minutos" seria um segundo
/// número arbitrário perseguindo o primeiro; `lembreteEnviadoEm` já é
/// exatamente o campo que quer dizer "esta pessoa já foi avisada".
export function lembreteAoCriar(inicio: Date, agora: Date): Date | null {
  const dentroDaJanela =
    inicio.getTime() <= agora.getTime() + LEMBRETE_ANTECEDENCIA_MIN * 60_000;
  return dentroDaJanela ? agora : null;
}
