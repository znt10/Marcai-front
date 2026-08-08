'use client';
import { useEffect, useState } from 'react';
import { Frame, Sub } from '@/components/wf';
import { FormMarcar } from '@/components/painel/FormMarcar';
import { painelApi, ignorarAborto, type Eu } from '@/lib/api';

export default function Novo() {
  const [eu, setEu] = useState<Eu | null>(null);

  // Sessão morta manda para a entrada — quem decide isso é o cliente da API,
  // pelo `loginEm` de `painelApi`, não cada tela por conta própria.
  useEffect(() => {
    const ctrl = new AbortController();
    painelApi.eu(ctrl.signal).then(setEu).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  return (
    <Frame>
      <h1>Marcar na mão</h1>
      {eu ? <FormMarcar eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
