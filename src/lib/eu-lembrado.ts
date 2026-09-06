import type { Eu } from '@/lib/api';

/// Quem entrou, guardado no navegador para a PRIMEIRA PINTURA ter conteúdo.
///
/// O problema que isto resolve: a cada carga de página inteira (F5, URL
/// digitada, voltar de fora do app) o painel não sabia quem era você até
/// `/api/auth/eu` responder. Nesse intervalo a barra de seções ficava vazia, o
/// nome em branco e a tela dizia "carregando…" — e então tudo aparecia de
/// uma vez. É o pisca. Entre `<Link>`s isso não acontecia, porque o provider
/// sobrevive à navegação; o pisca era só na carga completa, que é justamente
/// como se entra no painel de manhã.
///
/// ## Isto NÃO é autenticação, e a distinção é o ponto
///
/// Quem decide se você entra, e se você é dono, é o **cookie de sessão** —
/// httpOnly, assinado, conferido no Django a cada pedido. Este arquivo guarda
/// uma CÓPIA do que o servidor já disse, e serve só para desenhar. Editar isto
/// à mão no navegador não concede nada: as abas "equipe" e "resumo"
/// apareceriam por alguns milissegundos e sumiriam quando a resposta real
/// chegasse, e clicar nelas levaria 403 do servidor, que nunca consultou isto.
///
/// Por isso a cópia também nunca é a última palavra: o provider revalida
/// SEMPRE, em segundo plano, e o que voltar do servidor manda. O cache muda
/// quando a tela pinta, não o que ela tem direito de mostrar.
const CHAVE = 'marcai:eu';

/// `localStorage` estoura sozinho em aba anônima e com dado de site
/// bloqueado — não é "raro", é uma configuração que existe. E no servidor ele
/// nem existe: `ProvedorDaSessao` chama `lembrado()` durante a renderização
/// de servidor, onde a referência sozinha já lança `ReferenceError`.
///
/// Os dois casos caem no mesmo `try`, de propósito, e a falha é sempre "não
/// lembro de ninguém" — que é exatamente o estado que já funcionava antes
/// deste arquivo existir. Mesma forma de `src/lib/rascunho.ts`, que resolve o
/// mesmo problema para o rascunho do agendamento.
function saneado(bruto: string | null): Eu | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as Partial<Eu>;
    // Confere a FORMA, não só a existência: um valor corrompido pela metade
    // (troca de versão, edição à mão) pintaria a tela com `undefined` no
    // lugar do nome em vez de simplesmente não lembrar.
    if (typeof v?.id !== 'string' || typeof v?.nome !== 'string') return null;
    if (v.papel !== 'DONO' && v.papel !== 'BARBEIRO') return null;
    const fotoUrl = typeof v.fotoUrl === 'string' ? v.fotoUrl : null;
    return { id: v.id, nome: v.nome, papel: v.papel, fotoUrl };
  } catch {
    return null;
  }
}

export function lembrado(): Eu | null {
  try {
    return saneado(localStorage.getItem(CHAVE));
  } catch {
    return null;
  }
}

export function lembrar(eu: Eu): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(eu));
  } catch {
    // Sem cache o painel volta a piscar, e nada mais quebra. Engolir aqui é
    // melhor que derrubar a tela por causa de uma conveniência de pintura.
  }
}

export function esquecer(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* mesmo motivo de `lembrar` */
  }
}
