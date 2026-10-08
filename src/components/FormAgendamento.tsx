'use client';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/wf';
import { formatar } from '@/lib/telefone';
import { formatarPreco } from '@/lib/dinheiro';
import {
  publicoApi, ignorarAborto, mensagemDoErro, ErroApi,
  type Barbeiro, type Servico, type Slot, type DiaComSlots as Dia,
} from '@/lib/api';
import { DIAS_NA_HOME } from '@/lib/config';
import { urlCalendario } from '@/lib/escolha';
import { lerRascunho, salvarRascunho, limparRascunho } from '@/lib/rascunho';
import {
  TEXTO_DO_PASSO, dadosCompletos, guiaJaVisto, marcarGuiaVisto, mostraDicaDoCalendario,
  proximoPasso, type Passo,
} from '@/lib/guia';
import { Balao, DicaDoCalendario } from '@/components/GuiaDoAgendar';

/// 'YYYY-MM-DD' de um instante ISO, no fuso do navegador. Não usa
/// `@/lib/datas` de propósito: aquele módulo é o ponto único de conversão do
/// SERVIDOR, e arrastá-lo para o bundle do cliente traria date-fns-tz junto.
const diaLocalDe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/// O que o calendário devolve na volta (`/?barbeiroId=…&servicoId=…&inicio=…`).
type Inicial = { barbeiroId?: string; servicoId?: string; inicio?: string };

