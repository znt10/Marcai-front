import { formatarPreco } from '@/lib/dinheiro';

/// O Pix de um horário na agenda e no quadro (P5 do back). Ausente = horário
/// confirmado sem cobrança, o caso de sempre.
export type BlocoPix = {
  estado: 'aguardando' | 'expirado' | 'pago';
  /// Nulo no aguardando cuja cobrança ainda não foi aberta (instantes).
  valorCentavos: number | null;
  expiraEm: string | null;
};

export type TipoDeChave = 'CPF' | 'CNPJ' | 'CELULAR' | 'EMAIL' | 'ALEATORIA';

export const TIPOS_DE_CHAVE: { valor: TipoDeChave; rotulo: string }[] = [
  { valor: 'CPF', rotulo: 'CPF' },
  { valor: 'CNPJ', rotulo: 'CNPJ' },
  { valor: 'CELULAR', rotulo: 'Celular' },
  { valor: 'EMAIL', rotulo: 'E-mail' },
  { valor: 'ALEATORIA', rotulo: 'Chave aleatória' },
];

export const TITULAR_MAX = 60;

const horaDeSaoPaulo = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });

/// A frase do selo de cada estado; `null` quando não há Pix a mostrar.
export function rotuloDoPix(pix: BlocoPix | null | undefined): string | null {
  if (!pix) return null;
  if (pix.estado === 'pago') return 'Pago';
  if (pix.estado === 'expirado') return 'Pix vencido';
  const partes = ['Esperando Pix'];
  if (pix.valorCentavos != null) partes.push(formatarPreco(pix.valorCentavos));
  if (pix.expiraEm) partes.push(`vence ${horaDeSaoPaulo(pix.expiraEm)}`);
  return partes.join(' · ');
}

/// Esperando Pix e Pix vencido ainda não são horário vendido: não entram em
/// "N marcados" nem podem ser o "próximo".
export function contaComoMarcado(i: { pix?: BlocoPix | null }): boolean {
  const e = i.pix?.estado;
  return e !== 'aguardando' && e !== 'expirado';
}

export const contarMarcados = (itens: { pix?: BlocoPix | null }[]) =>
  itens.filter(contaComoMarcado).length;

/// O primeiro que ainda não terminou, pulando quem não conta como marcado.
export function primeiroQueFalta<T extends { pix?: BlocoPix | null }>(
  itens: T[], naoTerminou: (i: T) => boolean,
): T | null {
  return itens.find((i) => contaComoMarcado(i) && naoTerminou(i)) ?? null;
}

export const textoDaConfirmacaoRecebi = (valorCentavos: number | null | undefined) =>
  valorCentavos != null
    ? `Confirmar que o Pix de ${formatarPreco(valorCentavos)} caiu na sua conta?`
    : 'Confirmar que o Pix caiu na sua conta?';

/// Cancelou um horário que já tinha sido pago: o Marcaí não move dinheiro.
export function textoDaDevolucao(pagoCentavos: number | null | undefined): string | null {
  if (!pagoCentavos) return null;
  return `Esse horário estava pago (${formatarPreco(pagoCentavos)}) — devolva o Pix pelo app do banco.`;
}

export type FormPix = { cobra: boolean; tipo: TipoDeChave | ''; chave: string; titular: string };

/// Validação leve: só o que dá para dizer sem saber as regras de cada chave
/// (dígito verificador etc. é do back, cuja frase vai para a tela).
export function validarPixDoBarbeiro(f: FormPix): string | null {
  const chave = f.chave.trim();
  const titular = f.titular.trim();
  if (chave && !f.tipo) return 'Escolha o tipo da chave Pix.';
  if (f.cobra) {
    if (!f.tipo) return 'Escolha o tipo da chave Pix.';
    if (!chave) return 'Informe a chave Pix.';
    if (!titular) return 'Informe o nome do titular da chave.';
  }
  if (titular.length > TITULAR_MAX) return `O nome do titular tem no máximo ${TITULAR_MAX} caracteres.`;
  return null;
}

export const corpoParaSalvar = (f: FormPix) => ({
  cobraNoAgendamento: f.cobra,
  pixTipo: f.tipo,
  pixChave: f.chave.trim(),
  pixTitular: f.titular.trim(),
});
