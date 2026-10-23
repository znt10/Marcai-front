import Link from 'next/link';
import { Marca } from '@/components/Marca';
import { vocabulario } from '@/lib/tipos';
import type { Tipo } from '@/lib/tipos';

/// O cabeçalho das telas da conta: o mesmo de `/agendar`, voltando à vitrine.
export function CabecalhoConta({ nome, tipo }: { nome: string; tipo?: Tipo }) {
  const v = vocabulario(tipo);
  return (
    <header className="border-b border-borda">
      <Link href="/" aria-label={`Voltar para ${v.oLugar} ${nome}`}
            className="mx-auto flex max-w-[1100px] items-center gap-[9px]
                       px-[18px] pt-4 pb-3.5 sm:px-7 md:px-10 md:py-5">
        <Marca tipo={tipo} nome={nome} tamanho={22} className="rounded-[5px] md:size-[28px]" />
        <span className="text-[16px] md:text-[19px] font-extrabold text-tinta">Marcaí</span>
        <span className="ml-1.5 min-w-0 truncate border-l border-borda pl-1.5
                         text-[10.5px] md:text-xs font-semibold uppercase text-lbl">
          {v.lugar} {nome}
        </span>
      </Link>
    </header>
  );
}
