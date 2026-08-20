'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub, Sep } from '@/components/wf';
import {
  servicosApi, publicoApi, barbeariaApi, mensagemDoErro,
  type ServicoDoCatalogo, type VinculoDeServico, type Eu, type Barbeiro,
} from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';

export function Servicos({ eu }: { eu: Eu }) {
  const [catalogo, setCatalogo] = useState<ServicoDoCatalogo[] | null>(null);
  const [vinculos, setVinculos] = useState<VinculoDeServico[]>([]);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [barbeiroId, setBarbeiroId] = useState(eu.id);
  /// Três estados, não dois: `undefined` é "ainda não buscamos", `null` é "a
  /// barbearia não tem horário escrito" e string é a frase. Colapsar os dois
  /// primeiros faria a tela acusar "a home não mostra horário" durante o
  /// carregamento de toda barbearia que tem horário.
  const [frase, setFrase] = useState<string | null | undefined>(undefined);
  const [erro, setErro] = useState('');

  const alvo = barbeiroId === eu.id ? undefined : barbeiroId;

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      const [cat, vin] = await Promise.all([
        servicosApi.catalogo(signal),
        servicosApi.vinculos(alvo, signal),
      ]);
      setCatalogo(cat);
      setVinculos(vin);
      setErro('');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setCatalogo([]);
      setErro(mensagemDoErro(e));
    }
  }, [alvo]);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  useEffect(() => {
    if (eu.papel !== 'DONO') return;
    const ctrl = new AbortController();
    publicoApi.barbeiros(ctrl.signal).then(setBarbeiros).catch(() => {});
    // A frase é do dono, então só ele busca. Vive fora do `carregar` porque não
    // depende do barbeiro selecionado: é da casa, não da pessoa.
    barbeariaApi.ver(ctrl.signal).then((b) => setFrase(b.horarioResumo)).catch(() => {});
    return () => ctrl.abort();
  }, [eu.papel]);

  async function agir(acao: () => Promise<unknown>) {
    setErro('');
    try {
      await acao();
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return (
    <>
      {barbeiros.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {barbeiros.map((b) => (
            <Box key={b.id} variante={b.id === barbeiroId ? 'fill' : 'normal'}
                 className="cursor-pointer" onClick={() => setBarbeiroId(b.id)}>
              {b.id === eu.id ? `${b.nome} (você)` : b.nome}
            </Box>
          ))}
        </div>
      )}

      <Lbl>o que {alvo ? 'ele faz' : 'eu faço'}</Lbl>
      {catalogo === null && <Sub>carregando…</Sub>}
      {vinculos.map((v) => (
        <Box key={v.servicoId} variante={v.faz ? 'normal' : 'mut'}>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span>{v.faz ? '✓ ' : ''}{v.nome}</span>
            <div className="flex gap-2 items-center">
              {v.faz && (
                <>
                  <input type="number" min={v.duracaoMinimaMin} step={5}
                         className="w-16 bg-transparent outline-none text-right"
                         defaultValue={v.duracaoMin}
                         onBlur={(e) => {
                           const min = Number(e.target.value);
                           if (!Number.isFinite(min) || min === v.duracaoMin) return;
                           void agir(() => servicosApi.vincular({
                             barbeiroId: alvo, servicoId: v.servicoId, faz: true, duracaoMin: min,
                           }));
                         }} />
                  <Sub>min</Sub>
                  {/* Preço é decisão do PRÓPRIO barbeiro (ou do dono editando
                      pelo seletor acima), sem sugestão nenhuma do catálogo —
                      diferente da duração. Reais na tela, centavos no banco:
                      quem digita não pensa em centavos. */}
                  <Sub>R$</Sub>
                  <input type="number" min={0} step={0.01} inputMode="decimal"
                         placeholder="—"
                         className="w-16 bg-transparent outline-none text-right"
                         defaultValue={v.precoCentavos !== null ? (v.precoCentavos / 100).toFixed(2) : ''}
                         onBlur={(e) => {
                           if (e.target.value.trim() === '') return;
                           const reais = Number(e.target.value);
                           if (!Number.isFinite(reais) || reais <= 0) return;
                           const centavos = Math.round(reais * 100);
                           if (centavos === v.precoCentavos) return;
                           void agir(() => servicosApi.vincular({
                             barbeiroId: alvo, servicoId: v.servicoId, faz: true,
                             precoCentavos: centavos,
                           }));
                         }} />
                </>
              )}
              <Chip onClick={() => agir(() => servicosApi.vincular({
                barbeiroId: alvo, servicoId: v.servicoId, faz: !v.faz,
              }))}>
                {v.faz ? 'não faço' : 'faço'}
              </Chip>
            </div>
          </div>
        </Box>
      ))}

      {eu.papel === 'DONO' && (
        <>
          <Sep />
          <Lbl>catálogo da barbearia</Lbl>
          {catalogo?.map((s) => (
            <Box key={s.id} variante={s.ativo ? 'normal' : 'mut'}>
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <span>{s.nome}</span>
                <Lbl>mín {s.duracaoMinimaMin} · sugerida {s.duracaoSugeridaMin}</Lbl>
                <Chip acento={s.ativo}
                      onClick={() => agir(() => servicosApi.editar(s.id, { ativo: !s.ativo }))}>
                  {s.ativo ? 'desativar' : 'reativar'}
                </Chip>
              </div>
              {/* Zero é o aviso de que o serviço existe e ninguém oferece. */}
              {s.ativo && s.barbeiros === 0 && (
                <Sub className="text-acento">ninguém faz — não aparece para o cliente</Sub>
              )}
            </Box>
          ))}

          <NovoServico aoCriar={(d) => agir(() => servicosApi.criar(d))} />

          <Sep />
          {frase !== undefined && (
            <FraseDoHorario atual={frase} aoSalvar={(f) => agir(async () => {
              await servicosApi.frase(f);
              setFrase(f);
            })} />
          )}
        </>
      )}

      {erro && <Sub className="text-acento">{erro}</Sub>}
    </>
  );
}

