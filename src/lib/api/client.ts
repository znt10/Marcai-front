/// Cliente HTTP central. **Nenhuma URL de API mora em página ou componente** —
/// elas vivem nos módulos por recurso ao lado deste arquivo, e a tela chama
/// método (`painelApi.agenda(dia)`), não caminho.
///
/// Sem axios de propósito, e isso não mudou com a separação: o cookie
/// continua viajando sozinho porque é `httpOnly` e **host-only**, e cookie
/// ignora porta — front na 3000 e Django na 8000 dividem o mesmo host,
/// **qualquer que seja o tenant**. O que a separação acrescentou foi
/// `credentials: 'include'`, o header que obriga preflight, e o `baseDe()`,
/// que monta essa origem a partir do `location` da própria página — nunca de
/// uma URL fixa, porque aqui o tenant É o host, e `NEXT_PUBLIC_API_URL` é
/// **um** literal inlinado no bundle para **todo mundo**: um valor fixo só
/// poderia acertar uma barbearia. Nenhuma dependência nova.

/// A lista de prefixos que o Django atende.
///
/// ATE A FATIA 7 isto era um interruptor: cada prefixo existia dos DOIS
/// lados, e remover uma linha devolvia a rota ao Next. **A fatia 8 apagou o
/// lado do Next.** Remover uma linha daqui hoje aponta para um handler que
/// nao existe mais — 404 mudo, longe da causa. Voltar atras e' `git revert`
/// da fatia inteira, nao edicao desta lista.
/// `/auth` entra INTEIRO — login, logout, eu e convite de uma vez. Nao ha como
/// fatiar: o casamento e por prefixo de segmento, e separar as quatro exigiria
/// quatro entradas. Tambem nao seria desejavel: com o login no Django e o
/// `/auth/eu` no Next, um SESSAO_JWT_SECRET divergente entre os dois `.env`
/// passaria despercebido ate a tela que menos se espera.
// `esquecer` e' a UNICA dependencia deste arquivo para fora de si mesmo, e
// e' de tipo nenhum: quem descobre que a sessao morreu (401) e' este cliente,
// e a copia de `eu` guardada no navegador precisa morrer junto. Ver
// `src/lib/eu-lembrado.ts`.
import { esquecer } from '@/lib/eu-lembrado';

export const MIGRADAS: readonly string[] = [
  '/barbeiros',
  '/auth',
  '/servicos',
  '/horarios',
  '/dias-com-vaga',
  // Fatia 4 — as 17 rotas do painel, uma entrada por sub-prefixo (nunca
  // '/painel' inteiro de uma vez): cada linha e' reversivel sozinha, o que
  // preserva a mesma garantia que fez as fatias 1-3 nascerem incrementais.
  // '/painel/servicos' e a publica '/servicos' se CHAMAM igual e fazem
  // coisas diferentes (catalogo do dono vs. o que da para agendar) — o
  // prefixo distingue as duas, mas vale registrar que sao rotas irmas, nao
  // a mesma.
  '/painel/servicos',
  '/painel/barbeiro-servicos',
  '/painel/expediente',
  // A foto do barbeiro (data URL na coluna `foto_url`). Esquecer esta linha
  // manda o PUT para o Next, que responde 404 sem nenhum handler — foi
  // exatamente o que aconteceu na primeira tentativa.
  '/painel/foto',
  '/painel/bloqueios',
  '/painel/equipe',
  '/painel/agenda',
  '/painel/dia',
  // O resumo do dono. Sem esta linha o pedido vai para `/api/painel/resumo`
  // NO NEXT, que nao tem handler nenhum desde a fatia 8 — 404 mudo, longe da
  // causa. E' o mesmo esquecimento que `/painel/foto` levou na primeira
  // tentativa.
  '/painel/resumo',
  '/painel/conflitos',
  '/painel/agendamentos',
  '/painel/barbearia',
  // Fecha a travessia — bloco C: as 3 rotas publicas que o cliente usa sem
  // sessao. '/agendamentos' e '/painel/agendamentos' se CHAMAM parecido mas
  // sao prefixos DIFERENTES (o casamento e por segmento, nao por comeco de
  // string) — nenhuma entrada arrasta a outra.
  '/agendamentos',
  // Bloco B: as 4 rotas de gestao de barbearias pelo admin da plataforma.
  // UMA entrada cobre as quatro (o front sempre fala com esse prefixo a
  // partir de `admin.<dominio>`), igual ao '/auth' de cima nao dar pra
  // fatiar.
  '/admin',
  // Fatia 8 — a vitrine publica do tenant. Nasceu no Django; nunca houve
  // handler do Next para ela. IRMA de '/painel/barbearia', que ja esta acima:
  // os dois prefixos sao independentes (o casamento e por segmento), mas se
  // chamam parecido o bastante para confundir quem lê a lista com pressa.
  '/barbearia',
];

