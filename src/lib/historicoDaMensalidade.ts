import { reais } from '@/lib/mensalidade';

/// Os textos do histórico de pagamentos da mensalidade, no admin.

const COMO: Record<string, string> = {
  MANUAL: 'Confirmado',
  VIGIA: 'Confirmado pelo vigia',
  REGISTRO: 'Registrado à mão',
  INFINITEPAY: 'InfinitePay',
};

/// Como foi pago, em português. O que não conhece aparece como veio, para
/// um valor novo do back não sumir da tela.
export const rotuloDoComo = (como: string | null): string =>
  como == null ? 'Pago' : COMO[como] ?? como;

/// "10/10" no fuso de Brasília — o dia de quem pagou, não o do UTC.
export const diaEMesEmBrasilia = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
  });

/// A pergunta do `confirm` antes de tirar um pagamento do histórico.
export function perguntaDeRemover(p: { valorCentavos: number; pagaEm: string | null }): string {
  const dia = p.pagaEm ? ` de ${diaEMesEmBrasilia(p.pagaEm)}` : '';
  return `Remover o pagamento de ${reais(p.valorCentavos)}${dia} do histórico? O "pago até" não muda.`;
}
