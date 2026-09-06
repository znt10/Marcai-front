/// O nome e o WhatsApp que a pessoa já digitou, enquanto ela vai ao calendário
/// e volta.
///
/// Todo link deste produto é `<a href>`: ir ao calendário é um carregamento
/// inteiro de página, e o estado do React morre junto. `@/lib/escolha` resolve
/// isso para barbeiro/serviço/horário mandando os três pela querystring — mas
/// nome e telefone NÃO podem ir por lá. Uma URL com o número do cliente entra
/// no histórico do navegador, no botão de compartilhar e em todo log de acesso
/// pelo caminho; é dado de pessoa, e dado de pessoa não viaja em endereço.
///
/// `sessionStorage` é o par certo do problema: sobrevive ao carregamento de
/// página, some quando a aba fecha, nunca sai do aparelho e nunca chega ao
/// servidor. Não é `localStorage` de propósito — o telefone de quem marcou
/// hoje não deve estar esperando o próximo que pegar o mesmo celular.
const CHAVE = 'rascunho-agendamento';

export type Rascunho = { nome: string; whats: string };

const VAZIO: Rascunho = { nome: '', whats: '' };

/// Todo acesso é embrulhado: em aba anônima, com cookies de terceiros
/// bloqueados ou com o disco cheio, o próprio `sessionStorage` LANÇA. Um
/// formulário que quebra ao ser digitado é muito pior do que um que esquece.
export function lerRascunho(): Rascunho {
  try {
    const cru = sessionStorage.getItem(CHAVE);
    if (!cru) return VAZIO;
    const { nome, whats } = JSON.parse(cru) as Partial<Rascunho>;
    // Vem de fora do código (a pessoa pode ter editado, ou a versão anterior
    // do app pode ter gravado outra forma): só string entra.
    return {
      nome: typeof nome === 'string' ? nome : '',
      whats: typeof whats === 'string' ? whats : '',
    };
  } catch {
    return VAZIO;
  }
}

export function salvarRascunho(r: Rascunho): void {
  try {
    // Nada a guardar não deixa lixo: sem isto, limpar os dois campos ainda
    // deixaria a chave no armazenamento da aba.
    if (!r.nome && !r.whats) sessionStorage.removeItem(CHAVE);
    else sessionStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    /* ver `lerRascunho`: esquecer é aceitável, quebrar não é. */
  }
}

/// Chamado quando o agendamento CONFIRMA. O rascunho existe para atravessar o
/// calendário, não para ficar: cumprido o papel, ele sai — inclusive porque a
/// tela seguinte pode ser aberta por outra pessoa no balcão.
export function limparRascunho(): void {
  try { sessionStorage.removeItem(CHAVE); } catch { /* idem */ }
}
