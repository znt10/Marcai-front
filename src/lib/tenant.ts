import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { request } from 'node:http';

/// Traduz o `host` da requisição no slug da barbearia. Implementada em
/// `./slug` para que o proxy possa importá-la sem arrastar nada junto;
/// reexportada aqui porque é daqui que o resto do sistema (e o teste) a lê.
export { extrairSlug } from './slug';

/// A barbearia como a VITRINE precisa dela. Era `Barbearia` do
/// `@prisma/client` — a linha inteira, com `id`, `ativo`, `criadoEm` e tudo o
/// mais que uma página nunca mostrou. Agora é o que `GET /api/barbearia`
/// devolve, e nada além.
///
/// Note o que sumiu junto: `id`. Nenhuma página precisa dele, porque nenhuma
/// página consulta banco — quem escopa o tenant é o Host, do outro lado.
export type Barbearia = {
  nome: string;
  endereco: string;
  horarioResumo: string | null;
  whatsappContato: string;
};

/// Onde o Django atende PARA O SERVIDOR do Next — não para o navegador.
///
/// São dois caminhos diferentes de propósito, e confundi-los é o erro caro
/// aqui. O navegador chega ao Django por `<slug>.localhost:8000`, montado em
/// tempo de chamada por `baseDe()` (src/lib/api/client.ts) a partir do
/// `location` da página. Este arquivo roda no SERVIDOR, dentro do contêiner,
/// onde `brutus.localhost` não resolve nada: lá o Django é o serviço `api`.
///
/// Mesmo padrão de `EVOLUTION_API_URL` no compose do front — nome de serviço,
/// resolvível só dentro da rede, e por isso fora do `.env` (que é lido também
/// do host).
const API_INTERNA = process.env.API_URL_INTERNA || 'http://api:8000';

/// Busca no Django repassando o Host ORIGINAL da requisição.
///
/// O Host é o que escolhe a barbearia — o `TenantMiddleware` do Django resolve
/// o subdomínio e escopa o RLS a partir dele. Como a URL que usamos aponta
/// para o nome de serviço (`api:8000`), o Host precisa viajar à mão.
///
/// E é por isso que aqui NÃO é `fetch`. `host` está na lista de cabeçalhos
/// proibidos do spec de fetch, e o Node não recusa: ele DESCARTA em silêncio e
/// manda o Host derivado da URL. O Django então via `Host: api:8000`, que não
/// casa com `ALLOWED_HOSTS`, e devolvia 400 para tudo — inclusive para páginas
/// que nada têm a ver com tenant. Sem erro em lugar nenhum: o front só
/// mostrava 404, porque um 400 não é `ok`.
///
/// Corrigir do outro lado seria ligar `USE_X_FORWARDED_HOST`, e o back
/// desliga isso de propósito: ler o tenant de cabeçalho de upstream faria o
/// Django precisar do Next na frente para funcionar, e ele tem de subir,
/// testar e ir para produção sozinho (spec §5). Então quem se ajeita é o
/// front. `node:http` não filtra cabeçalho nenhum — é literalmente o que a
/// gente escreve que vai na linha.
function pedirBruto(host: string, caminho: string): Promise<{ ok: boolean; corpo: string }> {
  const alvo = new URL(`${API_INTERNA}/api${caminho}`);

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: alvo.hostname,
        port: alvo.port,
        path: alvo.pathname + alvo.search,
        method: 'GET',
        // O Host de verdade, o da requisição que chegou no Next.
        headers: { host },
      },
      (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (p) => (corpo += p));
        res.on('end', () =>
          resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, corpo }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/// A vitrine muda quando o dono edita a frase de horário, e ele quer ver que
/// deu certo. Nada aqui é cacheado pelo mesmo motivo que o back lê do banco em
/// vez do cache de slug: servido de cache, o dono salvava e a tela continuava
/// mostrando a frase antiga. O `cache()` do React logo abaixo é outra coisa —
/// dura uma requisição, não entre elas.
async function pedirAoDjango<T>(caminho: string): Promise<T | null> {
  const h = await headers();
  const host = h.get('host');
  if (!host) return null;

  const r = await pedirBruto(host, caminho);
  if (!r.ok) return null;
  return JSON.parse(r.corpo) as T;
}

/// Para SERVER COMPONENTS, que não recebem a Request em mãos e leem o header
/// do contexto assíncrono do Next. Envolvida em cache() do React: várias
/// chamadas na mesma requisição batem no Django uma vez só.
///
/// `notFound()` cobre os três casos que a página trata igual — host sem slug,
/// slug que não existe e barbearia desativada. Os três vinham do `resolver()`
/// que consultava o banco; agora chegam como 404 do Django, que aplica
/// exatamente as mesmas regras (`ExigeTenant` + `ativo`).
export const barbeariaAtual = cache(async (): Promise<Barbearia> => {
  const dados = await pedirAoDjango<Barbearia>('/barbearia');
  if (!dados) notFound();
  return dados;
});

/// O agendamento que a página de confirmação mostra, pelo CÓDIGO público.
///
/// Era uma consulta com `comBarbearia(...)` e `include` de barbeiro e cliente;
/// virou uma chamada à rota que já existia para isto. O `podeCancelar` deixou
/// de ser calculado na página — quem o calcula é o servidor, que é o único
/// lado cujo relógio vale alguma coisa para essa decisão.
export async function agendamentoPorCodigo(codigo: string): Promise<AgendamentoPublico> {
  const dados = await pedirAoDjango<AgendamentoPublico>(
    `/agendamentos/${encodeURIComponent(codigo)}`,
  );
  if (!dados) notFound();
  return dados;
}

export type AgendamentoPublico = {
  codigo: string;
  clienteNome: string;
  barbeiroNome: string;
  servicoNome: string;
  duracaoMin: number;
  inicio: string;
  fim: string;
  status: string;
  podeCancelar: boolean;
  precoCentavos: number | null;
  endereco: string;
  whatsappBarbearia: string;
};
