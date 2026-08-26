import { cache } from 'react';
import { origemDoTenantNoServidor } from './tenant';
import type { Barbeiro, Servico } from './api';

/// A equipe e o cardápio da barbearia, lidos NO SERVIDOR para a tela `/`.
///
/// Existe separado de `lib/api/publicoAPI.ts` pelo mesmo motivo que
/// `barbeariaAtual()` existe separado: aquele passa por `pedir()`, que monta a
/// origem a partir de `window.location` e lança sem `window`. Server Component
/// não tem `window`. Aqui o host vem do header da própria requisição.
///
/// Por que no servidor e não no navegador: esta é a primeira tela que alguém
/// vê ao abrir o link da barbearia. Buscar equipe e preços depois da
/// montagem faria a página chegar com dois blocos vazios e preenchê-los na
/// cara de quem olha — e um robô de busca não veria nada.

async function ler<T>(caminho: string): Promise<T> {
  const r = await fetch(`${await origemDoTenantNoServidor()}${caminho}`, {
    // Mesmo raciocínio de `barbeariaAtual`: o dono muda preço ou desliga um
    // serviço no painel e precisa ver na vitrine. O `cache()` do React abaixo
    // já evita repetir dentro de UMA requisição.
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`GET ${caminho} devolveu ${r.status}`);
  return r.json();
}

export const equipeDaBarbearia = cache(async (): Promise<Barbeiro[]> => {
  const d = await ler<{ barbeiros: Barbeiro[] }>('/api/barbeiros');
  return d.barbeiros;
});

/// `barbeiroId=qualquer` é o sentinela que o Django já entende: devolve o
/// serviço com o MENOR preço entre quem o faz, e a duração equivalente. É
/// exatamente o que uma vitrine quer dizer — "a partir de" —, e evita esta
/// tela ter de escolher um barbeiro para poder listar preço.
export const cardapioDaBarbearia = cache(async (): Promise<Servico[]> => {
  const d = await ler<{ servicos: Servico[] }>('/api/servicos?barbeiroId=qualquer');
  return d.servicos;
});
