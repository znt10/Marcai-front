/// O admin da plataforma separado por ramo (pedido de 09/10/2026): `/admin`
/// é a entrada, com um cartão por categoria, e `/admin/<categoria>` é o
/// admin daquela — lista só os dela e cria já com o tipo dela.
///
/// As categorias SÃO os tipos (`TIPOS`): tipo novo no código vira cartão
/// novo na entrada sem ninguém mexer na tela.

import { TIPOS, type Tipo } from './tipos';

/// O nome no cartão e no título da tela de cada categoria.
export const NOME_DA_CATEGORIA: Record<Tipo, string> = {
  BARBEARIA: 'Barbearias', SOBRANCELHA: 'Sobrancelha', OUTRO: 'Outros',
};

/// O pedaço do endereço: `/admin/barbearia`, `/admin/sobrancelha`.
export const slugDaCategoria = (tipo: Tipo) => tipo.toLowerCase();

/// O contrário, para a página da categoria. `null` para o que não é tipo
/// (`/admin/manicure`, `/admin/BARBEARIA`): a página responde 404.
export function tipoDaCategoria(slug: string): Tipo | null {
  return TIPOS.find((t) => slugDaCategoria(t) === slug) ?? null;
}

/// Os estabelecimentos de uma categoria. Sem tipo (o back de antes dele)
/// conta como barbearia — é o que todos eram.
export function daCategoria<T extends { tipo?: Tipo }>(lista: T[], tipo: Tipo): T[] {
  return lista.filter((b) => (b.tipo ?? 'BARBEARIA') === tipo);
}
