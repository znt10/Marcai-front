'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Cartao, Pilula, BotaoCheio, BotaoVazado, Interruptor, Titulo, Texto,
  Etiqueta, Fio,
} from '@/components/painel/pecas';
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

/// O banco guarda `ALMOCO` sem cedilha, porque enum de banco não leva acento.
/// A tela vinha escrevendo `motivo.toLowerCase()` direto, então o cliente do
/// balcão lia "almoco" — o valor cru vazando para fora.
const MOTIVOS: Record<Bloqueio['motivo'], string> = {
  ALMOCO: 'almoço',
  FOLGA: 'folga',
  PESSOAL: 'pessoal',
  OUTRO: 'outro',
};

/// A data e a hora de uma folga avulsa, como o balcão fala: "25/12, 14:30".
const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

const soData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const soHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/// Uma folga que cobre a data inteira. Ela é guardada como 00:00→23:59, e sem
/// isto a linha diria "25/12, 00:00 → 23:59" — a máquina lendo em voz alta o
/// que a pessoa escreveu como "dia todo".
const diaTodo = (b: Bloqueio) => {
  if (!b.inicio || !b.fim) return false;
  const i = new Date(b.inicio);
  const f = new Date(b.fim);
  return i.getHours() === 0 && i.getMinutes() === 0
    && f.getHours() === 23 && f.getMinutes() >= 59;
};

