import type { LinhaDaMensalidade } from '@/lib/api';

/// Quem pede o olho do admin primeiro. "Avisou que pagou" vem antes de tudo:
/// tem gente esperando o admin conferir o Pix. AGUARDANDO é o mesmo caso
/// visto pela situação (o aviso sempre existe), então conta igual.
function pesoDaLinha(l: LinhaDaMensalidade): number {
  if (l.informada || l.situacao === 'AGUARDANDO') return 0;
  switch (l.situacao) {
    case 'BLOQUEADA': return 1;
    case 'ATRASADA': return 2;
    case 'VENCENDO': return 3;
    default: return 4;
  }
}

/// A lista na ordem da tela. Uma cópia: a entrada não é mexida.
///
/// A tela chama isto UMA vez, ao carregar, e depois só troca a linha de lugar
/// no mesmo índice: confirmar um aviso não pode fazer a linha pular debaixo
/// do ponteiro (foi o que a Plataforma do FechaCaixa teve de consertar).
export const ordenarMensalidades = (linhas: LinhaDaMensalidade[]): LinhaDaMensalidade[] =>
  [...linhas].sort((a, b) =>
    pesoDaLinha(a) - pesoDaLinha(b)
    || a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

const diaEMes = (iso: string) => {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
};

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/// A frase da situação, em minúsculas como o resto do admin.
export function rotuloDaSituacao(l: LinhaDaMensalidade): string {
  if (l.informada) return 'avisou que pagou';
  const n = l.dias ?? 0;
  switch (l.situacao) {
    case 'BLOQUEADA': return `bloqueada há ${dias(n)}`;
    case 'ATRASADA': return `atrasada há ${dias(n)}`;
    case 'VENCENDO': return n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : `vence em ${dias(n)}`;
    case 'EM_DIA': return l.pagaAte ? `em dia até ${diaEMes(l.pagaAte)}` : 'em dia';
    case 'ISENTA': return 'isenta';
    case 'DESATIVADA': return 'desativada';
    case 'AGUARDANDO': return 'avisou que pagou';
  }
}

/// "49,90", "49.90", "49", "R$ 1.234,50" → centavos; o que não for dinheiro,
/// `null`. Ponto sozinho só vale como decimal ("49.90"): "1.234" é ambíguo
/// (R$ 1,23? mil reais?) e o admin digita de novo em vez de o sistema chutar.
export function centavosDoTexto(texto: string): number | null {
  const t = texto.replace(/^\s*R\$\s*/i, '').trim();
  const m = /^(\d+|\d{1,3}(?:\.\d{3})+),(\d{1,2})$|^(\d+)(?:\.(\d{1,2}))?$|^(\d+)$/.exec(t);
  if (!m) return null;
  const inteiro = (m[1] ?? m[3] ?? m[5]).replace(/\./g, '');
  const frac = (m[2] ?? m[4] ?? '').padEnd(2, '0');
  return Number(inteiro) * 100 + Number(frac);
}