/// So a PORTA do Django (ou "porta:host" nao, so a porta — o host vem do
/// `location` em tempo de chamada, nunca daqui). Antes disto era a origem
/// inteira, e isso quebrava todo mundo: um `http://localhost:8000` fixo faz o
/// back devolver 404 pra QUALQUER tenant (o Django resolve a barbearia pelo
/// Host real e nao atende `localhost` puro), e um
/// `http://brutus.localhost:8000` fixo faz `dontony.localhost:3000` receber a
/// barbearia do Brutus com 200 — errado calado, o pior dos dois.
const PORTA_API = process.env.NEXT_PUBLIC_API_URL || '8000';

/// Origem do Django para O TENANT ATUAL: mesmo protocolo e host da página,
/// porta do Django. E' assim que `brutus.localhost:3000` cai em
/// `brutus.localhost:8000` e `dontony.localhost:3000` em
/// `dontony.localhost:8000`, sem nenhuma lista de tenants aqui.
///
/// So funciona com `window` porque so o navegador sabe qual e' a pagina
/// atual. Hoje NENHUM chamador roda sem ele — `pedir()` so e' usado por
/// `publicoApi`, `painelApi` e `adminApi`, e todo componente que os importa
/// tem `'use client'` no topo (conferido em toda a arvore de `src/app` e
/// `src/components`); nao ha Server Component, Route Handler nem Server
/// Action chamando isto hoje. Se um dia houver, a resposta certa nao e'
/// inventar um host aqui — seria escolher uma barbearia no escuro, o mesmo
/// defeito que este arquivo existe para consertar — por isso o erro alto.
export function origemDoTenant(): string {
  if (typeof window === 'undefined') {
    throw new Error(
      'baseDe(): sem window nao ha host para montar a origem do Django. ' +
        'pedir() so roda em Client Component; se isto disparou, algo chamou ' +
        'uma rota migrada fora do navegador.',
    );
  }
  return `${window.location.protocol}//${window.location.hostname}:${PORTA_API}`;
}

/// Prefixo casa por segmento, nunca por comeco de string: migrar '/painel'
/// nao pode arrastar '/painelzinho' junto.
///
/// A barra final e' removida de cada entrada ANTES de comparar. Sem isso, uma
/// entrada escrita '/barbeiros/' nao casa com o caminho '/barbeiros' e a rota
/// cai em '/api' — o Next. Enquanto a rota existe dos dois lados, ninguem ve;
/// depois que ela sai do Next, vira 404 mudo longe da causa. Normalizar aqui,
/// e nao pedir disciplina de quem edita a lista, e' o que fecha isso.
export function baseDe(caminho: string, migradas: readonly string[] = MIGRADAS): string {
  const migrada = migradas.some((entrada) => {
    const p = entrada.replace(/\/$/, '');
    return caminho === p || caminho.startsWith(`${p}/`);
  });
  return migrada ? `${origemDoTenant()}/api` : '/api';
}

export class ErroApi extends Error {
  /// `corpo` é a resposta inteira, e não só `erro`. Algumas recusas trazem
  /// dados que a tela precisa: o 409 de bloquear por cima de horário vendido
  /// devolve QUEM cairia, e sem isso a tela só saberia dizer "deu conflito"
  /// sem conseguir mostrar os nomes.
  constructor(public status: number, mensagem: string, public corpo?: unknown) {
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
    // A sessão morreu: esquece quem era. Sem isto, a cópia guardada
    // sobreviveria à expulsão e a tela de entrada seria seguida de um painel
    // pintado com o nome de alguém que já não está logado — até a
    // revalidação levar 401 de novo e expulsar outra vez.
    //
    // Aqui e não no provider porque a promessa acima nunca resolve: nenhum
    // `.then`, `.catch` ou `.finally` do chamador chega a rodar. Este é o
    // único ponto do código que sabe que a sessão acabou.
    esquecer();
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
    throw new ErroApi(r.status, corpo?.erro ?? 'Não deu certo. Tenta de novo?', corpo);
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
