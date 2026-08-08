/// Os cálculos do quadro do dia, separados da rota porque são aritmética de
/// intervalo — o tipo de coisa que erra em silêncio e só aparece como um
/// número estranho na tela.

export type Intervalo = { inicio: Date; fim: Date };

const MIN = 60_000;

/// Minutos cobertos por `intervalos` dentro da janela, **sem contar duas
/// vezes** o que se sobrepõe.
///
/// A união importa nos dois usos: dois bloqueios encavalados descontariam o
/// mesmo tempo duas vezes do denominador (e a ocupação estouraria 100% sem
/// motivo), e o mesmo vale para agendamentos que se cruzam — o que a
/// restrição de exclusão impede hoje, mas a conta não deveria depender disso.
export function minutosCobertos(intervalos: Intervalo[], janela: Intervalo): number {
  const recortados = intervalos
    .map((i) => ({
      inicio: Math.max(i.inicio.getTime(), janela.inicio.getTime()),
      fim:    Math.min(i.fim.getTime(),    janela.fim.getTime()),
    }))
    .filter((i) => i.fim > i.inicio)
    .sort((a, b) => a.inicio - b.inicio);

  let total = 0;
  let fimAtual = -Infinity;
  for (const i of recortados) {
    const comeca = Math.max(i.inicio, fimAtual);
    if (i.fim > comeca) total += i.fim - comeca;
    fimAtual = Math.max(fimAtual, i.fim);
  }
  return Math.round(total / MIN);
}

/// Quanto da jornada já está vendido, em porcentagem inteira.
///
/// O tempo bloqueado sai do **denominador** em vez de entrar como ocupação:
/// com o almoço contando como disponível, um dia genuinamente lotado marcaria
/// 88% e o dono nunca veria 100% — o número perderia a única leitura que
/// interessa, que é "não cabe mais ninguém".
///
/// Jornada inteira bloqueada devolve 100 pelo mesmo motivo: não cabe mais
/// ninguém. Quem não tem jornada nenhuma nem chega aqui — a rota manda `null`,
/// porque fechado e vazio são estados diferentes.
export function ocupacaoPct(
  agendamentos: Intervalo[], bloqueios: Intervalo[], janela: Intervalo,
): number {
  const jornada = minutosCobertos([janela], janela);
  const disponivel = jornada - minutosCobertos(bloqueios, janela);
  if (disponivel <= 0) return 100;

  const vendido = minutosCobertos(agendamentos, janela);
  return Math.min(100, Math.round((vendido / disponivel) * 100));
}
