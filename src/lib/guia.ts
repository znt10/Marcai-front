/// O guia da primeira vez na tela de agendar: um balão em cima do passo que
/// falta, pedido para quem entra e não sabe por onde começar (06/10/2026).
///
/// O passo sai do ESTADO do formulário, e não de um contador de "próximo":
/// quem volta e troca o barbeiro, ou vai ao calendário e volta, vê o balão no
/// lugar certo sem nada para sincronizar.

export type Passo =
  | 'barbeiro' | 'servico' | 'horario' | 'outro-dia' | 'calendario' | 'dados' | 'confirmar';

export type EstadoDoForm = {
  barbeiroId: string;
  servicoId: string;
  temHorario: boolean;
  /// O dia que está à vista não tem vaga nenhuma.
  diaSemVaga: boolean;
  /// Algum dos dias da tela (os botões acima da grade) tem vaga.
  algumDiaComVaga: boolean;
  nome: string;
  whats: string;
};

/// Curtos, no imperativo, e sem termo de aplicativo: quem precisa do guia não
/// sabe o que é "slot" nem "chip".
export const TEXTO_DO_PASSO: Record<Passo, string> = {
  barbeiro: 'Toque no barbeiro que vai te atender',
  servico: 'Agora escolha o serviço',
  horario: 'Escolha um horário livre',
  'outro-dia': 'Esse dia está cheio. Toque em outro dia',
  calendario: 'Esses dias estão cheios. Toque aqui para ver outro dia do mês',
  dados: 'Escreva seu nome e seu WhatsApp. A confirmação chega por lá',
  confirmar: 'Pronto! Toque em Confirmar horário',
};

/// A regra do botão Confirmar, num lugar só: se o guia e o botão discordassem,
/// o balão mandaria tocar num botão apagado.
export const dadosCompletos = (nome: string, whats: string) =>
  nome.trim().length >= 2 && whats.replace(/\D/g, '').length >= 10;

/// Nome e WhatsApp são UM passo, e não dois: separados, o balão pularia para
/// o WhatsApp na segunda letra do nome, com a pessoa ainda digitando.
///
/// Com TODOS os dias da tela cheios, o passo é o calendário, e não "toque em
/// outro dia": os outros botões estão tão cheios quanto este, e o balão
/// mandaria a pessoa de um dia vazio para outro sem nunca mostrar a saída.
export function proximoPasso(e: EstadoDoForm): Passo {
  if (!e.barbeiroId) return 'barbeiro';
  if (!e.servicoId) return 'servico';
  if (!e.temHorario) {
    if (!e.diaSemVaga) return 'horario';
    return e.algumDiaComVaga ? 'outro-dia' : 'calendario';
  }
  if (!dadosCompletos(e.nome, e.whats)) return 'dados';
  return 'confirmar';
}

/// A dica pequena em cima de "Ver outro dia no calendário", junto com o balão
/// do horário (pedido de 07/10/2026): a tela só mostra dois dias, e quem
/// queria o sábado que vem não sabe que o resto do mês está a um toque. Só
/// enquanto o horário falta — escolhido, ela viraria ruído no caminho dos
/// dados.
export const mostraDicaDoCalendario = (passo: Passo | null) =>
  passo === 'horario' || passo === 'outro-dia';

/// O balão que nasce enquanto a pessoa digita NÃO rola a tela até ele. O
/// WhatsApp fica completo no 10º dígito, e quem digita um celular de 11 via
/// o "Pronto!" aparecer e a página correr para baixo antes do último número,
/// com o campo sumindo de vista e o teclado aberto.
export const digitando = (ativo: { tagName?: string } | null | undefined) =>
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo?.tagName ?? '');

/// `localStorage`, e não `sessionStorage` como o rascunho: "primeira vez" é
/// por aparelho, e quem já marcou uma vez não precisa do guia na semana
/// seguinte.
const CHAVE = 'guia-agendar-visto';

/// Armazenamento bloqueado (aba anônima, disco cheio) LANÇA. Nesse caso o
/// guia aparece: mostrar a mais é melhor do que quebrar a tela.
export function guiaJaVisto(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}

/// Chamado em "Já sei usar" e quando o agendamento confirma.
export function marcarGuiaVisto(): void {
  try { localStorage.setItem(CHAVE, '1'); } catch { /* ver `guiaJaVisto` */ }
}
