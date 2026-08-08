'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub, Sep } from '@/components/wf';
import {
  horariosApi, painelApi, publicoApi, mensagemDoErro,
  type DiaDeTrabalho, type Bloqueio, type Conflito, type Eu, type Barbeiro,
} from '@/lib/api';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const paraMinutos = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

export function Horarios({ eu }: { eu: Eu }) {
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [barbeiroId, setBarbeiroId] = useState(eu.id);
  const [expediente, setExpediente] = useState<DiaDeTrabalho[] | null>(null);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [erro, setErro] = useState('');

  const alvo = barbeiroId === eu.id ? undefined : barbeiroId;

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      const [dados, lista] = await Promise.all([
        horariosApi.ver(alvo, signal),
        horariosApi.conflitos(alvo, signal),
      ]);
      setExpediente(dados.expediente);
      setBloqueios(dados.bloqueios);
      setConflitos(lista);
      setErro('');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setExpediente([]);
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

      <Lbl>expediente</Lbl>
      {expediente === null && <Sub>carregando…</Sub>}
      {expediente?.map((d) => (
        <Box key={d.diaSemana} variante={d.minutosInicio === null ? 'mut' : 'normal'}>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span className="w-20">{DIAS[d.diaSemana]}</span>
            {d.minutosInicio === null ? <Sub>fechado</Sub> : (
              <div className="flex gap-1 items-center">
                <input type="time" className="bg-transparent outline-none"
                       defaultValue={hhmm(d.minutosInicio)}
                       onBlur={(e) => {
                         const min = paraMinutos(e.target.value);
                         if (min === null || min === d.minutosInicio) return;
                         void agir(() => horariosApi.definirDia({
                           barbeiroId: alvo, diaSemana: d.diaSemana,
                           minutosInicio: min, minutosFim: d.minutosFim!,
                         }));
                       }} />
                <span>–</span>
                <input type="time" className="bg-transparent outline-none"
                       defaultValue={hhmm(d.minutosFim!)}
                       onBlur={(e) => {
                         const min = paraMinutos(e.target.value);
                         if (min === null || min === d.minutosFim) return;
                         void agir(() => horariosApi.definirDia({
                           barbeiroId: alvo, diaSemana: d.diaSemana,
                           minutosInicio: d.minutosInicio!, minutosFim: min,
                         }));
                       }} />
              </div>
            )}
            {d.minutosInicio === null
              ? <Chip onClick={() => agir(() => horariosApi.definirDia({
                  barbeiroId: alvo, diaSemana: d.diaSemana,
                  minutosInicio: 9 * 60, minutosFim: 19 * 60,
                }))}>abrir</Chip>
              : <Chip acento onClick={() => agir(() =>
                  horariosApi.fecharDia(d.diaSemana, alvo))}>fechar</Chip>}
          </div>
        </Box>
      ))}

      <Sep />
      <Lbl>folgas e pausas</Lbl>
      {bloqueios.length === 0 && <Sub>nenhuma</Sub>}
      {bloqueios.map((b) => (
        <Box key={b.id}>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span>
              {b.motivo.toLowerCase()}
              {' · '}
              {b.repeteSemanalmente
                ? `${DIAS[b.diaSemana!]}, ${hhmm(b.minutosInicio!)}–${hhmm(b.minutosFim!)}`
                : `${quando(b.inicio!)} → ${quando(b.fim!)}`}
            </span>
            <Chip acento onClick={() => agir(() => horariosApi.apagarBloqueio(b.id))}>
              apagar
            </Chip>
          </div>
          {b.repeteSemanalmente && <Sub>toda semana</Sub>}
        </Box>
      ))}

      <NovoBloqueio aoCriar={(dados) => agir(() =>
        horariosApi.criarBloqueio({ ...dados, barbeiroId: alvo }))} />

      {conflitos.length > 0 && (
        <>
          <Sep />
          <Lbl className="text-acento">
            {conflitos.length} horário(s) marcado(s) fora do expediente
          </Lbl>
          <Sub>
            A mudança valeu; estes ficaram pendurados. Cancelar avisa o cliente.
          </Sub>
          {conflitos.map((c) => (
            <Box key={c.id} variante="alerta">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <span>{quando(c.inicio)} · {c.clienteNome}</span>
                <Chip acento onClick={() => agir(() => painelApi.cancelar(c.id))}>
                  cancelar
                </Chip>
              </div>
              <Sub>{c.servicoNome}</Sub>
            </Box>
          ))}
        </>
      )}

      {erro && <Sub className="text-acento">{erro}</Sub>}
    </>
  );
}

function NovoBloqueio({ aoCriar }: {
  aoCriar: (d: {
    motivo: Bloqueio['motivo']; repeteSemanalmente: boolean;
    diaSemana?: number; minutosInicio?: number; minutosFim?: number;
    inicio?: string; fim?: string;
  }) => void;
}) {
  const [semanal, setSemanal] = useState(true);
  const [motivo, setMotivo] = useState<Bloqueio['motivo']>('FOLGA');
  const [diaSemana, setDiaSemana] = useState(1);
  const [de, setDe] = useState('12:00');
  const [ate, setAte] = useState('13:00');
  const [dia, setDia] = useState(new Date().toLocaleDateString('sv-SE'));

  function criar() {
    const inicioMin = paraMinutos(de);
    const fimMin = paraMinutos(ate);
    if (inicioMin === null || fimMin === null) return;

    // Um formato OU o outro, nunca os dois: a rota recusa com 422, e o motor
    // leria só um deles.
    aoCriar(semanal
      ? { motivo, repeteSemanalmente: true, diaSemana, minutosInicio: inicioMin, minutosFim: fimMin }
      : {
          motivo, repeteSemanalmente: false,
          inicio: new Date(`${dia}T${de}:00`).toISOString(),
          fim: new Date(`${dia}T${ate}:00`).toISOString(),
        });
  }

  return (
    <>
      <Lbl>nova folga ou pausa</Lbl>
      <div className="flex flex-wrap gap-2">
        <Box variante={semanal ? 'fill' : 'normal'} className="cursor-pointer"
             onClick={() => setSemanal(true)}>toda semana</Box>
        <Box variante={semanal ? 'normal' : 'fill'} className="cursor-pointer"
             onClick={() => setSemanal(false)}>uma vez</Box>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['ALMOCO', 'FOLGA', 'PESSOAL', 'OUTRO'] as const).map((m) => (
          <Box key={m} variante={m === motivo ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setMotivo(m)}>
            {m.toLowerCase()}
          </Box>
        ))}
      </div>

      <Box>
        <div className="flex flex-wrap gap-2 items-center">
          {semanal
            ? (
              <select className="bg-transparent outline-none" value={diaSemana}
                      onChange={(e) => setDiaSemana(Number(e.target.value))}>
                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            )
            : (
              <input type="date" className="bg-transparent outline-none"
                     value={dia} onChange={(e) => setDia(e.target.value)} />
            )}
          <input type="time" className="bg-transparent outline-none"
                 value={de} onChange={(e) => setDe(e.target.value)} />
          <span>–</span>
          <input type="time" className="bg-transparent outline-none"
                 value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </Box>

      <Box variante="fill" className="cursor-pointer" onClick={criar}>+ bloquear</Box>
    </>
  );
}
