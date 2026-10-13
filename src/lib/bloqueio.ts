import type { PreviaDoBloqueio } from '@/lib/api';
import { formatar } from '@/lib/telefone';

/// A confirmação antes de bloquear (spec 2026-10-13). Diz o que vai
/// acontecer com os horários dela, porque o cancelamento é sem aviso e não
/// volta ao desbloquear.
export function textoDaConfirmacao(p: PreviaDoBloqueio): string {
  const quem = `Bloquear ${p.nome} (${formatar(p.whatsapp)})? Ela não vai conseguir marcar pelo site`;
  if (p.horarios === 0) return `${quem}.`;
  if (p.horarios === 1) {
    return `${quem}, e o horário que ela tem marcado vai ser cancelado sem aviso.`;
  }
  return `${quem}, e os ${p.horarios} horários que ela tem marcados vão ser cancelados sem aviso.`;
}
