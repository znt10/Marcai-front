'use client';
import { useEffect, useState } from 'react';
import { Frame, Sep, Sub } from '@/components/wf';
import { Equipe } from '@/components/painel/Equipe';
import { FormBarbeiro } from '@/components/painel/FormBarbeiro';
import { painelApi, ignorarAborto, type Eu } from '@/lib/api';

export default function EquipeDoPainel() {
  const [eu, setEu] = useState<Eu | null>(null);
  // Cadastrar tem que aparecer na lista sem F5. Um contador basta: ele muda, o
  // efeito da lista roda de novo.
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    painelApi.eu(ctrl.signal).then(setEu).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  return (
    <Frame>
      <h1>Equipe</h1>

      {/* A barreira de verdade é o 403 da rota; isto aqui é só não mostrar ao
          barbeiro uma tela que não vai carregar. */}
      {eu && eu.papel !== 'DONO'
        ? <Sub>Só o dono mexe na equipe.</Sub>
        : (
          <>
            <Equipe recarregarEm={versao} euId={eu?.id} />
            <Sep />
            <FormBarbeiro aoCriar={() => setVersao((v) => v + 1)} />
          </>
        )}

    </Frame>
  );
}
