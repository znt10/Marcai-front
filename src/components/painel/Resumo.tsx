'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  resumoApi, ignorarAborto, mensagemDoErro, type LinhaDoResumo, type Resumo as Dados,
} from '@/lib/api';
import { ATALHOS, atalhoDoPeriodo, periodoDoAtalho, type Periodo } from '@/lib/resumo';

/// `sv-SE` é o locale que formata como YYYY-MM-DD — o formato que a rota
/// espera — sem passar por UTC e cair no dia anterior. Mesmo truque do
/// QuadroDoDia, e pelo mesmo motivo.
const hoje = () => new Date().toLocaleDateString('sv-SE');

/// "01/09" — o intervalo é lido de relance, e YYYY-MM-DD por extenso duas
/// vezes seguidas vira um borrão de dígitos.
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function Resumo() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho('mes', hoje()));
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (p: Periodo, signal?: AbortSignal) => {
    setDados(null);
    try {
      setDados(await resumoApi.ver(p.de, p.ate, signal));
      setErro('');
    } catch (e) {
      ignorarAborto(e);
      setErro(mensagemDoErro(e));
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(periodo, ctrl.signal);
    return () => ctrl.abort();
  }, [periodo, carregar]);

  // Sem atualização periódica, ao contrário do quadro do dia: o resumo é
  // consultado de propósito, num momento de conta — não fica aberto no
  // balcão. Recarregar sozinho só trocaria o número embaixo do olho de quem
  // está somando.

  const aceso = atalhoDoPeriodo(periodo, hoje());
  // O teto da barra é o maior do período, e não um número fixo: a comparação
  // que interessa é entre os barbeiros deste período, não contra uma meta que
  // ninguém combinou.
  const teto = Math.max(1, ...(dados?.linhas.map((l) => l.cortes) ?? [0]));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {ATALHOS.map(({ chave, rotulo }) => (
          <Chip key={chave} ativo={aceso === chave}
                onClick={() => setPeriodo(periodoDoAtalho(chave, hoje()))}>
            {rotulo}
          </Chip>
        ))}
      </div>

      {/* Os campos de data ficam ABAIXO dos atalhos e sempre visíveis, não
          atrás de um "personalizar": escondê-los faria o dono acreditar que
          só existem três períodos. */}
      <div className="flex flex-wrap items-center gap-2">
        <Lbl>de</Lbl>
        <input type="date" value={periodo.de} max={periodo.ate}
               onChange={(e) => e.target.value && setPeriodo({ ...periodo, de: e.target.value })}
               className="bg-superficie border border-borda rounded-wf px-3 py-2
                          text-[13px] md:text-sm font-dado text-tinta" />
        <Lbl>até</Lbl>
        <input type="date" value={periodo.ate} min={periodo.de} max={hoje()}
               onChange={(e) => e.target.value && setPeriodo({ ...periodo, ate: e.target.value })}
               className="bg-superficie border border-borda rounded-wf px-3 py-2
                          text-[13px] md:text-sm font-dado text-tinta" />
      </div>

      {dados === null && !erro && <Sub>carregando…</Sub>}
      {erro && <Sub className="text-acento">{erro}</Sub>}

      {dados && (
        <>
          <Lbl className="font-dado">
            {curto(dados.de)} — {curto(dados.ate)}
          </Lbl>

          {dados.linhas.length === 0 && (
            <Box variante="dash">Nenhum barbeiro na equipe ainda.</Box>
          )}

          {dados.linhas.map((l) => <Linha key={l.barbeiroId} l={l} teto={teto} />)}

          {dados.linhas.length > 0 && (
            <Box variante="mut">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-letreiro uppercase tracking-[0.06em]">no período</span>
                <span className="font-dado">
                  {dados.totais.cortes} {dados.totais.cortes === 1 ? 'corte' : 'cortes'}
                </span>
              </div>
              {/* A frase é longa de propósito. `totais.clientes` conta gente
                  distinta na barbearia inteira, então a soma das linhas pode
                  passar dele — quem cortou com dois barbeiros é uma pessoa
                  só. Sem a explicação, o dono soma as colunas, não fecha, e
                  desconfia do número inteiro. */}
              <Sub className="mt-1">
                {dados.totais.clientes}{' '}
                {dados.totais.clientes === 1 ? 'pessoa diferente' : 'pessoas diferentes'} —
                quem cortou com mais de um barbeiro conta uma vez aqui e uma vez
                em cada linha.
              </Sub>
            </Box>
          )}
        </>
      )}
    </>
  );
}

function Linha({ l, teto }: { l: LinhaDoResumo; teto: number }) {
  return (
    <Box variante={l.cortes === 0 ? 'mut' : 'normal'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-letreiro uppercase tracking-[0.06em]">
          {l.barbeiroNome}
          {/* Só aparece para quem saiu da equipe. Sem a marca, uma linha com
              número alto parece gente que ainda está atendendo. */}
          {!l.ativo && <span className="ml-2 text-[10px] text-lbl">desligado</span>}
        </span>
        <span className="shrink-0 font-dado tabular-nums">
          <span className="text-base md:text-lg">{l.cortes}</span>
          <span className="text-lbl"> / {l.clientes}</span>
        </span>
      </div>

      {/* A barra é o que faz a comparação acontecer de relance; os números ao
          lado é que dão a resposta exata. `aria-hidden` porque ela não
          acrescenta nada a quem lê pelo leitor de tela — os dois números já
          estão escritos acima. */}
      <div aria-hidden className="mt-2 h-[3px] bg-mut">
        <div className="h-full bg-latao"
             style={{ width: `${Math.round((l.cortes / teto) * 100)}%` }} />
      </div>

      <Lbl className="mt-1.5">cortes / pessoas</Lbl>
    </Box>
  );
}
