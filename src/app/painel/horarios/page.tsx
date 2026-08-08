'use client';
import { useEffect, useState } from 'react';
import { Frame, Box, Sub } from '@/components/wf';
import { Horarios } from '@/components/painel/Horarios';
import { painelApi, ignorarAborto, type Eu } from '@/lib/api';

export default function HorariosDoPainel() {
  const [eu, setEu] = useState<Eu | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    painelApi.eu(ctrl.signal).then(setEu).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Horários</h1>
      {/* Todo mundo entra aqui: cada um mexe no seu, e o dono no de todos. */}
      {eu ? <Horarios eu={eu} /> : <Sub>carregando…</Sub>}
      <a href="/painel"><Box>← voltar para a agenda</Box></a>
    </Frame>
  );
}
