'use client';
import { createContext, useContext } from 'react';
import { vocabulario, type Tipo, type Vocabulario } from '@/lib/tipos';

/// O ramo do estabelecimento para os Client Components (o formulário de
/// marcar, o painel). Posto UMA vez, pelo layout raiz, que já lê a
/// barbearia para as cores — e não passado de prop em prop até o botão que
/// diz "Toque no barbeiro". Server Component não lê contexto: lá é
/// `vocabulario(b.tipo)` direto.
///
/// Fora de um estabelecimento (admin, 404) o tipo vem vazio, e o
/// vocabulário é o da barbearia — o que todo texto já era.
const Contexto = createContext<Tipo | undefined>(undefined);

export function ProvedorDoVocabulario({ tipo, children }: { tipo?: Tipo; children: React.ReactNode }) {
  return <Contexto.Provider value={tipo}>{children}</Contexto.Provider>;
}

export function useVocabulario(): Vocabulario {
  return vocabulario(useContext(Contexto));
}
