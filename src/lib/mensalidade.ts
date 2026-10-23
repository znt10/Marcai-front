import { formatarPreco } from '@/lib/dinheiro';

/// A mensalidade da barbearia como o back a entrega em
/// `GET /api/painel/mensalidade`. Nada aqui é calculado no navegador: a
/// situação, os dias e a data do bloqueio vêm prontos, e este arquivo só
/// decide o que a tela diz com eles.

export type SituacaoDaMensalidade =
  | 'DESATIVADA' | 'ISENTA' | 'AGUARDANDO' | 'EM_DIA'
  | 'VENCENDO' | 'ATRASADA' | 'BLOQUEADA';

export type PixDaMensalidade = {
  /// `null` quando a cobrança é pelo link da InfinitePay.
  copiaECola: string | null;
  /// Data URI de SVG: vai direto em `<img src>`. `null` com a InfinitePay.
  qrSvg: string | null;
  /// O valor COM os centavos próprios da cobrança, que é o que o banco vai
  /// receber e o que a tela tem de mostrar — não o valor base da assinatura.
  /// Pela InfinitePay é o valor redondo.
  valorCentavos: number;
  /// O link do checkout da InfinitePay (Pix ou cartão).
  link: string | null;
  /// O pagamento se confirma sozinho: sem "Já paguei".
  automatico: boolean;
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

export type Faixa = {
  texto: string;
  /// A faixa traz o botão "Pagar com Pix": o dono paga antes de travar, sem
  /// esperar o bloqueio para ver o QR. Não em AGUARDANDO — ele já avisou, e
  /// um segundo Pix na cara só confunde.
  mostraPix: boolean;
};

/// A faixa acima do painel, ou `null` quando não há o que dizer.
///
/// Só o dono a vê: quem não é dono não tem como pagar, e a cobrança na cara
/// do barbeiro só o deixaria sem ação possível.
export function faixaDaMensalidade(m: Mensalidade | null): Faixa | null {
  if (!m || !m.souDono) return null;
  const dias = m.dias ?? 0;
  const mensalidade = m.valorCentavos != null
    ? `Sua mensalidade de ${reais(m.valorCentavos)}`
    : 'Sua mensalidade';

  switch (m.situacao) {
    case 'VENCENDO': {
      const quando = dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;
      return { texto: `${mensalidade} ${quando}.`, mostraPix: true };
    }
    case 'ATRASADA': {
      const atraso = `${mensalidade} está vencida há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`;
      // Quem nunca bloqueia não recebe promessa de bloqueio.
      const texto = m.bloqueiaEm
        ? `${atraso} O painel é bloqueado em ${diaEMes(m.bloqueiaEm)}.`
        : atraso;
      return { texto, mostraPix: true };
    }
    case 'AGUARDANDO':
      return { texto: 'Pagamento informado, aguardando confirmação.', mostraPix: false };
    default:
      return null;
  }
}

export type JeitoDePagar =
  | { tipo: 'link'; link: string; valorCentavos: number; rotulo: string; frase: string; jaPaguei: false }
  | { tipo: 'pix'; copiaECola: string; qrSvg: string; valorCentavos: number; jaPaguei: true }
  | { tipo: 'indisponivel'; texto: string; jaPaguei: true };

/// O bloco de pagamento, o mesmo na tela de bloqueio e na faixa. Pela
/// InfinitePay é só o botão do link: o aviso dela confirma sozinho, e um
/// "Já paguei" ali só seguraria o painel à toa.
export function jeitoDePagar(m: Mensalidade): JeitoDePagar {
  const pix = m.pix;
  if (pix?.link) {
    return {
      tipo: 'link', link: pix.link, valorCentavos: pix.valorCentavos,
      rotulo: 'Pagar mensalidade',
      frase: 'Pix ou cartão. Assim que o pagamento cair, o painel libera sozinho.',
      jaPaguei: false,
    };
  }
  if (pix?.copiaECola && pix.qrSvg) {
    return {
      tipo: 'pix', copiaECola: pix.copiaECola, qrSvg: pix.qrSvg,
      valorCentavos: pix.valorCentavos, jaPaguei: true,
    };
  }
  return {
    tipo: 'indisponivel',
    texto: m.pixErro ?? 'O Pix ainda não está disponível. Fale com o Marcaí.',
    jaPaguei: true,
  };
}

/// O botão da faixa que abre o pagamento.
export const rotuloDaFaixa = (m: Mensalidade): string =>
  m.pix?.link ? 'Pagar mensalidade' : 'Pagar com Pix';
