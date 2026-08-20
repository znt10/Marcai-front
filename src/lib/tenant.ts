import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

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
/// para o nome de serviço (`api:8000`), o Host precisa viajar no header, à
/// mão: sem ele o Django receberia `Host: api` e recusaria o pedido inteiro
/// por `ALLOWED_HOSTS` — 400 para tudo, inclusive para páginas que nada têm a
/// ver com tenant. É a mesma correção que o agendador precisou quando virou
/// tarefa de beat.
async function pedirAoDjango(caminho: string): Promise<Response | null> {
  const h = await headers();
  const host = h.get('host');
  if (!host) return null;

  return fetch(`${API_INTERNA}/api${caminho}`, {
    headers: { host },
    // A vitrine muda quando o dono edita a frase de horário, e ele quer ver
    // que deu certo. `no-store` pelo mesmo motivo que `lib/barbearia.ts` do
    // back lê do banco em vez do cache de slug: servido de cache, o dono
    // salvava e a tela continuava mostrando a frase antiga.
    cache: 'no-store',
  });
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
  const r = await pedirAoDjango('/barbearia');
  if (!r || !r.ok) notFound();
  return (await r.json()) as Barbearia;
});

/// O agendamento que a página de confirmação mostra, pelo CÓDIGO público.
///
/// Era uma consulta com `comBarbearia(...)` e `include` de barbeiro e cliente;
/// virou uma chamada à rota que já existia para isto. O `podeCancelar` deixou
/// de ser calculado na página — quem o calcula é o servidor, que é o único
/// lado cujo relógio vale alguma coisa para essa decisão.
export async function agendamentoPorCodigo(codigo: string): Promise<AgendamentoPublico> {
  const r = await pedirAoDjango(`/agendamentos/${encodeURIComponent(codigo)}`);
  if (!r || !r.ok) notFound();
  return (await r.json()) as AgendamentoPublico;
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