export function Horarios({ eu }: { eu: Eu }) {
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [barbeiroId, setBarbeiroId] = useState(eu.id);
  const [expediente, setExpediente] = useState<DiaDeTrabalho[] | null>(null);
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [erro, setErro] = useState('');
  /// Qual dia da semana está com o editor de pausa aberto — um por vez, e
  /// `null` quando nenhum está. Aberto dentro da linha, e não numa janela: a
  /// pausa é do dia que se está olhando.
  const [pausaEm, setPausaEm] = useState<number | null>(null);
  const [novaAvulsa, setNovaAvulsa] = useState(false);

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

  const avulsas = bloqueios.filter((b) => !b.repeteSemanalmente);
  const pausasDo = (diaSemana: number) => bloqueios.filter(
    (b) => b.repeteSemanalmente && b.diaSemana === diaSemana,
  );

  /// Guardar uma folga ou pausa — com a conversa do 409 no meio.
  ///
  /// Bloquear por cima de horário vendido: o back recusa e diz QUEM cairia, em
  /// vez de cancelar por conta própria. Cancelamento não volta e o WhatsApp
  /// sai na hora — errar o horário aqui custaria a tarde de gente que está
  /// contando com o corte.
  function criarBloqueio(dados: {
    motivo: Bloqueio['motivo']; repeteSemanalmente: boolean;
    diaSemana?: number; minutosInicio?: number; minutosFim?: number;
    inicio?: string; fim?: string;
  }) {
    void agir(async () => {
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
    });
  }

  return (
    <>
      {barbeiros.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {barbeiros.map((b) => (
            <Pilula key={b.id} ativo={b.id === barbeiroId} onClick={() => setBarbeiroId(b.id)}>
              {b.id === eu.id ? `${b.nome} (você)` : b.nome}
            </Pilula>
          ))}
        </div>
      )}

      {expediente === null && <Texto>carregando…</Texto>}

      {/* Os sete dias num cartão só, e a PAUSA DENTRO DO DIA a que ela
          pertence.

          Ela morava num formulário à parte, no fim da tela, que perguntava o
          dia de novo — e a pessoa respondia olhando para uma semana que estava
          longe, fora do alcance da vista. Aqui não há o que responder: quem
          abre a pausa na linha da segunda já disse "segunda" ao tocar ali.
          O formulário separado deixou de existir junto com a pergunta. */}
      {expediente && expediente.length > 0 && (
        <Cartao className="px-2.5 py-0.5">
          {expediente.map((d, n) => {
            const fechado = d.minutosInicio === null;
            const pausas = pausasDo(d.diaSemana);
            return (
              <div key={d.diaSemana}
                   className={`flex flex-col gap-2 py-3
                               ${n < expediente.length - 1 ? 'border-b border-borda-suave' : ''}`}>
                {/* Grade, e não `justify-between`: com três larguras livres, a
                    hora de cada dia parava num lugar diferente — e o relógio
                    que o navegador desenha dentro do `input[type=time]` muda
                    a largura dele de linha para linha. Nome, horas e
                    interruptor passam a ter colunas fixas, e as duas horas
                    dividem a do meio em partes iguais: a semana inteira
                    alinha, aberta ou fechada. */}
                <div className="grid grid-cols-[78px_1fr_42px] items-center gap-2 px-1
                                md:grid-cols-[92px_1fr_50px]">
                  <span className={`text-[14.5px] font-semibold md:text-[16px]
                                    ${fechado ? 'text-lbl' : 'text-tinta'}`}>
                    {DIAS[d.diaSemana]}
                  </span>

                  {fechado ? (
                    <span className="text-center font-dado text-[12.5px] text-lbl md:text-[14px]">
                      fechado
                    </span>
                  ) : (
                    <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 font-dado
                                     text-[12.5px] text-sub md:text-[14px]
                                     [&_input]:w-full [&_input]:bg-transparent
                                     [&_input]:text-center [&_input]:outline-none
                                     [&_input::-webkit-calendar-picker-indicator]:opacity-45">
                      <input type="time"
                             aria-label={`abre ${DIAS[d.diaSemana]}`}
                             defaultValue={hhmm(d.minutosInicio!)}
                             onBlur={(e) => {
                               const min = paraMinutos(e.target.value);
                               if (min === null || min === d.minutosInicio) return;
                               void agir(() => horariosApi.definirDia({
                                 barbeiroId: alvo, diaSemana: d.diaSemana,
                                 minutosInicio: min, minutosFim: d.minutosFim!,
                               }));
                             }} />
                      <span aria-hidden className="px-0.5">–</span>
                      <input type="time"
                             aria-label={`fecha ${DIAS[d.diaSemana]}`}
                             defaultValue={hhmm(d.minutosFim!)}
                             onBlur={(e) => {
                               const min = paraMinutos(e.target.value);
                               if (min === null || min === d.minutosFim) return;
                               void agir(() => horariosApi.definirDia({
                                 barbeiroId: alvo, diaSemana: d.diaSemana,
                                 minutosInicio: d.minutosInicio!, minutosFim: min,
                               }));
                             }} />
                    </span>
                  )}

                  {/* O interruptor no lugar do par "abrir/fechar": o estado passa
                      a estar no controle, e a linha deixa de precisar de um
                      botão que diz o contrário do que ela mostra. */}
                  <Interruptor ligado={!fechado} rotulo={`atender ${DIAS[d.diaSemana]}`}
                               onClick={() => agir(() => fechado
                                 ? horariosApi.definirDia({
                                     barbeiroId: alvo, diaSemana: d.diaSemana,
                                     minutosInicio: 9 * 60, minutosFim: 19 * 60,
                                   })
                                 : horariosApi.fecharDia(d.diaSemana, alvo))} />
                </div>

                {/* As pausas do dia ficam recuadas sob ele: a seta e o recuo
                    dizem "isto é parte do que está acima" sem precisar repetir
                    o nome do dia em cada linha. Num dia fechado elas não
                    aparecem — não há expediente para furar. */}
                {!fechado && (
                  <div className="flex flex-col gap-1.5 pl-4">
                    {pausas.map((b) => (
                      <div key={b.id} className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-medium text-sub md:text-[14px]">
                          <span aria-hidden className="text-lbl">↳ </span>
                          {MOTIVOS[b.motivo]}{' '}
                          <span className="font-dado">
                            {hhmm(b.minutosInicio!)}–{hhmm(b.minutosFim!)}
                          </span>
                        </span>
                        <button onClick={() => agir(() => horariosApi.apagarBloqueio(b.id))}
                                className="shrink-0 px-1 text-[12px] font-semibold text-lbl
                                           hover:text-acento">
                          apagar
                        </button>
                      </div>
                    ))}

                    {pausaEm === d.diaSemana ? (
                      <NovaPausa
                        aoCancelar={() => setPausaEm(null)}
                        aoGuardar={(dados) => {
                          setPausaEm(null);
                          criarBloqueio({
                            ...dados, repeteSemanalmente: true, diaSemana: d.diaSemana,
                          });
                        }} />
                    ) : (
                      <button onClick={() => setPausaEm(d.diaSemana)}
                              className="self-start text-[12.5px] font-semibold text-lbl
                                         hover:text-acento md:text-[14px]">
                        + pausa
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Cartao>
      )}

      <Fio className="my-1" />
      <Titulo className="text-[14px] md:text-[17px]">Folga num dia certo</Titulo>
      <Texto>
        Um dia só, com data — feriado, viagem, médico. O que se repete toda
        semana é a pausa ali em cima, dentro do dia dela.
      </Texto>

      {avulsas.map((b) => (
        <Cartao key={b.id} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13.5px] font-bold text-tinta md:text-[15px]">
              {diaTodo(b) ? `${soData(b.inicio!)} · dia todo` : `${quando(b.inicio!)} → ${soHora(b.fim!)}`}
            </span>
            <span className="text-[11.5px] font-medium text-lbl md:text-[13px]">
              {MOTIVOS[b.motivo]}
            </span>
          </span>
          <BotaoVazado className="text-sub"
                       onClick={() => agir(() => horariosApi.apagarBloqueio(b.id))}>
            apagar
          </BotaoVazado>
        </Cartao>
      ))}

      {novaAvulsa ? (
        <NovaFolgaAvulsa
          aoCancelar={() => setNovaAvulsa(false)}
          aoGuardar={(dados) => { setNovaAvulsa(false); criarBloqueio(dados); }} />
      ) : (
        <BotaoVazado className="self-start" onClick={() => setNovaAvulsa(true)}>
          + folga num dia
        </BotaoVazado>
      )}

      {conflitos.length > 0 && (
        <>
          <Fio className="my-1" />
          {/* "horario(s) marcado(s)" e' plural de maquina, e "fora do
              expediente" repetia a palavra que saiu la de cima. */}
          <Titulo className="text-acento">
            {conflitos.length === 1
              ? 'um cliente ficou de fora'
              : `${conflitos.length} clientes ficaram de fora`}
          </Titulo>
          <Texto>
            A mudança de horário valeu, mas {conflitos.length === 1 ? 'este' : 'estes'}
            {' '}já {conflitos.length === 1 ? 'estava' : 'estavam'} marcado
            {conflitos.length === 1 ? '' : 's'} num horário que agora está fechado.
            Se cancelar, o cliente é avisado no WhatsApp.
          </Texto>
          {conflitos.map((c) => (
            <Cartao key={c.id} variante="sel"
                    className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13.5px] font-bold text-tinta md:text-[15px]">
                  <span className="font-dado">{quando(c.inicio)}</span> · {c.clienteNome}
                </span>
                <span className="text-[11.5px] font-medium text-lbl md:text-[13px]">
                  {c.servicoNome}
                </span>
              </span>
              <BotaoVazado className="border-acento text-acento"
                           onClick={() => agir(() => painelApi.cancelar(c.id))}>
                cancelar
              </BotaoVazado>
            </Cartao>
          ))}
        </>
      )}

      {erro && <Texto className="text-acento">{erro}</Texto>}
    </>
  );
}

/// A pausa de um dia, editada na linha dele.
///
/// Três campos e dois botões, e nenhum deles pergunta o dia: quem abriu isto
/// já disse qual é ao tocar no "+ pausa" da segunda. Era essa a pergunta que
/// o formulário separado fazia duas vezes — uma na fileira de botões, outra
/// na cabeça de quem tinha de olhar a semana lá em cima para responder.
function NovaPausa({ aoGuardar, aoCancelar }: {
  aoGuardar: (d: { motivo: Bloqueio['motivo']; minutosInicio: number; minutosFim: number }) => void;
  aoCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState<Bloqueio['motivo']>('ALMOCO');
  const [de, setDe] = useState('12:00');
  const [ate, setAte] = useState('13:00');

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] bg-superficie2 p-2.5">
      <label className="flex flex-col gap-1">
        <Etiqueta>o que é</Etiqueta>
        <select value={motivo} className="rounded-[8px] border border-borda bg-transparent
                                          px-2 py-1.5 text-[12.5px] font-semibold text-tinta
                                          outline-none focus:border-acento"
                onChange={(e) => setMotivo(e.target.value as Bloqueio['motivo'])}>
          {(['ALMOCO', 'FOLGA', 'PESSOAL', 'OUTRO'] as const).map((m) => (
            <option key={m} value={m}>{MOTIVOS[m]}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <Etiqueta>das</Etiqueta>
        <input type="time" value={de} onChange={(e) => setDe(e.target.value)}
               className="rounded-[8px] border border-borda bg-transparent px-2 py-1.5
                          font-dado text-[12.5px] text-tinta outline-none focus:border-acento" />
      </label>

      <label className="flex flex-col gap-1">
        <Etiqueta>às</Etiqueta>
        <input type="time" value={ate} onChange={(e) => setAte(e.target.value)}
               className="rounded-[8px] border border-borda bg-transparent px-2 py-1.5
                          font-dado text-[12.5px] text-tinta outline-none focus:border-acento" />
      </label>

      <div className="flex items-center gap-2">
        <BotaoVazado className="border-acento text-acento"
                     onClick={() => {
                       const i = paraMinutos(de);
                       const f = paraMinutos(ate);
                       if (i === null || f === null) return;
                       aoGuardar({ motivo, minutosInicio: i, minutosFim: f });
                     }}>
          guardar
        </BotaoVazado>
        <button onClick={aoCancelar}
                className="px-1 text-[12px] font-semibold text-lbl hover:text-acento">
          cancelar
        </button>
      </div>
    </div>
  );
}

/// A folga de uma data — feriado, viagem, médico. Fora da semana de propósito:
/// ela não se repete, e pendurá-la numa linha de dia da semana daria a
/// entender que sim.
function NovaFolgaAvulsa({ aoGuardar, aoCancelar }: {
  aoGuardar: (d: { motivo: Bloqueio['motivo']; repeteSemanalmente: false;
                   inicio: string; fim: string }) => void;
  aoCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState<Bloqueio['motivo']>('FOLGA');
  const [dia, setDia] = useState(new Date().toLocaleDateString('sv-SE'));
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [de, setDe] = useState('12:00');
  const [ate, setAte] = useState('13:00');

  return (
    <Cartao className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <Etiqueta>o que é</Etiqueta>
          <select value={motivo} className="rounded-[8px] border border-borda bg-transparent
                                            px-2 py-1.5 text-[12.5px] font-semibold text-tinta
                                            outline-none focus:border-acento"
                  onChange={(e) => setMotivo(e.target.value as Bloqueio['motivo'])}>
            {(['FOLGA', 'PESSOAL', 'ALMOCO', 'OUTRO'] as const).map((m) => (
              <option key={m} value={m}>{MOTIVOS[m]}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <Etiqueta>no dia</Etiqueta>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
                 className="rounded-[8px] border border-borda bg-transparent px-2 py-1.5
                            font-dado text-[12.5px] text-tinta outline-none focus:border-acento" />
        </label>
      </div>

      {/* "dia todo" é o caso comum de uma folga com data, e sem este par ele
          obrigaria a escrever 00:00 e 23:59 à mão. */}
      <div className="flex flex-wrap gap-2">
        <Pilula ativo={diaInteiro} onClick={() => setDiaInteiro(true)}>dia todo</Pilula>
        <Pilula ativo={!diaInteiro} onClick={() => setDiaInteiro(false)}>só um pedaço</Pilula>
      </div>

      {!diaInteiro && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <Etiqueta>das</Etiqueta>
            <input type="time" value={de} onChange={(e) => setDe(e.target.value)}
                   className="rounded-[8px] border border-borda bg-transparent px-2 py-1.5
                              font-dado text-[12.5px] text-tinta outline-none focus:border-acento" />
          </label>
          <label className="flex flex-col gap-1">
            <Etiqueta>às</Etiqueta>
            <input type="time" value={ate} onChange={(e) => setAte(e.target.value)}
                   className="rounded-[8px] border border-borda bg-transparent px-2 py-1.5
                              font-dado text-[12.5px] text-tinta outline-none focus:border-acento" />
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <BotaoCheio onClick={() => {
          const [i, f] = diaInteiro ? ['00:00', '23:59'] : [de, ate];
          aoGuardar({
            motivo, repeteSemanalmente: false,
            inicio: new Date(`${dia}T${i}:00`).toISOString(),
            fim: new Date(`${dia}T${f}:00`).toISOString(),
          });
        }}>
          + guardar {MOTIVOS[motivo]}
        </BotaoCheio>
        <button onClick={aoCancelar}
                className="text-[12.5px] font-semibold text-lbl hover:text-acento">
          cancelar
        </button>
      </div>
    </Cartao>
  );
}
