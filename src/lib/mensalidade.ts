import { formatarPreco } from '@/lib/dinheiro';

/// A mensalidade da barbearia como o back a entrega em
/// `GET /api/painel/mensalidade`. Nada aqui é calculado no navegador: a
/// situação, os dias e a data do bloqueio vêm prontos, e este arquivo só
/// decide o que a tela diz com eles.

export type SituacaoDaMensalidade =
  | 'DESATIVADA' | 'ISENTA' | 'AGUARDANDO' | 'EM_DIA'
  | 'VENCENDO' | 'ATRASADA' | 'BLOQUEADA';

export type PixDaMensalidade = {
  copiaECola: string;
  /// Data URI de SVG: vai direto em `<img src>`.
  qrSvg: string;
  /// O valor COM os centavos próprios da cobrança, que é o que o banco vai
  /// receber e o que a tela tem de mostrar — não o valor base da assinatura.
  valorCentavos: number;
};

export type Mensalidade = {
  situacao: SituacaoDaMensalidade;
  /// Faltam para vencer (EM_DIA/VENCENDO) ou de atraso (ATRASADA/BLOQUEADA).
  dias: number | null;
  /// "YYYY-MM-DD"
  bloqueiaEm: string | null;
  pagaAte: string | null;
  valorCentavos: number | null;
  souDono: boolean;
  /// Só para o dono e só na janela de pagamento.
  pix: PixDaMensalidade | null;
  /// O Pix não pôde ser gerado agora.
  pixErro: string | null;
};

export type EstadoDoPortao = 'livre' | 'pagar' | 'falar-com-o-dono';

/// O painel mostra o conteúdo ou uma tela no lugar dele.
///
/// Sem resposta (`null`: carregando ou falhou) deixa passar: quem barra de
/// verdade é o servidor, com 402, e trancar a tela por um soluço de rede
/// tiraria o painel de quem está em dia. Só BLOQUEADA tranca — ATRASADA ainda
/// é carência, com faixa e sem bloqueio.
export function estadoDoPortao(m: Mensalidade | null, souDono: boolean): EstadoDoPortao {
  if (m?.situacao !== 'BLOQUEADA') return 'livre';
  return souDono ? 'pagar' : 'falar-com-o-dono';
}

/// "R$ 49,91". O espaço do `Intl` é inseparável; aqui vira comum para a frase
/// quebrar linha onde quiser (e o teste comparar texto de verdade).
export const reais = (centavos: number): string =>
  formatarPreco(centavos).replace(/ /g, ' ');

/// "2026-10-05" → "05/10", sem passar por `Date`: o fuso trocaria o dia.
const diaEMes = (iso: string): string => {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
};

/// A faixa acima do painel, ou `null` quando não há o que dizer.
///
/// Só o dono a vê: quem não é dono não tem como pagar, e a cobrança na cara
/// do barbeiro só o deixaria sem ação possível.
export function faixaDaMensalidade(m: Mensalidade | null): string | null {
  if (!m || !m.souDono) return null;
  const dias = m.dias ?? 0;
  const mensalidade = m.valorCentavos != null
    ? `Sua mensalidade de ${reais(m.valorCentavos)}`
    : 'Sua mensalidade';

  switch (m.situacao) {
    case 'VENCENDO': {
      const quando = dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;
      return `${mensalidade} ${quando}.`;
    }
    case 'ATRASADA': {
      const atraso = `${mensalidade} está vencida há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`;
      // Quem nunca bloqueia não recebe promessa de bloqueio.
      return m.bloqueiaEm ? `${atraso} O painel é bloqueado em ${diaEMes(m.bloqueiaEm)}.` : atraso;
    }
    case 'AGUARDANDO':
      return 'Pagamento informado, aguardando confirmação.';
    default:
      return null;
  }
}
