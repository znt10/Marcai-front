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
