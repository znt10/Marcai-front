'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  resumoApi, mensagemDoErro, type LinhaDoResumo, type Resumo as Dados,
} from '@/lib/api';
import { PizzaDeCortes } from '@/components/painel/PizzaDeCortes';
import {
  MODOS, andar, modoDoPeriodo, periodoDe, rotuloDe, type Periodo,
} from '@/lib/resumo';
import { diaDeHoje } from '@/lib/datas';

/// Delega a `diaDeHoje`: fuso só se converte em `datas.ts`, nunca aqui. Sem
/// isso, entre 21h e meia-noite local o contêiner (UTC) e o navegador
/// (America/Sao_Paulo) discordariam sobre que dia é hoje — e `Resumo`, Client
/// Component renderizado no servidor, hidrataria com um valor divergente do
/// `useState` inicial e do `max={hoje()}`.
const hoje = () => diaDeHoje(new Date());

/// "01/09" — o intervalo é lido de relance, e YYYY-MM-DD por extenso duas
/// vezes seguidas vira um borrão de dígitos.
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function Resumo() {
  // O período é o estado, e o modo é DERIVADO dele (`modoDoPeriodo`) em vez de
  // guardado ao lado. Guardar os dois abriria a possibilidade de discordarem —
  // um modo "semana" apontando para um intervalo que não é uma semana, depois
  // de o dono mexer nos campos de data. Derivando, isso não tem como acontecer:
  // mexeu na data e o intervalo deixou de ser de calendário, nenhum botão
  // acende, e é a verdade.
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('mes', hoje()));
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (p: Periodo, signal?: AbortSignal) => {
    setDados(null);
    setErro('');
    try {
      const resposta = await resumoApi.ver(p.de, p.ate, signal);
      setDados(resposta);
      // O back pode recusar o período pedido (mais de 366 dias) e devolver o
      // mês corrente no lugar. Sem sincronizar aqui, os `<input>` continuam
      // mostrando o que foi digitado enquanto o rótulo já mudou — dois
      // períodos diferentes na mesma tela. A comparação evita laço: só chama
      // `setPeriodo` quando a resposta realmente diverge do pedido, e a
      // segunda volta (já pedindo o período corrigido) não diverge mais.
      if (resposta.de !== p.de || resposta.ate !== p.ate) {
        setPeriodo({ de: resposta.de, ate: resposta.ate });
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
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

  const agora = hoje();
  const modo = modoDoPeriodo(periodo);
  // Trocar de modo ancora em HOJE quando hoje está dentro do período que se
  // olha, e no começo do período quando não está. É o que faz "estou em
  // agosto, quero ver por semana" cair numa semana de agosto em vez de pular
  // para esta semana, sem que "estou no mês corrente, quero ver o dia" caia no
  // dia 1º em vez de hoje.
  const ancora = periodo.de <= agora && agora <= periodo.ate ? agora : periodo.de;
  // Adiantar não é proibido, só inútil: mês que ainda não aconteceu vem zerado
  // (o serviço só conta `fim <= agora`). A seta desligada diz isso sem precisar
  // de uma tela vazia para explicar.
  const temFuturo = periodo.ate < agora;

  // O teto da barra é o maior do período, e não um número fixo: a comparação
  // que interessa é entre os barbeiros deste período, não contra uma meta que
  // ninguém combinou.
  const teto = Math.max(1, ...(dados?.linhas.map((l) => l.cortes) ?? [0]));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {MODOS.map(({ chave, rotulo }) => (
          <Chip key={chave} ativo={modo === chave}
                onClick={() => setPeriodo(periodoDe(chave, ancora))}>
            {rotulo}
          </Chip>
        ))}
      </div>

      {/* As setas andam um período INTEIRO — é o que separa "semana passada"
          de "sete dias atrás". Ficam desligadas num intervalo digitado à mão,
          porque ali não existe "o anterior". */}
      <div className="flex items-center gap-3 w-full max-w-[280px]">
        <Chip aria-label="Período anterior" disabled={!modo}
              onClick={() => modo && setPeriodo(periodoDe(modo, andar(modo, periodo.de, -1)))}>
          ‹
        </Chip>
        <span className="flex-1 text-center font-letreiro uppercase tracking-[0.06em]
                         text-sm md:text-base truncate">
          {modo ? rotuloDe(modo, periodo.de, agora) : 'período próprio'}
        </span>
        <Chip aria-label="Próximo período" disabled={!modo || !temFuturo}
              onClick={() => modo && setPeriodo(periodoDe(modo, andar(modo, periodo.de, 1)))}>
          ›
        </Chip>
      </div>

      {/* Os campos de data ficam ABAIXO e sempre visíveis, não atrás de um
          "personalizar": escondê-los faria o dono acreditar que só existem
          três períodos. Sem `max` no "até" — um mês de calendário vai até o
          dia 30 mesmo quando hoje é dia 5, e a conta continua certa porque o
          serviço só soma o que já terminou. */}
      <div className="flex flex-wrap items-center gap-2">
        <Lbl>de</Lbl>
        <input type="date" value={periodo.de} max={periodo.ate}
               onChange={(e) => e.target.value && setPeriodo({ ...periodo, de: e.target.value })}
               className="bg-superficie border border-borda rounded-wf px-3 py-2
                          text-[13px] md:text-sm font-dado text-tinta" />
        <Lbl>até</Lbl>
        <input type="date" value={periodo.ate} min={periodo.de}
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

          {/* Antes das linhas: a proporção é a leitura de relance, e os
              números embaixo são a resposta exata para quem quiser conferir.
              A pizza se apaga sozinha quando não há divisão a mostrar. */}
          <PizzaDeCortes linhas={dados.linhas} />

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
