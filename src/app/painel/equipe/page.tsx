'use client';
import { useState } from 'react';
import { Frame, Sep, Sub } from '@/components/wf';
import { Equipe } from '@/components/painel/Equipe';
import { FormBarbeiro } from '@/components/painel/FormBarbeiro';
import { useEu } from '@/components/painel/SessaoDoPainel';

export default function EquipeDoPainel() {
  // `eu` vem do provider do layout, buscado uma vez por sessão — não mais
  // uma busca própria desta tela. Ver `SessaoDoPainel.tsx`.
  const { eu, carregando } = useEu();
  // Cadastrar tem que aparecer na lista sem F5. Um contador basta: ele muda, o
  // efeito da lista roda de novo.
  const [versao, setVersao] = useState(0);

  return (
    <Frame>
      <h1>Equipe</h1>

      {/* A barreira de verdade é o 403 da rota; isto aqui é só não mostrar ao
          barbeiro uma tela que não vai carregar. Antes, com `eu` ainda
          `null` durante a busca, `eu && eu.papel !== 'DONO'` dava `false` e
          esta tela mostrava o ramo do DONO para qualquer um por um instante.
          Com `carregando` disponível, não mostramos nenhum dos dois ramos
          antes de saber de verdade. */}
      {carregando
        ? <Sub>carregando…</Sub>
        : eu && eu.papel !== 'DONO'
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
