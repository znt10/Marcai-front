import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

/// A vitrine do tenant, servida pelo Django desde a fatia 8. Este modulo era
/// o ultimo do front a tocar o banco; o Prisma saiu com ele.
///
/// `comBarbearia`/`comBarbeariaAdmin` — os dois wrappers de RLS que viviam
/// aqui — nao foram portados: quem seta `app.barbearia_id` agora e o Django
/// (`tenant/rls.py`). O RLS continua existindo, ele e do BANCO, nao do
/// framework.

export type Barbearia = {
  nome: string;
  endereco: string;
  /// Nulo ate o dono escrever a frase. A home ja trata (`b.horarioResumo ? ...`).
  horarioResumo: string | null;
  whatsappContato: string;
};

/// Reexportada daqui porque e daqui que o resto do sistema a le. A
/// implementacao mora em `./slug` para que o `proxy.ts` a importe sem
/// arrastar mais nada junto — era o Prisma antes, e a separacao continua
/// valendo por higiene do bundle Edge.
export { extrairSlug } from './slug';

const PORTA_API = process.env.NEXT_PUBLIC_API_URL || '8000';

/// Um GET no Django FEITO PELO SERVIDOR, em nome da barbearia desta requisição.
///
/// NAO passa por `pedir()` de `lib/api/client.ts`, e isso e deliberado:
/// aquele monta a origem a partir de `window.location` e LANCA sem `window`.
/// Server Component nao tem `window`. O host aqui vem do header da propria
/// requisicao, que e a fonte equivalente do lado do servidor.
///
/// Era `origemDoTenantNoServidor()`, que devolvia só a origem, e cada tela
/// fazia o próprio `fetch`. Virou a busca inteira porque em produção a origem
/// sozinha não basta: o pedido precisa levar CABEÇALHOS também, e três telas
/// lembrando de mandá-los seriam três lugares para um esquecer.
///
/// Os dois caminhos:
///
/// - Com `API_INTERNA_URL` (produção): pela rede interna, com o host da
///   barbearia em `x-marcai-host` e o segredo em `x-marcai-proxy` — os mesmos
///   cabeçalhos que o `proxy.ts` põe no rewrite de `/api/*`. Nesse salto o
///   Host que chega ao Django é o da rede interna, que não é barbearia
///   nenhuma. Antes, a origem era montada pelo host mesmo em produção, e com
///   `NEXT_PUBLIC_API_URL="443"` virava `http://brutus.<dominio>:443`: HTTP
///   puro na porta do HTTPS, e toda página renderizada no servidor dava 500.
///
/// - Sem ela (dev): o host da requisição com a porta do Django. Em dev,
///   `brutus.localhost`/`dontony.localhost` so resolvem porque o servico `api`
///   do compose do back declara esses nomes como ALIAS de rede (ver
///   `../Marcai-back/docker-compose.yml`) — sem isso o host so existiria no
///   navegador, nunca de dentro do contêiner do front. Uma linha por tenant:
///   uma barbearia nova criada pelo admin em dev nao ganha apelido sozinha.
///
/// Sempre `no-store`: o dono edita a frase do horario, o preço ou a equipe no
/// painel e precisa ver o resultado. O `cache()` do React de quem chama ja
/// resolve a repeticao dentro de UMA requisicao.
export async function buscarNoDjango(caminho: string): Promise<Response> {
  const host = (await headers()).get('host');
  if (!host) notFound();

  const interna = process.env.API_INTERNA_URL?.trim().replace(/\/+$/, '');
  if (interna) {
    const cabecalhos = new Headers();
    // Sem segredo, nenhum cabeçalho — igual ao `proxy.ts`. O Django ignora
    // `x-marcai-host` sem o segredo certo, então mandá-lo não ajudaria.
    const segredo = process.env.PROXY_SEGREDO;
    if (segredo) {
      cabecalhos.set('x-marcai-host', host);
      cabecalhos.set('x-marcai-proxy', segredo);
    }
    return fetch(`${interna}${caminho}`, { cache: 'no-store', headers: cabecalhos });
  }

  // `host` traz a porta do FRONT (3000); o Django atende noutra. Trocar so a
  // porta e o que preserva o tenant — o host E o tenant aqui.
  const semPorta = host.split(':')[0];
  return fetch(`http://${semPorta}:${PORTA_API}${caminho}`, { cache: 'no-store' });
}

/// Envolvida em `cache()` do React: varias chamadas na MESMA requisicao batem
/// no Django uma vez so. Era o mesmo desenho quando a consulta era ao Prisma;
/// o que mudou foi so o outro lado do fio.
export const barbeariaAtual = cache(async (): Promise<Barbearia> => {
  const r = await buscarNoDjango('/api/barbearia');
  // So 404 e barbearia inexistente. Um 5xx (Django fora do ar, por exemplo)
  // NAO e a mesma coisa — tratar os dois igual faria uma queda do Django
  // aparecer pra todo tenant como "essa barbearia nao existe".
  if (r.status === 404) notFound();
  if (!r.ok) throw new Error(`GET /api/barbearia devolveu ${r.status}`);
  return r.json();
});
