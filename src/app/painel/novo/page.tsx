'use client';
import { useEffect, useState } from 'react';
import { Frame, Sub } from '@/components/wf';
import { FormMarcar } from '@/components/painel/FormMarcar';

export default function Novo() {
  const [eu, setEu] = useState<{ id: string; papel: 'DONO' | 'BARBEIRO' } | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/auth/eu', { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) { window.location.href = '/painel/login'; return; }
        setEu(await r.json());
      })
      .catch((e) => { if (e?.name !== 'AbortError') throw e; });
    return () => ctrl.abort();
  }, []);

  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Marcar na mão</h1>
      {eu ? <FormMarcar eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
