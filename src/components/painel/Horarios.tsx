'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub, Sep } from '@/components/wf';
import {
  horariosApi, painelApi, publicoApi, mensagemDoErro, ErroApi,
  type DiaDeTrabalho, type Bloqueio, type Conflito, type Eu, type Barbeiro,
} from '@/lib/api';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const paraMinutos = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/// O banco guarda `ALMOCO` sem cedilha, porque enum de banco não leva acento.
/// A tela vinha escrevendo `motivo.toLowerCase()` direto, então o cliente do
/// balcão lia "almoco" — o valor cru vazando para fora.
const MOTIVOS: Record<Bloqueio['motivo'], string> = {
  ALMOCO: 'almoço',
  FOLGA: 'folga',
  PESSOAL: 'pessoal',
  OUTRO: 'outro',
};

/// "seg a sáb" quando os dias são seguidos, "seg, qua, sex" quando não são.
/// Enumerar sempre daria "seg, ter, qua, qui, sex, sáb" — mais longo que a
/// linha inteira que ele descreve.
const diasEmTexto = (dias: number[]) => {
  // `Set` antes de ordenar: enquanto nada impedia gravar o mesmo almoço duas
  // vezes na terça, a linha saía "seg, ter, ter, qua, qua, qua". A criação já
  // recusa isso agora, mas os duplicados de antes continuam no banco — e uma
  // lista de dias com repetição é sempre um erro de leitura, nunca um dado.
  const d = [...new Set(dias)].sort((a, b) => a - b);
  if (d.length === 1) return DIAS[d[0]];
  const seguidos = d.every((n, i) => i === 0 || n === d[i - 1] + 1);
  return seguidos ? `${CURTOS[d[0]]} a ${CURTOS[d[d.length - 1]]}` : d.map((n) => CURTOS[n]).join(', ');
};

/// Uma pausa que se repete toda semana é UMA regra na cabeça de quem a criou
/// ("almoço, meio-dia"), mas o banco guarda uma linha por dia da semana. A
/// tela mostrava as seis, cada uma no seu cartão, com seu próprio "apagar":
/// meia tela de rolagem para dizer uma coisa só. Aqui elas voltam a ser a
/// regra que são — mesma pausa, mesmo horário, os dias juntos.
type Grupo = { chave: string; ids: string[]; motivo: Bloqueio['motivo']; dias: number[];
               inicio: number; fim: number };

