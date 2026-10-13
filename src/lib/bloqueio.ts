import type { PreviaDoBloqueio } from '@/lib/api';
import { formatar } from '@/lib/telefone';

/// A confirmação antes de bloquear (spec 2026-10-13). Diz o que vai
/// acontecer com os horários dela, porque o cancelamento é sem aviso e não
/// volta ao desbloquear.
///
/// Sem "ela"/"ele": quem marca numa barbearia é mais João que Maria, e o
/// painel não sabe o gênero de ninguém. O sujeito é o NÚMERO.
export function textoDaConfirmacao(p: PreviaDoBloqueio): string {
  const quem = `Bloquear ${p.nome} (${formatar(p.whatsapp)})? Esse número não vai conseguir marcar pelo site`;
  if (p.horarios === 0) return `${quem}.`;
  if (p.horarios === 1) {
    return `${quem}, e o horário marcado vai ser cancelado sem aviso.`;
  }
  return `${quem}, e os ${p.horarios} horários marcados vão ser cancelados sem aviso.`;
}
