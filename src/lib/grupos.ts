/// Grupos do catálogo (Cabelo, Barba, Combos…), criados pelo dono
/// (pedido de 06/11/2026).
///
/// A regra é "tudo ou nada", e quem a garante é o back: casa sem grupo
/// nenhum mostra a lista solta, como sempre; casa com grupo tem TODO serviço
/// dentro de algum. A tela só desenha o que chega.

export type GrupoDeServico = {
  id: string; nome: string;
  /// Uma das chaves de `ICONES_DE_GRUPO`, ou nulo (o grupo aparece só com o nome).
  icone: string | null;
  ordem: number;
};

/// A mesma lista do back (`tenant.models.ICONES_DE_GRUPO`), na ordem da grade.
export const ICONES_DE_GRUPO = [
  'tesoura', 'navalha', 'pente', 'secador', 'sobrancelha', 'cilios', 'unha',
  'pincel', 'cera', 'gota', 'folha', 'presente', 'estrela', 'coracao',
] as const;
export type IconeDeGrupo = (typeof ICONES_DE_GRUPO)[number];

export type Gaveta<T> = { grupo: GrupoDeServico; itens: T[] };

/// Separa os itens pelos grupos, na ordem dos grupos; dentro de cada grupo,
/// a ordem em que os itens chegaram (que já é a do catálogo).
///
/// `null` quando a casa não usa grupos: a tela mostra a lista solta.
/// Grupo sem item não vira gaveta, porque seria uma faixa que abre para nada.
/// Item com grupo que não está na lista (não deveria acontecer) vai para o
/// fim, sem rótulo, para nunca sumir da tela.
export function agrupar<T extends { grupoId: string | null }>(
  itens: T[], grupos: GrupoDeServico[],
): { gavetas: Gaveta<T>[]; soltos: T[] } | null {
  if (grupos.length === 0) return null;
  const ordenados = [...grupos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const conhecidos = new Set(ordenados.map((g) => g.id));
  const gavetas = ordenados
    .map((grupo) => ({ grupo, itens: itens.filter((i) => i.grupoId === grupo.id) }))
    .filter((g) => g.itens.length > 0);
  const soltos = itens.filter((i) => !i.grupoId || !conhecidos.has(i.grupoId));
  return { gavetas, soltos };
}