function NovoServico({ aoCriar }: {
  aoCriar: (d: { nome: string; duracaoMinimaMin: number; duracaoSugeridaMin: number }) => void;
}) {
  const [nome, setNome] = useState('');
  const [minima, setMinima] = useState(20);
  const [sugerida, setSugerida] = useState(30);

  return (
    <>
      <Lbl>novo serviço</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="nome"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Box>
      <Box>
        <div className="flex gap-3 items-center">
          <Sub>mínima</Sub>
          <input type="number" step={5} className="w-16 bg-transparent outline-none"
                 value={minima} onChange={(e) => setMinima(Number(e.target.value))} />
          <Sub>sugerida</Sub>
          <input type="number" step={5} className="w-16 bg-transparent outline-none"
                 value={sugerida} onChange={(e) => setSugerida(Number(e.target.value))} />
        </div>
      </Box>
      <Box variante={nome.trim().length >= 2 ? 'fill' : 'mut'}
           className={nome.trim().length >= 2 ? 'cursor-pointer' : ''}
           onClick={() => {
             if (nome.trim().length < 2) return;
             aoCriar({ nome, duracaoMinimaMin: minima, duracaoSugeridaMin: sugerida });
             setNome('');
           }}>
        + criar serviço
      </Box>
    </>
  );
}

function FraseDoHorario({ atual, aoSalvar }: {
  atual: string | null;
  aoSalvar: (frase: string) => void;
}) {
  const [frase, setFrase] = useState('');

  // O campo nasce com o que está valendo. Sem isto ele abria sempre vazio e o
  // dono escrevia por cima às cegas, sem saber o que a home estava mostrando.
  // `atual` chega depois da busca, então a chave remonta o estado quando ele
  // troca de null para a frase — em vez de um efeito que sobrescreveria o que
  // o dono já começou a digitar.
  return (
    <div key={atual ?? ''} className="flex flex-col gap-2.5 md:gap-3.5">
      <Lbl>frase de horário da home</Lbl>
      <Sub>
        Escrita à mão de propósito: juntar as agendas da equipe produz frase
        ruim.
      </Sub>
      {/* Nulo é um estado de verdade: a barbearia nasce sem horário porque o
          admin da plataforma não sabe qual é. Enquanto ninguém escrever, a home
          não mostra horário nenhum — e o dono precisa saber disso. */}
      {atual === null && (
        <Sub className="text-acento">
          a home não está mostrando horário nenhum
        </Sub>
      )}
      <Box variante={frase || atual ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent"
               placeholder="seg a sáb, 9h–20h"
               defaultValue={atual ?? ''}
               onChange={(e) => setFrase(e.target.value)} />
      </Box>
      {(() => {
        const valor = (frase || atual || '').trim();
        const vale = valor.length >= 3 && valor !== (atual ?? '');
        return (
          <Box variante={vale ? 'fill' : 'mut'}
               className={vale ? 'cursor-pointer' : ''}
               onClick={() => vale && aoSalvar(valor)}>
            salvar a frase
          </Box>
        );
      })()}
    </div>
  );
}
