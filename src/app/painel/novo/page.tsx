'use client';
import { useEffect, useState } from 'react';
import { Frame, Sub } from '@/components/wf';
import { FormMarcar } from '@/components/painel/FormMarcar';

export default function Novo() {
  const [eu, setEu] = useState<{ id: string; papel: 'DONO' | 'BARBEIRO' } | null>(null);

  useEffect(() => {
    fetch('/api/auth/eu').then(async (r) => {
      if (!r.ok) { window.location.href = '/painel/login'; return; }
      setEu(await r.json());
    });
  }, []);

  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Marcar na mão</h1>
      {eu ? <FormMarcar eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
