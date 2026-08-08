'use client';
import { useEffect, useState } from 'react';
import { Frame, Box, Sub } from '@/components/wf';
import { Servicos } from '@/components/painel/Servicos';
import { painelApi, ignorarAborto, type Eu } from '@/lib/api';

export default function ServicosDoPainel() {
  const [eu, setEu] = useState<Eu | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    painelApi.eu(ctrl.signal).then(setEu).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Serviços</h1>
      {/* Todos entram: cada um marca o que faz. O catálogo, embaixo, só o dono. */}
      {eu ? <Servicos eu={eu} /> : <Sub>carregando…</Sub>}
      <a href="/painel"><Box>← voltar para a agenda</Box></a>
    </Frame>
  );
}