export function FormAgendamento({ inicial = {} }: { inicial?: Inicial }) {
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [dias, setDias] = useState<Dia[]>([]);

  // Sem barbeiro escolhido a tela não tem o que mostrar adiante: a duração —
  // e portanto a grade inteira — é por barbeiro E serviço.
  const [barbeiroId, setBarbeiroId] = useState<string>(inicial.barbeiroId ?? '');
  const [servicoId, setServicoId] = useState<string>(inicial.servicoId ?? '');
  const [slot, setSlot] = useState<Slot | null>(null);
  // O chip aceso acima da grade. Pode apontar para um dia que a lista nova não
  // tem mais (trocou o serviço, voltou do calendário) — por isso a tela não o
  // lê direto, e sim `diaVisto`, que cai num dia que exista.
  const [diaAtivo, setDiaAtivo] = useState('');
  // REF, e não estado, e isso é a correção de um bug real: consumi-lo não pode
  // disparar de novo o efeito que busca a grade. Como estado, ele era
  // dependência daquele efeito — e o efeito começa com `setSlot(null)`. A
  // sequência era: a lista chega, o horário é eleito, `inicioPendente` vira
  // null, o efeito roda DE NOVO e apaga o horário recém-eleito, rebuscando
  // hoje. Quem vinha do calendário via o dia sumir e o botão voltar a
  // "confirmar" seco. O sintoma visível era a segunda requisição a /horarios.
  //
  // Consumido uma vez só, pelo mesmo motivo de antes: não reeleger o mesmo
  // horário quando a pessoa trocar de serviço.
  const inicioPendente = useRef<string | null>(inicial.inicio ?? null);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // O nome e o telefone atravessam a ida ao calendário pela aba, não pela URL
  // (`@/lib/rascunho` explica por que não pela URL). Lido em efeito, e nunca no
  // `useState` inicial: `sessionStorage` não existe no servidor, e ler no
  // render faria o HTML do servidor divergir do primeiro render do cliente —
  // erro de hidratação, com o React descartando a árvore inteira.
  useEffect(() => {
    const r = lerRascunho();
    if (r.nome) setNome(r.nome);
    if (r.whats) setWhats(r.whats);
  }, []);

  // O guia da primeira vez. Lido em efeito pelo mesmo motivo do rascunho
  // acima: `localStorage` não existe no servidor.
  const [guia, setGuia] = useState(false);
  useEffect(() => { setGuia(!guiaJaVisto()); }, []);

  // Grava a cada tecla. É barato (duas strings curtas) e é o que sobrevive a
  // fechar a aba sem querer no meio do preenchimento.
  useEffect(() => { salvarRascunho({ nome, whats }); }, [nome, whats]);

  // Todo fetch em efeito leva `signal` e aborta na limpeza. Sem isso, trocar
  // de barbeiro ou de serviço rápido deixa buscas sobrepostas no ar, e a
  // última a responder pinta a tela: a grade seria de um serviço e a
  // confirmação, de outro — 409 na cara do cliente.
  useEffect(() => {
    const ctrl = new AbortController();
    publicoApi.barbeiros(ctrl.signal).then(setBarbeiros).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  // Trocar barbeiro pode invalidar o serviço (Rael não faz pezinho).
  useEffect(() => {
    setSlot(null);
    if (!barbeiroId) { setServicos([]); setServicoId(''); return; }
    const ctrl = new AbortController();
    publicoApi.servicos(barbeiroId, ctrl.signal)
      .then(lista => {
        setServicos(lista);
        setServicoId(atual => (atual && !lista.some(s => s.id === atual) ? '' : atual));
      })
      .catch(ignorarAborto);
    return () => ctrl.abort();
  }, [barbeiroId]);

  // Trocar serviço muda a DURAÇÃO, logo muda a grade inteira.
  // Manter o horário selecionado garantiria 409 na confirmação.
  useEffect(() => {
    setSlot(null);
    if (!servicoId || !barbeiroId) { setDias([]); return; }
    // Vindo do calendário, o dia escolhido pode estar muito além dos dois
    // dias da home — busca-se o dia dele, não os próximos.
    const janela = inicioPendente.current
      ? { de: diaLocalDe(inicioPendente.current), dias: 1 }
      : { dias: DIAS_NA_HOME };
    const ctrl = new AbortController();
    publicoApi.horarios({ barbeiroId, servicoId, ...janela }, ctrl.signal)
      .then(setDias).catch(ignorarAborto);
    return () => ctrl.abort();
  }, [servicoId, barbeiroId]);

  // Reeleger o horário que veio do calendário assim que a lista chega.
  useEffect(() => {
    if (!inicioPendente.current) return;
    const achado = dias.flatMap(d => d.slots).find(s => s.inicio === inicioPendente.current);
    // Zerar a ref não re-renderiza — e é justamente isso que se quer: eleger o
    // horário não pode remexer na grade que acabou de chegar.
    if (achado) { setSlot(achado); inicioPendente.current = null; }
  }, [dias]);

  const servico = servicos.find(s => s.id === servicoId);
  const pronto = !!servicoId && !!slot && dadosCompletos(nome, whats);
  // Sem chip escolhido, abre no primeiro dia COM vaga: num fim de tarde de
  // agenda cheia, acender "Hoje" vazio por padrão faria a tela começar
  // dizendo não, com o amanhã livre a um toque de distância.
  const diaVisto = dias.find(d => d.data === diaAtivo)
    ?? dias.find(d => d.slots.length > 0) ?? dias[0];
  const diaDoSlot = slot ? dias.find(d => d.slots.some(s => s.inicio === slot.inicio)) : undefined;

  const passo = guia ? proximoPasso({
    barbeiroId, servicoId, temHorario: !!slot,
    diaSemVaga: !!diaVisto && diaVisto.slots.length === 0,
    algumDiaComVaga: dias.some(d => d.slots.length > 0), nome, whats,
  }) : null;
  const pularGuia = () => { marcarGuiaVisto(); setGuia(false); };
  const balao = (p: Passo) => passo === p && <Balao texto={TEXTO_DO_PASSO[p]} aoPular={pularGuia} />;
  // O que se toca no passo da vez ganha o anel âmbar pulsando (`globals.css`).
  const alvo = (p: Passo, falta = true) => (passo === p && falta ? ' guia-alvo' : '');

  async function confirmar() {
    if (!pronto || enviando) return;
    setEnviando(true); setErro('');
    try {
      const { codigo } = await publicoApi.agendar({
        barbeiroId: slot!.barbeiroId, servicoId, inicio: slot!.inicio,
        nome, whatsapp: whats,
      });
      // O rascunho cumpriu o papel de atravessar o calendário. Some agora,
      // e não quando a aba fechar: o balcão da barbearia é um aparelho só, e o
      // próximo cliente não pode achar o telefone do anterior no formulário.
      limparRascunho();
      // Marcou uma vez: daqui em diante, neste aparelho, a pessoa já sabe.
      marcarGuiaVisto();
      window.location.href = `/agendamento/${codigo}`;
    } catch (e) {
      setErro(mensagemDoErro(e));
      setEnviando(false);
      if (e instanceof ErroApi && e.status === 409) {
        // Recarrega a lista mantendo nome e telefone preenchidos.
        setSlot(null);
        void publicoApi.horarios({ barbeiroId, servicoId, dias: DIAS_NA_HOME })
          .then(setDias);
      }
    }
  }

  // As quatro etapas são irmãs na marcação, na ordem do desenho — é assim
  // que o celular as empilha, 1, 2, 3, 4. No desktop o grid as recoloca em
  // duas colunas SEM mexer na ordem do DOM: fossem dois <div> de coluna, o
  // celular receberia "04 Seus dados" antes de "03 Horário".
  return (
    <div className="grid gap-[22px] md:grid-cols-2 md:gap-x-10 md:gap-y-8 md:items-start">
      <Etapa n="01" titulo="Barbeiro" className="md:col-start-1 md:row-start-1">
        {balao('barbeiro')}
        <div className={`flex flex-col gap-2${alvo('barbeiro')}`}>
          {barbeiros.map(b => {
            const ativo = barbeiroId === b.id;
            return (
              <button key={b.id} type="button" aria-pressed={ativo}
                      onClick={() => setBarbeiroId(b.id)}
                      className={`flex w-full items-center gap-3 rounded-[14px] border-[1.5px]
                                  bg-superficie p-3 text-left transition-colors
                                  ${ativo ? 'border-latao' : 'border-borda hover:border-latao'}`}>
                <Rosto barbeiro={b} />
                <span className="min-w-0 truncate text-[14.5px] md:text-[15.5px] font-bold text-tinta">
                  {b.nome}
                </span>
                {ativo && (
                  <span aria-hidden className="ml-auto flex size-5 shrink-0 items-center justify-center
                                               rounded-full border-[1.5px] border-acento
                                               text-[11px] font-bold text-acento">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Etapa>

      <Etapa n="02" titulo="Serviço" className="md:col-start-1 md:row-start-2">
        {balao('servico')}
        {!barbeiroId ? <Nota>Escolhe o barbeiro pra ver os serviços.</Nota> : (
          // Quebra linha, e não rola de lado: um serviço escondido à direita
          // da tela é um serviço que o cliente não sabe que existe.
          <div className={`flex flex-wrap gap-2${alvo('servico')}`}>
            {servicos.map(s => {
              const ativo = servicoId === s.id;
              return (
                <button key={s.id} type="button" aria-pressed={ativo}
                        onClick={() => setServicoId(s.id)}
                        className={`max-w-full rounded-[12px] border-[1.5px] px-3.5 py-2.5 text-left
                                    transition-colors
                                    ${ativo ? 'border-acento bg-superficie2'
                                            : 'border-borda bg-superficie hover:border-latao'}`}>
                  <span className="block text-[12.5px] md:text-[13.5px] font-bold text-tinta">{s.nome}</span>
                  <span className={`mt-0.5 block whitespace-nowrap text-[10.5px] md:text-[11.5px]
                                    ${ativo ? 'font-semibold text-acento' : 'text-sub'}`}>
                    {s.duracaoMin}min
                    {s.precoCentavos !== null && ` · ${formatarPreco(s.precoCentavos)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Etapa>

      <Etapa n="03" titulo="Horário" className="md:col-start-2 md:row-start-1 md:row-span-3">
        {!servicoId && <Nota>Escolhe o serviço pra ver os horários.</Nota>}

        {balao('outro-dia')}
        {dias.length > 0 && (
          <div className={`mb-3 flex flex-wrap gap-2${alvo('outro-dia')}`}>
            {dias.map(d => {
              const ativo = d.data === diaVisto?.data;
              return (
                <button key={d.data} type="button" aria-pressed={ativo}
                        onClick={() => setDiaAtivo(d.data)}
                        className={`rounded-full border px-[13px] py-[7px] text-[12px] md:text-[13px]
                                    font-semibold transition-colors
                                    ${ativo ? 'border-acento bg-acento text-fundo'
                                            : 'border-borda bg-superficie text-sub hover:border-latao'}`}>
                  {maiuscula(d.rotulo)}
                </button>
              );
            })}
          </div>
        )}

        {balao('horario')}
        {diaVisto && (diaVisto.slots.length === 0 ? <Nota>sem vaga nesse dia</Nota> : (
          // Cinco por linha, como no desenho: a grade cheia de horas é o que
          // diz "agenda movimentada", e não uma lista curta e vazia.
          <div className={`grid grid-cols-5 gap-1.5${alvo('horario')}`}>
            {diaVisto.slots.map(s => {
              const ativo = slot?.inicio === s.inicio;
              return (
                <button key={s.inicio} type="button" aria-pressed={ativo}
                        onClick={() => setSlot(s)}
                        className={`rounded-[14px] border py-[9px] text-center text-[11.5px] md:text-[13px]
                                    tabular-nums transition-colors
                                    ${ativo ? 'border-acento bg-acento font-bold text-fundo'
                                            : 'border-borda bg-superficie font-semibold text-sub hover:border-latao hover:text-tinta'}`}>
                  {s.hora}
                </button>
              );
            })}
          </div>
        ))}
        {servicoId && <Nota className="mt-2">só aparece o que está livre</Nota>}

        {barbeiroId && servicoId && (
          // `urlCalendario`, e não uma URL escrita à mão: era escrita à mão, e
          // esquecia o `inicio`. Quem já tinha um horário na mão e ia ao
          // calendário só para dar uma olhada voltava sem ele — o "‹ voltar"
          // de lá só sabe devolver o que chegou.
          <div className="mt-3">
            {balao('calendario')}
            {mostraDicaDoCalendario(passo) && <DicaDoCalendario />}
            <a href={urlCalendario({ barbeiroId, servicoId, inicio: slot?.inicio })}
               className={`flex items-center justify-between rounded-[12px] border border-borda
                           bg-superficie px-3.5 py-3 text-[13px] md:text-sm text-sub
                           transition-colors hover:border-latao${alvo('calendario')}`}>
              <span>Ver outro dia no calendário</span><span aria-hidden>›</span>
            </a>
          </div>
        )}
      </Etapa>

      <Etapa n="04" titulo="Seus dados" className="md:col-start-1 md:row-start-3">
        {balao('dados')}
        <div className="flex flex-col gap-2.5">
          <Campo rotulo="Nome">
            <input className={CAMPO + alvo('dados', nome.trim().length < 2)} placeholder="Seu nome"
                   value={nome} onChange={e => setNome(e.target.value)} />
          </Campo>
          <Campo rotulo="WhatsApp">
            <input className={CAMPO + alvo('dados', whats.replace(/\D/g, '').length < 10)}
                   inputMode="numeric"
                   placeholder="(11) 9 ____-____" value={whats}
                   onChange={e => {
                     const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                     setWhats(d.length >= 10 ? formatar(d) : d);
                   }} />
          </Campo>
        </div>

        {erro && <p className="mt-3 text-[12px] md:text-[13px] text-acento">{erro}</p>}

        {/* A frase do que vai ser marcado, logo acima do botão — o lugar
            onde a pessoa confere antes de tocar. Antes ela morava DENTRO do
            botão, em caixa baixa e comprida. */}
        {slot && servico && (
          <p className="mt-[22px] rounded-[12px] border border-borda bg-superficie2 px-3.5 py-3
                        text-[12.5px] md:text-[13.5px] text-sub">
            {servico.nome} com <b className="font-semibold text-acento">{slot.barbeiroNome}</b>
            {diaDoSlot && ` · ${diaCurto(diaDoSlot.rotulo)}`} {slot.hora}
          </p>
        )}

        {passo === 'confirmar' && <div className="mt-4">{balao('confirmar')}</div>}
        <button type="button" onClick={confirmar} disabled={!pronto || enviando}
                className={`w-full rounded-[14px] border-[1.5px] p-4 text-center
                            text-[14.5px] md:text-base font-bold transition-colors
                            ${passo === 'confirmar' ? '' : slot && servico ? 'mt-4' : 'mt-[22px]'}${alvo('confirmar')}
                            border-acento bg-acento text-fundo
                            disabled:border-borda disabled:bg-superficie disabled:text-apagado`}>
          {enviando ? 'Confirmando…' : 'Confirmar horário'}
        </button>
        <Nota className="mt-2.5 text-center">A confirmação chega no seu WhatsApp</Nota>
      </Etapa>
    </div>
  );
}

/// O cabeçalho de etapa do desenho: o número em fonte de dado, em âmbar, e o
/// nome ao lado. `h2` de verdade — são as seções da página para quem lê com
/// leitor de tela.
function Etapa({
  n, titulo, className = '', children,
}: { n: string; titulo: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col ${className}`}>
      <h2 className="mb-2.5 flex items-center gap-2 text-[13px] md:text-[15px] font-bold text-tinta">
        <span className="font-dado text-[12px] md:text-[13px] text-acento">{n}</span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const Nota = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <p className={`text-[11px] md:text-xs text-lbl ${className}`}>{children}</p>
);

/// O campo com o rótulo em cima. O `<label>` embrulha o `<input>`: tocar no
/// rótulo foca o campo sem precisar de `id`.
const Campo = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[11.5px] md:text-xs font-semibold text-lbl">{rotulo}</span>
    {children}
  </label>
);

/// A borda âmbar no foco É o anel de foco aqui: o contorno global de
/// `:focus-visible` por fora dela faria dois fios em volta do mesmo campo.
const CAMPO = 'w-full rounded-[12px] border-[1.5px] border-borda bg-superficie px-3.5 py-[13px] '
  + 'text-[13.5px] md:text-sm text-tinta placeholder:text-apagado outline-none '
  + 'focus-visible:outline-none focus:border-acento transition-colors';

/// O rosto no cartão do barbeiro. Sem foto, a inicial sobre latão: o círculo
/// vazio do `Avatar` some contra a nogueira, e o cartão ficava com um buraco
/// onde devia estar a pessoa. A foto é a que o barbeiro põe no painel (o
/// quadrado da barra de cima).
const Rosto = ({ barbeiro }: { barbeiro: Barbeiro }) => barbeiro.fotoUrl
  ? <Avatar tamanho={42} fotoUrl={barbeiro.fotoUrl} nome={barbeiro.nome} />
  : (
    <span aria-hidden className="flex size-[42px] shrink-0 items-center justify-center rounded-full
                                 bg-latao text-[17px] font-bold text-fundo">
      {barbeiro.nome.trim().charAt(0).toUpperCase()}
    </span>
  );

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/// "hoje · qua 13 ago" vira "hoje"; "sex 15 ago", que não tem o prefixo, fica
/// como veio. O rótulo é montado pelo back (`_rotulo` em services/agenda.py),
/// e o ponto médio é o separador que ele promete.
const diaCurto = (rotulo: string) => rotulo.split(' · ')[0];
