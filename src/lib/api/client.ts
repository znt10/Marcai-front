/// Cliente HTTP central. **Nenhuma URL de API mora em página ou componente** —
/// elas vivem nos módulos por recurso ao lado deste arquivo, e a tela chama
/// método (`painelApi.agenda(dia)`), não caminho.
///
/// Sem axios de propósito, e isso não mudou com a separação: o cookie
/// continua viajando sozinho porque é `httpOnly` e **host-only**, e cookie
/// ignora porta — front na 3000 e Django na 8000 dividem o mesmo host. O que
/// a separação acrescentou foi `credentials: 'include'`, o header que obriga
/// preflight, e o `baseDe()`. Nenhuma dependência nova.

/// A lista de prefixos que o Django ja atende. **Este array e o painel de
/// controle da travessia inteira**: cada fatia acrescenta os seus, e voltar
/// atras e remover uma linha. E tambem o unico lugar onde alguem precisa
/// olhar para responder "quem serve isto hoje?".
export const MIGRADAS: readonly string[] = [];

const API_EXTERNA = process.env.NEXT_PUBLIC_API_URL ?? '';

/// Prefixo casa por segmento, nunca por comeco de string: migrar '/painel'
/// nao pode arrastar '/painelzinho' junto.
export function baseDe(caminho: string, migradas: readonly string[] = MIGRADAS): string {
  const migrada = migradas.some((p) => caminho === p || caminho.startsWith(`${p}/`));
  return migrada ? `${API_EXTERNA}/api` : '/api';
}

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export type Busca = Record<string, string | number | undefined>;

export type Pedido = {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  corpo?: unknown;
  busca?: Busca;
  signal?: AbortSignal;
  /// Para onde mandar o navegador quando a sessão morre (401). Só as áreas
  /// autenticadas passam: no fluxo público, 401 é erro comum, não expulsão.
  loginEm?: string;
};

function montarBusca(busca?: Busca): string {
  if (!busca) return '';
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(busca)) {
    if (valor !== undefined && valor !== '') p.set(chave, String(valor));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function pedir<T>(caminho: string, p: Pedido = {}): Promise<T> {
  const temCorpo = p.corpo !== undefined;
  const metodo = p.metodo ?? 'GET';

  const r = await fetch(`${baseDe(caminho)}${caminho}${montarBusca(p.busca)}`, {
    method: metodo,
    // Same-origin enquanto a rota for do Next; obrigatorio quando ela for do
    // Django, que esta noutra porta. Inofensivo nos dois casos.
    credentials: 'include',
    headers: {
      ...(temCorpo ? { 'content-type': 'application/json' } : {}),
      // Obriga preflight na escrita. Entre 3000 e 8000 e same-site, e ai o
      // SameSite=Lax nao protege — quem protege e este header mais a
      // allowlist do outro lado.
      ...(metodo === 'GET' ? {} : { 'x-brutus-cliente': 'web' }),
    },
    body: temCorpo ? JSON.stringify(p.corpo) : undefined,
    signal: p.signal,
  });

  if (r.status === 401 && p.loginEm && typeof window !== 'undefined') {
    window.location.href = p.loginEm;
    // Navegação não é síncrona: sem esta promessa que nunca resolve, o
    // chamador seguiria em frente e tentaria pintar a tela com nada.
    return new Promise<never>(() => {});
  }

  const corpo = await r.json().catch(() => null);

  // A mensagem vem da rota. Trocá-la por texto genérico aqui apagaria as
  // respostas que foram escritas com cuidado — inclusive a única resposta do
  // login, que existe para o formulário não enumerar a equipe.
  if (!r.ok) {
    throw new ErroApi(r.status, corpo?.erro ?? 'Não deu certo. Tenta de novo?');
  }

  return corpo as T;
}

/// Para efeito: engole o aborto e deixa o resto subir. Abortar é o caminho
/// esperado quando o componente sai ou a dependência muda, não falha.
export function ignorarAborto(e: unknown): void {
  if ((e as Error)?.name !== 'AbortError') throw e;
}

/// A mensagem que a tela deve mostrar. Aborto não vira erro visível.
export function mensagemDoErro(e: unknown): string {
  if ((e as Error)?.name === 'AbortError') return '';
  if (e instanceof ErroApi) return e.message;
  return 'Não deu certo. Tenta de novo?';
}
