import type { Tipo } from '@/lib/tipos';

/// O logo no topo das telas do cliente.
///
/// O desenho da marca do Marcaí é uma NAVALHA com o poste de barbearia: na
/// barbearia ele é o de sempre, mas na página de um estúdio de sobrancelha
/// seria a "cara de barbearia" que o tipo existe para tirar (spec
/// 2026-10-08). Fora da barbearia vai a inicial do estabelecimento, nas cores
/// da paleta dele, até existir logo por estabelecimento no banco.
///
/// Sem hook: serve ao Server Component (o cabeçalho) e ao Client Component (a
/// vitrine) do mesmo jeito.
export function Marca({ tipo, nome, tamanho, className = '' }: {
  tipo?: Tipo; nome: string; tamanho: number; className?: string;
}) {
  if (!tipo || tipo === 'BARBEARIA') {
    return <img src="/marca.png" alt="" width={tamanho} height={tamanho} className={`shrink-0 ${className}`} />;
  }
  return (
    <span aria-hidden style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.56) }}
          className={`inline-flex shrink-0 items-center justify-center bg-acento font-letreiro font-extrabold
                      leading-none text-fundo ${className}`}>
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}
