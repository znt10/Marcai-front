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

/// A origem do Django PARA ESTE TENANT, montada a partir do `host` da
/// requisicao.
///
/// NAO passa por `pedir()` de `lib/api/client.ts`, e isso e deliberado:
/// aquele monta a origem a partir de `window.location` e LANCA sem `window`.
/// Server Component nao tem `window`. O host aqui vem do header da propria
/// requisicao, que e a fonte equivalente do lado do servidor.
async function origemDoTenant(): Promise<string> {
  const host = (await headers()).get('host');
  if (!host) notFound();
  // `host` traz a porta do FRONT (3000); o Django atende noutra. Trocar so a
  // porta e o que preserva o tenant — o host E o tenant aqui.
  const semPorta = host.split(':')[0];
  return `http://${semPorta}:${PORTA_API}`;
}

/// Envolvida em `cache()` do React: varias chamadas na MESMA requisicao batem
/// no Django uma vez so. Era o mesmo desenho quando a consulta era ao Prisma;
/// o que mudou foi so o outro lado do fio.
export const barbeariaAtual = cache(async (): Promise<Barbearia> => {
  const r = await fetch(`${await origemDoTenant()}/api/barbearia`, {
    // Sem cache entre requisicoes: o dono edita a frase do horario no painel e
    // precisa ver o resultado. O `cache()` acima ja resolve a repeticao dentro
    // de uma requisicao, que era o unico problema que o TTL antigo atacava.
    cache: 'no-store',
  });
  if (!r.ok) notFound();
  return r.json();
});
