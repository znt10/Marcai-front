/// O nome e o WhatsApp de quem já marcou aqui, para a próxima vez ser um
/// clique em vez de uma digitação.
///
/// ## Por que é um arquivo separado de `rascunho.ts`
///
/// Os dois guardam os mesmos dois campos, e a diferença é a VIDA do dado:
///
/// - **rascunho** (`sessionStorage`) atravessa a ida ao calendário e morre
///   quando a aba fecha. É estado de um preenchimento em andamento.
/// - **meus dados** (`localStorage`) atravessa VISITAS. É memória.
///
/// Juntar os dois num arquivo só significaria uma função que às vezes
/// esquece e às vezes não, decidida por um parâmetro — e é exatamente o tipo
/// de coisa que alguém chama com o parâmetro errado.
///
/// ## O `localStorage` que `rascunho.ts` recusou
///
/// Aquele arquivo diz, com razão, que "o telefone de quem marcou hoje não
/// deve estar esperando o próximo que pegar o mesmo celular" — o balcão da
/// barbearia é um aparelho só. O que muda aqui é que **a tela mostra que
/// lembrou e oferece esquecer**: sob os campos preenchidos aparece "não é
/// você?", que chama `esquecerMeusDados()`. Guardar escondido seria o
/// problema; guardar à vista, com a saída ao lado, é o que todo site de
/// agendamento faz.
///
/// Nada disto chega ao servidor, e nada disto autentica coisa nenhuma: é um
/// preenchimento de formulário, e o Django valida tudo de novo.
const CHAVE = 'marcai:meus-dados';

export type MeusDados = { nome: string; whats: string };

/// Confere a FORMA, não só a existência: um valor corrompido pela metade
/// (troca de versão do app, edição à mão) preencheria o campo com `undefined`
/// em vez de simplesmente não lembrar. Mesmo desenho de `eu-lembrado.ts`.
function saneado(bruto: string | null): MeusDados | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as Partial<MeusDados>;
    if (typeof v?.nome !== 'string' || typeof v?.whats !== 'string') return null;
    if (!v.nome.trim() && !v.whats.trim()) return null;
    return { nome: v.nome, whats: v.whats };
  } catch {
    return null;
  }
}

/// Todo acesso é embrulhado: em aba anônima, com dado de site bloqueado ou com
/// o disco cheio, o próprio `localStorage` LANÇA — e no servidor a referência
/// sozinha já dá `ReferenceError`. A falha é sempre "não lembro de ninguém",
/// que é o estado que já funcionava antes deste arquivo existir.
export function lerMeusDados(): MeusDados | null {
  try {
    return saneado(localStorage.getItem(CHAVE));
  } catch {
    return null;
  }
}

/// Chamado quando o agendamento CONFIRMA — não a cada tecla. Só faz sentido
/// lembrar de um par nome/telefone que o servidor já aceitou: guardar o que
/// está sendo digitado gravaria "Jos" e "8398", meio número, no meio da
/// palavra.
export function salvarMeusDados(d: MeusDados): void {
  try {
    if (!d.nome.trim() && !d.whats.trim()) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, JSON.stringify(d));
  } catch {
    /* esquecer é aceitável; quebrar o formulário não é */
  }
}

export function esquecerMeusDados(): void {
  try { localStorage.removeItem(CHAVE); } catch { /* idem */ }
}
