/// O guia da primeira vez na tela de agendar: um balão em cima do passo que
/// falta, pedido para quem entra e não sabe por onde começar (06/10/2026).
///
/// O passo sai do ESTADO do formulário, e não de um contador de "próximo":
/// quem volta e troca o barbeiro, ou vai ao calendário e volta, vê o balão no
/// lugar certo sem nada para sincronizar.

export type Passo = 'barbeiro' | 'servico' | 'horario' | 'outro-dia' | 'dados' | 'confirmar';

export type EstadoDoForm = {
  barbeiroId: string;
  servicoId: string;
  temHorario: boolean;
  /// O dia que está à vista não tem vaga nenhuma.
  diaSemVaga: boolean;
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
  dados: 'Escreva seu nome e seu WhatsApp. A confirmação chega por lá',
  confirmar: 'Pronto! Toque em Confirmar horário',
};

/// A regra do botão Confirmar, num lugar só: se o guia e o botão discordassem,
/// o balão mandaria tocar num botão apagado.
export const dadosCompletos = (nome: string, whats: string) =>
  nome.trim().length >= 2 && whats.replace(/\D/g, '').length >= 10;

/// Nome e WhatsApp são UM passo, e não dois: separados, o balão pularia para
/// o WhatsApp na segunda letra do nome, com a pessoa ainda digitando.
export function proximoPasso(e: EstadoDoForm): Passo {
  if (!e.barbeiroId) return 'barbeiro';
  if (!e.servicoId) return 'servico';
  if (!e.temHorario) return e.diaSemVaga ? 'outro-dia' : 'horario';
  if (!dadosCompletos(e.nome, e.whats)) return 'dados';
  return 'confirmar';
}

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
