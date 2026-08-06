'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Row, Lbl } from '@/components/wf';

const CABECALHO = ['s', 't', 'q', 'q', 's', 's', 'd']; // semana começa na segunda

export function MiniCalendario({ barbeiroId, servicoId }: { barbeiroId: string; servicoId: string }) {
  const hoje = new Date();
  const [mes, setMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [comVaga, setComVaga] = useState<number[]>([]);
  const [dia, setDia] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ hora: string; inicio: string; barbeiroNome: string }[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dias-com-vaga?barbeiroId=${barbeiroId}&servicoId=${servicoId}&mes=${mes}`)
      .then(r => r.json()).then(d => setComVaga(d.dias));
    setDia(null); setSlots([]); setEscolhido(null);
  }, [mes, barbeiroId, servicoId]);

  useEffect(() => {
    if (!dia) return;
    fetch(`/api/horarios?barbeiroId=${barbeiroId}&servicoId=${servicoId}&de=${dia}&dias=1`)
      .then(r => r.json()).then(d => setSlots(d.dias[0]?.slots ?? []));
  }, [dia, barbeiroId, servicoId]);

  const [ano, m] = mes.split('-').map(Number);
  const totalDias = new Date(ano, m, 0).getDate();
  // getDay(): 0=domingo. A grade começa na segunda, então domingo vira 6.
  const deslocamento = (new Date(ano, m - 1, 1).getDay() + 6) % 7;

  const irPara = (delta: number) => {
    const d = new Date(ano, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <>
      <Row className="items-center">
        <button onClick={() => irPara(-1)} className="text-[11px] text-lbl">‹</button>
        <div className="flex-1 text-center text-sm">{mes}</div>
        <button onClick={() => irPara(1)} className="text-[11px] text-lbl">›</button>
      </Row>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {CABECALHO.map((d, i) => <div key={i} className="text-[10px] text-lbl">{d}</div>)}
        {Array.from({ length: deslocamento }).map((_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map(d => {
          const data = `${mes}-${String(d).padStart(2, '0')}`;
          const tem = comVaga.includes(d);
          return (
            <button key={d} disabled={!tem} onClick={() => setDia(data)}
              className={`text-xs rounded-full ${
                !tem ? 'text-[#ccc]'
                     : dia === data ? 'border-[2px] border-traco' : 'border-[1.5px] border-traco'}`}>
              {d}
            </button>
          );
        })}
      </div>
      <Lbl>círculo = tem vaga · apagado = lotado ou fechado</Lbl>

      {dia && (
        <>
          <Lbl className="text-[#444]">{dia}</Lbl>
          <Row wrap>
            {slots.map(s => (
              <Chip key={s.inicio} ativo={escolhido === s.inicio} onClick={() => setEscolhido(s.inicio)}>
                {s.hora}
              </Chip>
            ))}
          </Row>
          {escolhido && (
            <a href={`/?barbeiroId=${barbeiroId}&servicoId=${servicoId}&inicio=${encodeURIComponent(escolhido)}`}>
              <Box variante="fill">
                usar {slots.find(s => s.inicio === escolhido)?.hora}
              </Box>
            </a>
          )}
        </>
      )}
    </>
  );
}
