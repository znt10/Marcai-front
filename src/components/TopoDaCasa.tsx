import type { ReactNode } from 'react';
import type { Barbearia } from '@/lib/tenant';
import { vocabulario } from '@/lib/tipos';
import { Marca } from '@/components/Marca';

/// O topo das telas do cliente: o desenho pequeno do tipo e o nome da casa.
/// O desenho daqui continua sendo o do tipo, nunca a logo da casa — a logo
/// vai grande logo abaixo, e as duas lado a lado seriam a mesma marca duas
/// vezes (spec 2026-11-05).
///
/// `children` é o que vai na ponta direita: na vitrine, o botão da conta.
export function TopoDaCasa({ b, children }: { b: Barbearia; children?: ReactNode }) {
  const v = vocabulario(b.tipo);
  return (
    <div className="flex items-center gap-3">
      <Marca tipo={b.tipo} nome={b.nome} tamanho={30} className="rounded-[3px]" />
      <h1 className="!text-[19px] md:!text-[22px] min-w-0 flex-1">{v.lugar} {b.nome}</h1>
      {children}
    </div>
  );
}
