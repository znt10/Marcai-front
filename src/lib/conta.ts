/// Lógica pura da conta do cliente — nada de rede nem de React aqui, para
/// o teste rodar em `node` puro.
import type { ItemHistorico } from '@/lib/api/contaAPI';
export type { ItemHistorico };

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
