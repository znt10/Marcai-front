'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';

export type Barbearia = {
  id: string; slug: string; nome: string; ativo: boolean;
  barbeiros: number; agendamentos: number;
};

export function ListaBarbearias({ recarregarEm }: { recarregarEm?: number }) {
  const [barbearias, setBarbearias] = useState<Barbearia[]>([]);
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');

  const carregar = (signal?: AbortSignal) =>
    fetch('/api/admin/barbearias', { signal })
      .then((r) => r.json()).then((d) => setBarbearias(d.barbearias))
      .catch((e) => { if (e?.name !== 'AbortError') throw e; });

  // Aborta na limpeza: criar duas barbearias em seguida muda `recarregarEm`
  // duas vezes, e a resposta da primeira busca chegando depois da segunda
  // deixaria a lista sem a barbearia recém-criada.
  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [recarregarEm]);

  async function alternar(b: Barbearia) {
    setErro('');
    const r = await fetch(`/api/admin/barbearias/${b.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ativo: !b.ativo }),
    });
    if (!r.ok) { setErro((await r.json()).erro); return; }
    carregar();
  }

  async function reemitir(b: Barbearia) {
    setErro(''); setLink('');
    const r = await fetch(`/api/admin/barbearias/${b.id}/convite`, { method: 'POST' });
    const d = await r.json();
    if (r.ok) setLink(d.linkConvite); else setErro(d.erro);
  }

  return (
    <>
      <Lbl>barbearias</Lbl>
      {barbearias.length === 0 && <Sub>nenhuma ainda</Sub>}
      {barbearias.map((b) => (
        <Box key={b.id} variante={b.ativo ? 'normal' : 'mut'}
             className="flex flex-wrap gap-2 justify-between items-center">
          <span>{b.nome} · <span className="text-lbl">{b.slug}</span></span>
          <Lbl>{b.barbeiros} barbeiros · {b.agendamentos} agendamentos</Lbl>
          <div className="flex gap-2">
            <Chip onClick={() => alternar(b)}>{b.ativo ? 'desativar' : 'reativar'}</Chip>
            <Chip acento onClick={() => reemitir(b)}>novo convite</Chip>
          </div>
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {link && (
        <Box variante="dash" className="break-all">
          <Lbl>manda esse link pro dono — ele só aparece uma vez</Lbl>
          {link}
        </Box>
      )}
      <Lbl>desativar leva até um minuto para tirar a barbearia do ar</Lbl>
    </>
  );
}
