'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ListaBarbearias } from '@/components/admin/ListaBarbearias';
import { FormBarbearia } from '@/components/admin/FormBarbearia';
import { Lbl, Sep } from '@/components/wf';
import { NOME_DA_CATEGORIA } from '@/lib/categorias';
import type { Tipo } from '@/lib/tipos';

/// O admin de UMA categoria (`/admin/<categoria>`): os estabelecimentos dela e
/// o formulário que cria já com o tipo dela.
export function AdminDaCategoria({ tipo }: { tipo: Tipo }) {
  // Criar tem que aparecer na lista sem F5. Um contador é o suficiente: ele
  // muda, o efeito da lista roda de novo.
  const [versao, setVersao] = useState(0);

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-letreiro text-[22px] md:text-[26px] font-extrabold text-tinta">
          {NOME_DA_CATEGORIA[tipo]}
        </span>
        <Link href="/admin"><Lbl>‹ categorias</Lbl></Link>
      </div>
      <ListaBarbearias tipo={tipo} recarregarEm={versao} />
      <Sep />
      <FormBarbearia tipo={tipo} aoCriar={() => setVersao((v) => v + 1)} />
    </>
  );
}