const agrupar = (bs: Bloqueio[]) => {
  const semanais = new Map<string, Grupo>();
  const avulsos: Bloqueio[] = [];
  for (const b of bs) {
    if (!b.repeteSemanalmente) { avulsos.push(b); continue; }
    const chave = `${b.motivo}|${b.minutosInicio}|${b.minutosFim}`;
    const g = semanais.get(chave) ?? {
      chave, ids: [], motivo: b.motivo, dias: [],
      inicio: b.minutosInicio!, fim: b.minutosFim!,
    };
    g.ids.push(b.id);
    g.dias.push(b.diaSemana!);
    semanais.set(chave, g);
  }
  return { semanais: [...semanais.values()], avulsos };
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

      {/* "Expediente" e' palavra de escritorio. E a tela nunca disse o que
          esta parte faz: sao os horarios que se repetem TODA semana, contra a
          secao de baixo, que sao os buracos dentro deles. */}
      <Lbl>{alvo ? 'dias de trabalho dele' : 'seus dias de trabalho'}</Lbl>
      <Sub>
        As horas que você atende, toda semana. É dentro delas que o cliente
        consegue marcar.
      </Sub>
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
              : <Chip onClick={() => agir(() =>
                  horariosApi.fecharDia(d.diaSemana, alvo))}>fechar</Chip>}
          </div>
        </Box>
      ))}

      <Sep />
      <Lbl>folgas e pausas</Lbl>
      <Sub>
        Os buracos dentro dos seus dias de trabalho — almoço, médico, o que
        for. O cliente não consegue marcar nesses horários.
      </Sub>
      {bloqueios.length === 0 && <Sub>nenhuma por enquanto</Sub>}
      {agrupar(bloqueios).semanais.map((g) => (
        <Box key={g.chave}>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span>
              <span className="font-dado tracking-tight">{hhmm(g.inicio)}–{hhmm(g.fim)}</span>
              {' · '}{MOTIVOS[g.motivo]}
            </span>
            {/* Cinza, e não `acento`: eram seis botões âmbar numa tela só, e o
                âmbar deste produto é o que CONCLUI. Apagar não conclui nada. */}
            <Chip onClick={() => {
              // O toque apaga a regra inteira, então ele precisa dizer quantos
              // dias leva junto — a linha diz "seg a sáb", mas o banco tem seis.
              if (g.ids.length > 1 &&
                  !confirm(`Apagar ${MOTIVOS[g.motivo]} de ${diasEmTexto(g.dias)}? São ${g.ids.length} dias.`)) return;
              void agir(async () => {
                for (const id of g.ids) await horariosApi.apagarBloqueio(id);
              });
            }}>
              apagar
            </Chip>
          </div>
          <Sub>toda semana · {diasEmTexto(g.dias)}</Sub>
        </Box>
      ))}
      {agrupar(bloqueios).avulsos.map((b) => (
        <Box key={b.id}>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <span>
              <span className="font-dado tracking-tight">{quando(b.inicio!)} → {quando(b.fim!)}</span>
              {' · '}{MOTIVOS[b.motivo]}
            </span>
            <Chip onClick={() => agir(() => horariosApi.apagarBloqueio(b.id))}>apagar</Chip>
          </div>
        </Box>
      ))}

      <NovoBloqueio aoCriar={(dados) => agir(async () => {
        // Bloquear por cima de horário vendido: o back recusa com 409 e diz
        // QUEM cairia, em vez de cancelar por conta própria. Cancelamento não
        // volta e o WhatsApp sai na hora — errar o horário aqui custaria a
        // tarde de gente que está contando com o corte.
        try {
          await horariosApi.criarBloqueio({ ...dados, barbeiroId: alvo });
        } catch (e) {
          const corpo = e instanceof ErroApi && e.status === 409
            ? (e.corpo as { conflitos?: { clienteNome: string; inicio: string; servicoNome: string }[] })
            : null;
          if (!corpo?.conflitos?.length) throw e;

          const lista = corpo.conflitos
            .map((c) => `• ${c.clienteNome} — ${quando(c.inicio)} (${c.servicoNome})`)
            .join('\n');
          const quantos = corpo.conflitos.length;
          const ok = confirm(
            `${quantos === 1 ? 'Tem 1 cliente marcado' : `Tem ${quantos} clientes marcados`} `
            + `nesse horário:\n\n${lista}\n\n`
            + `Cancelar ${quantos === 1 ? 'esse horário' : 'esses horários'} e avisar `
            + `${quantos === 1 ? 'o cliente' : 'os clientes'} no WhatsApp?`,
          );
          if (!ok) return;
          await horariosApi.criarBloqueio({ ...dados, barbeiroId: alvo, cancelarConflitos: true });
        }
      })} />

      {conflitos.length > 0 && (
        <>
          <Sep />
          {/* "horario(s) marcado(s)" e' plural de maquina, e "fora do
              expediente" repetia a palavra que saiu la de cima. */}
          <Lbl className="text-acento">
            {conflitos.length === 1
              ? 'um cliente ficou de fora'
              : `${conflitos.length} clientes ficaram de fora`}
          </Lbl>
          <Sub>
            A mudança de horário valeu, mas {conflitos.length === 1 ? 'este' : 'estes'}
            {' '}já {conflitos.length === 1 ? 'estava' : 'estavam'} marcado
            {conflitos.length === 1 ? '' : 's'} num horário que agora está fechado.
            Se cancelar, o cliente é avisado no WhatsApp.
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
            {MOTIVOS[m]}
          </Box>
        ))}
      </div>

      {/* Eram tres controles soltos numa linha — "segunda 12:00 – 13:00" — sem
          uma palavra dizendo o que cada um era. As palavras entram no meio. */}
      <Box>
        <div className="flex flex-wrap gap-2 items-center">
          <Sub>{semanal ? 'toda' : 'no dia'}</Sub>
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
          <Sub>das</Sub>
          <input type="time" className="bg-transparent outline-none font-dado"
                 value={de} onChange={(e) => setDe(e.target.value)} />
          <Sub>às</Sub>
          <input type="time" className="bg-transparent outline-none font-dado"
                 value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
      </Box>

      {/* "bloquear" e' o nome que o banco da' pra isto; quem usa a tela esta
          guardando uma folga. E o botao nomeia O QUE se cria, nao quando: o
          "quando" ja' esta escrito por extenso na linha logo acima, e repetir
          "toda semana" no botao so' ecoava o botao de cima. */}
      <Box variante="fill" className="cursor-pointer" onClick={criar}>
        + guardar {MOTIVOS[motivo]}
      </Box>
    </>
  );
}
