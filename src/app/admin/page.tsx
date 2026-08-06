'use client';
import { useState } from 'react';
import { ListaBarbearias } from '@/components/admin/ListaBarbearias';
import { FormBarbearia } from '@/components/admin/FormBarbearia';
import { Sep, Lbl } from '@/components/wf';

export default function Admin() {
  // Criar uma barbearia tem que aparecer na lista sem F5. Um contador é o
  // suficiente: ele muda, o efeito da lista roda de novo.
  const [versao, setVersao] = useState(0);

  async function sair() {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return (
    <>
      <ListaBarbearias recarregarEm={versao} />
      <Sep />
      <FormBarbearia aoCriar={() => setVersao((v) => v + 1)} />
      <Sep />
      <div className="text-[10px] md:text-xs text-lbl text-center cursor-pointer" onClick={sair}>
        <Lbl>sair</Lbl>
      </div>
    </>
  );
}
