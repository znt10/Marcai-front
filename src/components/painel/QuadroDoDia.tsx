'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Cartao, CartaoInterno, BotaoVazado, Etiqueta, Texto,
} from '@/components/painel/pecas';
import {
  quadroApi, ignorarAborto, mensagemDoErro,
  type ColunaDoDia, type ItemDoQuadro,
} from '@/lib/api';
import { useAtualizacaoPeriodica } from '@/lib/useAtualizacaoPeriodica';
import { PAINEL_ATUALIZACAO_MS } from '@/lib/config';

/// `sv-SE` porque é o locale que formata como YYYY-MM-DD — o formato que a
/// rota espera — sem passar por UTC e cair no dia anterior.
const hoje = () => new Date().toLocaleDateString('sv-SE');
const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/// Minuto do dia como o dono fala: `540` → `9h`, `570` → `9h30`.
const emHoras = (min: number) =>
  `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;

const MOTIVO: Record<string, string> = {
  ALMOCO: 'almoço', FOLGA: 'folga', PESSOAL: 'pessoal', OUTRO: 'bloqueio',
};

export function QuadroDoDia() {
  const [dia, setDia] = useState(hoje());
  const [colunas, setColunas] = useState<ColunaDoDia[] | null>(null);
  const [erro, setErro] = useState('');

  /// `silencioso`: a atualizacao automatica nao pode apagar o quadro. Sem
  /// isso, a cada 30s as colunas iriam a `null` (o "carregando") e voltariam
  /// — e uma falha de rede passageira trocaria um quadro bom por uma tela de
  /// erro. Numa falha silenciosa fica o que ja' esta' ali; o proximo toque
  /// tenta de novo.
  const carregar = useCallback(async (d: string, signal?: AbortSignal, silencioso = false) => {
    if (!silencioso) setColunas(null);
    try {
      setColunas(await quadroApi.ver(d, signal));
      setErro('');
    } catch (e) {
      if (silencioso) return;
      ignorarAborto(e);
      setColunas([]);
      setErro(mensagemDoErro(e));
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(dia, ctrl.signal);
    return () => ctrl.abort();
  }, [dia, carregar]);

  /// O quadro e' a tela que fica aberta em cima do balcao: e' onde atualizar
  /// sozinho vale mais.
  useAtualizacaoPeriodica(
    () => { void carregar(dia, undefined, true); },
    PAINEL_ATUALIZACAO_MS,
  );

  return (
    <>
      {/* As setas e a data, no par de quadrados de 36px do desenho. Estreito
          e à esquerda: num quadro de 1100px, `justify-between` jogava as
          setas para os cantos opostos da tela. */}
      <div className="flex w-[160px] items-center gap-2.5">
        <BotaoVazado className="size-9 rounded-[10px] px-0 text-[14px] text-sub"
                     aria-label="dia anterior" onClick={() => setDia(somar(dia, -1))}>
          ←
        </BotaoVazado>
        <span className="flex-1 text-center text-[13.5px] font-bold text-tinta">
          {dia === hoje() ? 'hoje' : dia}
        </span>
        <BotaoVazado className="size-9 rounded-[10px] px-0 text-[14px] text-sub"
                     aria-label="próximo dia" onClick={() => setDia(somar(dia, 1))}>
          →
        </BotaoVazado>
      </div>

      {colunas === null && <Texto>carregando…</Texto>}
      {erro && <Texto className="text-acento">{erro}</Texto>}

      {/* No celular os barbeiros ficam um embaixo do outro, como no desenho:
          é uma tela de rolagem vertical, que é o gesto que a mão já faz. Da
          largura de tablet para cima eles voltam a ficar lado a lado, com
          rolagem horizontal — a comparação lado a lado é a razão da tela, e
          ela só cabe quando há largura para ela.

          `snap` faz cada barbeiro encaixar inteiro em vez de parar no meio de
          uma palavra. */}
      <div className="flex flex-col gap-3 md:flex-row md:snap-x md:snap-mandatory
                      md:overflow-x-auto md:pb-2">
        {colunas?.map((c) => <Coluna key={c.barbeiroId} c={c} />)}
      </div>
    </>
  );
}

function Coluna({ c }: { c: ColunaDoDia }) {
  const fechado = c.abre === null || c.fecha === null;

  return (
    <div className="flex w-full flex-col gap-3 md:w-[260px] md:shrink-0 md:snap-start">
      <Cartao variante={fechado ? 'mut' : 'normal'} className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-bold text-tinta">{c.barbeiroNome}</span>
          <span className="shrink-0 font-dado text-[11px] text-lbl">
            {fechado ? 'fechado' : `${emHoras(c.abre!)}–${emHoras(c.fecha!)}`}
            {c.papel === 'DONO' ? ' · dono' : c.ativo ? '' : ' · saiu'}
          </span>
        </div>

        {!fechado && (
          <>
            {/* A barra de ocupação do desenho. Ela diz de relance o que o
                número sozinho pedia para imaginar: quanto do dia já foi.
                `ocupacaoPct` é nulo quando o dia não tem expediente — aí não
                há barra a desenhar, só a linha de fechado logo abaixo. */}
            {c.ocupacaoPct !== null && (
              <>
                <div className="h-1.5 w-full overflow-hidden rounded-[4px] bg-superficie2">
                  <div className="h-full rounded-[4px] bg-acento"
                       style={{ width: `${Math.min(100, Math.max(0, c.ocupacaoPct))}%` }} />
                </div>
                <span className="text-[11.5px] font-medium text-sub">
                  {c.ocupacaoPct}% do dia ocupado
                </span>
              </>
            )}

            {/* O horário sozinho mentiria: ele sai do serviço mais curto que
                a pessoa faz, então vem sempre com o serviço que o justifica. */}
            {c.proximoLivre ? (
              <CartaoInterno className="flex items-center justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <Etiqueta>próximo livre</Etiqueta>
                  <span className="font-dado text-[22px] font-bold leading-none text-acento-forte">
                    {hora(c.proximoLivre)}
                  </span>
                </span>
                <span className="text-right text-[11px] font-medium text-sub">
                  {c.servicoMaisCurto}
                </span>
              </CartaoInterno>
            ) : c.servicoMaisCurto === null ? (
              // Sem serviço marcado ele também não aparece para o cliente — é
              // o mesmo aviso da tela de equipe, repetido onde atrapalha.
              <Texto className="text-acento">sem serviço marcado</Texto>
            ) : (
              <Texto>sem buraco no dia</Texto>
            )}
          </>
        )}

        {fechado && <Texto>fechado neste dia</Texto>}

        {/* O que vem pela frente fica DENTRO do cartão do barbeiro, depois de
            um fio — no desenho a coluna é um cartão só, não uma pilha de
            caixas soltas com o nome em cima. */}
        {!fechado && (
          <div className="flex flex-col gap-1.5 border-t border-borda-suave pt-2.5">
            {c.itens.length === 0
              ? <Texto>dia inteiro livre.</Texto>
              : c.itens.map((i) => <Item key={i.id} i={i} />)}
          </div>
        )}
      </Cartao>
    </div>
  );
}

/// Uma linha do que vem pela frente: hora, quem, e o toque para o WhatsApp.
/// Linha, e não cartão: são até uma dúzia por barbeiro, e um cartão cada
/// transformava a coluna numa escada de bordas.
function Item({ i }: { i: ItemDoQuadro }) {
  if (i.tipo === 'BLOQUEIO') {
    return (
      <p className="text-[12.5px] font-medium text-lbl">
        {hora(i.inicio)} · ▨ {MOTIVO[i.motivo] ?? 'bloqueio'}
        {i.observacao && ` · ${i.observacao}`}
      </p>
    );
  }

  return (
    <p className="text-[12.5px] font-medium text-sub">
      <span className="font-dado">{hora(i.inicio)}</span>
      {' · '}{i.clienteNome}{' · '}
      <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer"
         className="hover:text-acento">
        whatsapp
      </a>
      <span className="block text-[11.5px] text-lbl">{i.servicoNome}</span>
    </p>
  );
}
