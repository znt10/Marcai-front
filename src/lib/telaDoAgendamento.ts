/// Qual tela o cliente vê em `/agendamento/<codigo>`, decidido sem React e sem
/// relógio próprio: o `agora` entra de fora pelo mesmo motivo de `slotsLivres`
/// (dá para testar o minuto 14:59 sem esperar 14:59).
///
/// O servidor diz o `status`; o relógio local só ANTECIPA o vencimento. Sem
/// isso a tela ficaria mostrando "00:00" e um QR morto até a próxima consulta
/// (3 s) devolver EXPIRADO.

export type DetalheDaTela = {
  status: string;
  /// Só existe com a cobrança ABERTA (o back não manda Pix vencido).
  pix: { copiaECola: string; qrSvg: string; valorCentavos: number } | null;
  expiraEm: string | null;
};

export type EstadoDaTela =
  | { tipo: 'confirmado' }
  | { tipo: 'aguardando'; segundosRestantes: number; urgente: boolean }
  /// Aguardando, mas a cobrança ainda não foi aberta (o back abre depois do
  /// commit do agendamento). Dura instantes; a tela só espera.
  | { tipo: 'preparando' }
  /// `local`: venceu pelo relógio daqui, o servidor ainda não confirmou.
  | { tipo: 'expirado'; local: boolean }
  | { tipo: 'cancelado' };

/// Nos últimos 5 minutos o relógio muda de cor.
export const SEGUNDOS_URGENTE = 300;

export function estadoDaTela(d: DetalheDaTela, agoraMs: number): EstadoDaTela {
  if (d.status === 'CONFIRMADO') return { tipo: 'confirmado' };
  if (d.status === 'EXPIRADO') return { tipo: 'expirado', local: false };
  if (d.status === 'AGUARDANDO_PAGAMENTO') {
    if (!d.pix || !d.expiraEm) return { tipo: 'preparando' };
    // `ceil`: com 0,2 s sobrando ainda não venceu, e "00:00" não pode aparecer
    // com o Pix ainda valendo.
    const segundosRestantes = Math.ceil((Date.parse(d.expiraEm) - agoraMs) / 1000);
    if (segundosRestantes <= 0) return { tipo: 'expirado', local: true };
    return { tipo: 'aguardando', segundosRestantes, urgente: segundosRestantes <= SEGUNDOS_URGENTE };
  }
  return { tipo: 'cancelado' };
}

/// Consultar o servidor só faz sentido enquanto algo pode mudar sozinho. O
/// vencido-só-no-relógio-local entra: se o relógio do aparelho adiantou, ou o
/// Pix caiu no último segundo, a resposta ainda pode vir CONFIRMADO.
export function precisaConsultar(e: EstadoDaTela): boolean {
  return e.tipo === 'aguardando' || e.tipo === 'preparando' || (e.tipo === 'expirado' && e.local);
}

export function formatarRelogio(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/// O número do barbeiro vem sem o 55 (DDD + número); o link do zap precisa dele.
export function linkDoZap(whatsapp: string): string | null {
  const digitos = whatsapp.replace(/\D/g, '');
  return digitos ? `https://wa.me/55${digitos}` : null;
}
