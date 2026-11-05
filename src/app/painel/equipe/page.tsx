'use client';
import { useState } from 'react';
import { Frame } from '@/components/wf';
import { Fio, Texto, TituloDaTela } from '@/components/painel/pecas';
import { Equipe } from '@/components/painel/Equipe';
import { FormBarbeiro } from '@/components/painel/FormBarbeiro';
import { ClientesBloqueados } from '@/components/painel/ClientesBloqueados';
import { useEu } from '@/components/painel/SessaoDoPainel';
import { LogoDaCasaPainel } from '@/components/painel/LogoDaCasaPainel';
import { SuaFoto } from '@/components/painel/SuaFoto';

export default function EquipeDoPainel() {
  // `eu` vem do provider do layout, buscado uma vez por sessão — não mais
  // uma busca própria desta tela. Ver `SessaoDoPainel.tsx`.
  const { eu, carregando } = useEu();
  // Cadastrar tem que aparecer na lista sem F5. Um contador basta: ele muda, o
  // efeito da lista roda de novo.
  const [versao, setVersao] = useState(0);

  return (
    <Frame medio>
      <TituloDaTela titulo="Equipe" />

      {/* A barreira de verdade é o 403 da rota; isto aqui é só não mostrar ao
          barbeiro uma tela que não vai carregar. Antes, com `eu` ainda
          `null` durante a busca, `eu && eu.papel !== 'DONO'` dava `false` e
          esta tela mostrava o ramo do DONO para qualquer um por um instante.
          Com `carregando` disponível, não mostramos nenhum dos dois ramos
          antes de saber de verdade. */}
      {carregando
        ? <Texto>carregando…</Texto>
        : eu && eu.papel !== 'DONO'
          ? <Texto>Só o dono mexe na equipe.</Texto>
          : (
            <>
              {/* A cara da casa e a do dono, lado a lado, antes da equipe
                  (spec 2026-11-05). No celular, uma embaixo da outra. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <LogoDaCasaPainel />
                <SuaFoto />
              </div>
              <Fio className="my-1" />
              <Equipe recarregarEm={versao} euId={eu?.id} />
              <Fio className="my-1" />
              <FormBarbeiro aoCriar={() => setVersao((v) => v + 1)} />
              <Fio className="my-1" />
              <ClientesBloqueados />
            </>
          )}

    </Frame>
  );
}
