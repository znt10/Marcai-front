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

// `cardapioDaBarbearia()` morava aqui e SAIU junto com a lista achatada da
// `/`. Ela usava `barbeiroId=qualquer`, o sentinela que o Django entende como
// "o menor preço entre quem faz o serviço". O sentinela CONTINUA existindo no
// back — se um dia a vitrine quiser dizer "a partir de R$ 22,00" em vez de
// listar barbeiro por barbeiro, é por ele, e não por uma conta nova aqui.

/// Um barbeiro e o cardápio DELE — o par que a `/` mostra num bloco.
export type CardapioDoBarbeiro = { barbeiro: Barbeiro; servicos: Servico[] };

/// Pareia a equipe com o cardápio de cada um, na ordem da equipe.
///
/// Pura, e separada da busca de propósito: o pareamento é por POSIÇÃO, e é
/// exatamente onde um `Promise.all` que devolva menos itens que a equipe
/// (um fetch que falhou) viraria `undefined.map` na página. O teste prova
/// os dois casos.
///
/// Barbeiro sem serviço cadastrado FICA, com a lista vazia. Ele é uma das
/// opções do seletor da vitrine, e sumir com ele ali o apagaria da fachada —
/// a grade de rostos sempre mostrou a equipe inteira, tenha preço ou não.
/// O que dizer sobre a lista vazia é decisão da tela, não desta função.
export function blocosDeCardapio(
  equipe: Barbeiro[], porBarbeiro: Servico[][],
): CardapioDoBarbeiro[] {
  return equipe.map((barbeiro, i) => ({ barbeiro, servicos: porBarbeiro[i] ?? [] }));
}

/// O cardápio de CADA barbeiro, para a vitrine mostrar quanto custa com quem.
///
/// ## Por que isto existe, e o que ele conserta
///
/// A `/` mostrava uma lista só de serviços, alimentada por
/// `cardapioDaBarbearia()` — que usa o sentinela `barbeiroId=qualquer` e
/// devolve o MENOR preço entre quem faz. Numa barbearia onde o dono cobra
/// R$ 22,00 e os outros R$ 40,00, a fachada anunciava R$ 22,00 **sem dizer
/// "a partir de"**, e quem marcasse com outro pagaria quase o dobro. O preço
/// é por barbeiro no banco (`tenant_barbeiroservico`) desde sempre; era só a
/// vitrine que achatava.
///
/// ## O custo, que é real
///
/// Uma requisição por barbeiro, em paralelo. É O(N) no tamanho da equipe, e
/// numa casa de quinze barbeiros seriam quinze — o momento de trocar isto por
/// uma rota só no Django é quando alguma equipe crescer, não agora. Roda no
/// servidor, então quem espera é o servidor e não o telefone de quem abriu.
export const cardapioPorBarbeiro = cache(async (): Promise<CardapioDoBarbeiro[]> => {
  const equipe = await equipeDaBarbearia();
  const cardapios = await Promise.all(
    equipe.map(async (b) => {
      const d = await ler<{ servicos: Servico[] }>(
        `/api/servicos?barbeiroId=${encodeURIComponent(b.id)}`,
      );
      return d.servicos;
    }),
  );
  return blocosDeCardapio(equipe, cardapios);
});
