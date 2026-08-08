'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';
import {
  quadroApi, ignorarAborto, mensagemDoErro,
  type ColunaDoDia, type ItemDoQuadro,
} from '@/lib/api';

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

  const carregar = useCallback(async (d: string, signal?: AbortSignal) => {
    setColunas(null);
    try {
      setColunas(await quadroApi.ver(d, signal));
      setErro('');
    } catch (e) {
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

  return (
    <>
      {/* Estreito e centrado: num quadro de 1100px, `justify-between` jogava
          as setas para os cantos opostos da tela. */}
      <div className="flex items-center justify-between gap-3 w-full max-w-[260px]">
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, -1))}>←</Box>
        <Lbl className="font-dado">{dia === hoje() ? 'hoje' : dia}</Lbl>
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, 1))}>→</Box>
      </div>

      {colunas === null && <Sub>carregando…</Sub>}
      {erro && <Sub className="text-acento">{erro}</Sub>}

      {/* Rolagem horizontal em vez de quebra de linha: colunas empilhadas
          perdem justamente a comparação lado a lado que é a razão da tela. */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas?.map((c) => <Coluna key={c.barbeiroId} c={c} />)}
      </div>
    </>
  );
}

function Coluna({ c }: { c: ColunaDoDia }) {
  const fechado = c.abre === null || c.fecha === null;

  return (
    <div className="shrink-0 w-[230px] flex flex-col gap-2">
      <Box variante={fechado ? 'mut' : 'normal'}>
        <div className="flex items-baseline justify-between gap-2">
          <span>{c.barbeiroNome}</span>
          <Lbl>{c.papel === 'DONO' ? 'dono' : c.ativo ? '' : 'saiu'}</Lbl>
        </div>
        <Sep />
        {fechado ? (
          <Sub>fechado neste dia</Sub>
        ) : (
          <>
            <Sub>{emHoras(c.abre!)}–{emHoras(c.fecha!)} · {c.ocupacaoPct}% cheio</Sub>
            {/* O horário sozinho mentiria: ele sai do serviço mais curto que
                a pessoa faz, então vem sempre com o serviço que o justifica. */}
            {c.proximoLivre ? (
              <div className="mt-1.5">
                <Lbl>próximo livre</Lbl>
                <div className="text-base md:text-lg font-dado text-acento">
                  {hora(c.proximoLivre)}{' '}
                  <span className="font-corpo text-[12px] text-sub">({c.servicoMaisCurto})</span>
                </div>
              </div>
            ) : c.servicoMaisCurto === null ? (
              // Sem serviço marcado ele também não aparece para o cliente — é
              // o mesmo aviso da tela de equipe, repetido onde atrapalha.
              <Sub className="text-acento mt-1">sem serviço marcado</Sub>
            ) : (
              <Sub className="mt-1">sem buraco</Sub>
            )}
          </>
        )}
      </Box>

      {!fechado && c.itens.length === 0 && <Sub>dia inteiro livre.</Sub>}
      {c.itens.map((i) => <Item key={i.id} i={i} />)}
    </div>
  );
}

function Item({ i }: { i: ItemDoQuadro }) {
  if (i.tipo === 'BLOQUEIO') {
    return (
      <Box variante="mut">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-dado">{hora(i.inicio)}</span>
          <Sub>▨ {MOTIVO[i.motivo] ?? 'bloqueio'}</Sub>
        </div>
        {i.observacao && <Sub>{i.observacao}</Sub>}
      </Box>
    );
  }

  return (
    <Box>
      <div className="flex items-baseline justify-between gap-2">
        <span>{hora(i.inicio)}</span>
        <Sub>{i.servicoNome}</Sub>
      </div>
      <Sub>{i.clienteNome}</Sub>
      <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer">
        <Sub className="text-acento">whatsapp</Sub>
      </a>
    </Box>
  );
}
