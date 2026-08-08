import { formatarDiaCurto } from './datas';

/// As recusas da tela de equipe, como funções **puras**: devolvem `null`
/// quando pode, ou a mensagem quando não. Puras porque é a parte que precisa de
/// teste exaustivo, e assim o teste não monta cenário de banco para exercitar
/// combinação de regra.
///
/// As três existem para o mesmo fim: não deixar a barbearia num estado sem
/// saída que só o admin da plataforma destrave — que é exatamente o suporte que
/// a tela de equipe veio eliminar.

export function podeDesativar(p: {
  ehEuMesmo: boolean;
  papel: 'DONO' | 'BARBEIRO';
  donosAtivos: number;
  agendamentosFuturos: number;
  proximoEm: Date | null;
}): string | null {
  // Ordem por proximidade de quem lê: quem tenta se desativar precisa ouvir
  // isso primeiro, não a contagem de agendamentos de outra pessoa.
  if (p.ehEuMesmo) {
    return 'Você não pode se desativar — pede para outro dono fazer isso.';
  }
  if (p.papel === 'DONO' && p.donosAtivos <= 1) {
    return 'Esse é o único dono ativo. Promove outra pessoa antes.';
  }
  if (p.agendamentosFuturos > 0) {
    // Pelo fuso da barbearia, não pelo do servidor: em servidor UTC, um
    // horário das 22h daqui cairia no dia seguinte, e a recusa apontaria uma
    // data em que não há nada marcado.
    const quando = p.proximoEm
      ? ` até ${formatarDiaCurto(p.proximoEm)}`
      : '';
    return `Tem ${p.agendamentosFuturos} horário(s) marcado(s)${quando}. ` +
           'Cancela ou remarca antes de desativar.';
  }
  return null;
}

export function podeRebaixar(p: { donosAtivos: number }): string | null {
  return p.donosAtivos <= 1
    ? 'Esse é o único dono ativo. Promove outra pessoa antes de rebaixar.'
    : null;
}
