'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Row, Lbl, Sub, Avatar } from '@/components/wf';
import { formatar } from '@/lib/telefone';
import { formatarPreco } from '@/lib/dinheiro';
import {
  publicoApi, ignorarAborto, mensagemDoErro, ErroApi,
  type Barbeiro, type Servico, type Slot, type DiaComSlots as Dia,
} from '@/lib/api';
import { DIAS_NA_HOME } from '@/lib/config';

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
  // Consumido uma vez só: depois de casar com um slot da lista, some, para
  // não reeleger o mesmo horário quando o usuário trocar de serviço.
  const [inicioPendente, setInicioPendente] = useState<string | null>(inicial.inicio ?? null);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

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
    const janela = inicioPendente
      ? { de: diaLocalDe(inicioPendente), dias: 1 }
      : { dias: DIAS_NA_HOME };
    const ctrl = new AbortController();
    publicoApi.horarios({ barbeiroId, servicoId, ...janela }, ctrl.signal)
      .then(setDias).catch(ignorarAborto);
    return () => ctrl.abort();
  }, [servicoId, barbeiroId, inicioPendente]);

  // Reeleger o horário que veio do calendário assim que a lista chega.
  useEffect(() => {
    if (!inicioPendente) return;
    const achado = dias.flatMap(d => d.slots).find(s => s.inicio === inicioPendente);
    if (achado) { setSlot(achado); setInicioPendente(null); }
  }, [dias, inicioPendente]);

  const servico = servicos.find(s => s.id === servicoId);
  const pronto = !!servicoId && !!slot && nome.trim().length >= 2 && whats.replace(/\D/g, '').length >= 10;

  async function confirmar() {
    if (!pronto || enviando) return;
    setEnviando(true); setErro('');
    try {
      const { codigo } = await publicoApi.agendar({
        barbeiroId: slot!.barbeiroId, servicoId, inicio: slot!.inicio,
        nome, whatsapp: whats,
      });
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

  // As quatro etapas são irmãs na marcação, na ordem do wireframe — é assim
  // que o celular as empilha, 1, 2, 3, 4. No desktop o grid as recoloca em
  // duas colunas SEM mexer na ordem do DOM: fossem dois <div> de coluna, o
  // celular receberia "4. Seus dados" antes de "3. Horários".
  return (
    <div className="grid gap-2.5 md:grid-cols-2 md:gap-x-8 md:gap-y-5 md:items-start">
      <section className="flex flex-col gap-2.5 md:col-start-1 md:row-start-1">
        <Lbl>1. Barbeiro</Lbl>
        <Row wrap>
          {barbeiros.map(b => (
            <Box key={b.id} variante={barbeiroId === b.id ? 'sel' : 'normal'}
                 className="flex gap-1.5 items-center cursor-pointer"
                 onClick={() => setBarbeiroId(b.id)}>
              <Avatar />{b.nome}
            </Box>
          ))}
        </Row>
      </section>

      <section className="flex flex-col gap-2.5 md:col-start-1 md:row-start-2">
        <Lbl>2. Serviço</Lbl>
        {!barbeiroId ? <Sub>Escolhe o barbeiro pra ver os serviços.</Sub> : (
          <Row wrap>
            {servicos.map(s => (
              <Chip key={s.id} ativo={servicoId === s.id} onClick={() => setServicoId(s.id)}>
                {s.nome} · {s.duracaoMin}min
                {s.precoCentavos !== null && ` · ${formatarPreco(s.precoCentavos)}`}
              </Chip>
            ))}
          </Row>
        )}
      </section>

      <section className="flex flex-col gap-2.5 md:col-start-2 md:row-start-1 md:row-span-3">
        {/* O rótulo acompanha DIAS_NA_HOME: com 1 dia, "próximos" seria
            promessa que a lista não cumpre — quem quer outro dia vai pelo
            calendário, logo abaixo. */}
        <Lbl>{DIAS_NA_HOME === 1 ? '3. Horários livres hoje' : '3. Próximos horários livres'}</Lbl>
        {!servicoId && <Sub>Escolhe o serviço pra ver os horários.</Sub>}
        {dias.map(d => (
          <div key={d.data} className="flex flex-col gap-2">
            <Lbl>{d.rotulo}</Lbl>
            {d.slots.length === 0 ? <Sub>sem vaga nesse dia</Sub> : (
              <Row wrap>
                {d.slots.map(s => (
                  <Chip key={s.inicio} dado ativo={slot?.inicio === s.inicio} onClick={() => setSlot(s)}>
                    {s.hora}
                  </Chip>
                ))}
              </Row>
            )}
          </div>
        ))}
        {servicoId && <Sub>só aparece o que está livre</Sub>}

        {barbeiroId && servicoId && (
          <a href={`/calendario?barbeiroId=${barbeiroId}&servicoId=${servicoId}`}>
            <Box className="flex justify-between items-center">
              <span>escolher outro dia</span><Lbl>calendário ›</Lbl>
            </Box>
          </a>
        )}
      </section>

      <section className="flex flex-col gap-2.5 md:col-start-1 md:row-start-3">
        <Lbl>4. Seus dados</Lbl>
        <Box variante={nome ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" placeholder="Seu nome"
                 value={nome} onChange={e => setNome(e.target.value)} />
        </Box>
        <Box variante={whats ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" inputMode="numeric"
                 placeholder="WhatsApp (11) 9 ____-____" value={whats}
                 onChange={e => {
                   const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                   setWhats(d.length >= 10 ? formatar(d) : d);
                 }} />
        </Box>

        {erro && <Sub className="text-acento">{erro}</Sub>}

        <Box variante={pronto && !enviando ? 'fill' : 'mut'}
             className={pronto ? 'cursor-pointer' : ''} onClick={confirmar}>
          {slot && servico
            ? `confirmar ${servico.nome.toLowerCase()} ${slot.hora} com ${slot.barbeiroNome}`
            : 'confirmar'}
        </Box>
        <Sub className="text-center">confirmação chega no seu zap</Sub>
      </section>
    </div>
  );
}
