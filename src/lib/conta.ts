/// Lógica pura da conta do cliente — nada de rede nem de React aqui, para
/// o teste rodar em `node` puro.
import type { ItemHistorico } from '@/lib/api/contaAPI';
export type { ItemHistorico };

/// Disparado em `window` quando a sessão da conta muda sem recarregar a página
/// (sair); o `BotaoConta` do cabeçalho escuta e consulta de novo.
export const EVENTO_CONTA = 'marcai:conta';

/// Espelha `CONTA_SENHA_MINIMA` do back (`tenant/config.py`).
export const SENHA_MINIMA_CONTA = 6;

/// O código do WhatsApp tem exatamente seis dígitos.
export function codigoValido(s: string): boolean {
  return /^\d{6}$/.test(s);
}

/// "Próximo" é só o que ainda vai acontecer E está de pé: um cancelado no
/// futuro não é compromisso, vai para o histórico. Próximos do mais perto
/// para o mais longe; passados do mais recente para o mais antigo.
export function separarHistorico(
  itens: ItemHistorico[], agora: Date,
): { proximos: ItemHistorico[]; passados: ItemHistorico[] } {
  const t = agora.getTime();
  const proximos: ItemHistorico[] = [];
  const passados: ItemHistorico[] = [];
  for (const i of itens) {
    if (new Date(i.inicio).getTime() >= t && i.status === 'CONFIRMADO') proximos.push(i);
    else passados.push(i);
  }
  const hora = (i: ItemHistorico) => new Date(i.inicio).getTime();
  proximos.sort((a, b) => hora(a) - hora(b));
  passados.sort((a, b) => hora(b) - hora(a));
  return { proximos, passados };
}

/// O rótulo do status de um agendamento no histórico, ou `null` quando não há
/// nada a dizer: CONFIRMADO no passado simplesmente aconteceu. Os status são
/// os do back (CONFIRMADO, CANCELADO_CLIENTE, CANCELADO_BARBEIRO).
export function rotuloDoStatus(status: string): string | null {
  if (status === 'CANCELADO_CLIENTE' || status === 'CANCELADO_BARBEIRO') return 'Cancelado';
  return null;
}

/// A letra do círculo do botão no topo: a inicial do primeiro nome.
export function inicialDoNome(nome: string): string {
  return nome.trim().charAt(0).toUpperCase() || '?';
}

/// "sex, 24/10 às 14:30" no fuso do Brasil, o mesmo em qualquer máquina.
export function rotuloDoHorario(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d).replace('.', '');
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d);
  return `${dia} às ${hora}`;
}

/// Os campos do formulário de agendar quando a pessoa tem (ou não) conta.
///
/// Logada, o WhatsApp é SEMPRE o da conta — o do rascunho é ignorado e o
/// campo fica travado, porque é por esse número que o agendamento entra no
/// histórico dela. O nome também vem da conta, mas continua editável: quem
/// já mexeu nele antes de ir ao calendário (rascunho) não perde a edição.
/// Deslogada, nada muda: vale o rascunho.
export function camposDoAgendar(
  conta: { nome: string; whatsapp: string } | null,
  rascunho: { nome: string; whats: string },
): { nome: string; whats: string; travado: boolean } {
  if (!conta) return { nome: rascunho.nome, whats: rascunho.whats, travado: false };
  return { nome: rascunho.nome || conta.nome, whats: conta.whatsapp, travado: true };
}
