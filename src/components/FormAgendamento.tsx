'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Row, Lbl, Sub, Avatar } from '@/components/wf';
import { formatar } from '@/lib/telefone';

type Barbeiro = { id: string; nome: string; fotoUrl: string | null };
type Servico = { id: string; nome: string; duracaoMin: number };
type Slot = { hora: string; inicio: string; barbeiroId: string; barbeiroNome: string };
type Dia = { data: string; rotulo: string; slots: Slot[] };

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

  const [barbeiroId, setBarbeiroId] = useState<string>(inicial.barbeiroId ?? 'qualquer');
  const [servicoId, setServicoId] = useState<string>(inicial.servicoId ?? '');
  const [slot, setSlot] = useState<Slot | null>(null);
  // Consumido uma vez só: depois de casar com um slot da lista, some, para
  // não reeleger o mesmo horário quando o usuário trocar de serviço.
  const [inicioPendente, setInicioPendente] = useState<string | null>(inicial.inicio ?? null);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { fetch('/api/barbeiros').then(r => r.json()).then(d => setBarbeiros(d.barbeiros)); }, []);

  // Trocar barbeiro pode invalidar o serviço (Rael não faz pezinho).
  useEffect(() => {
    fetch(`/api/servicos?barbeiroId=${barbeiroId}`).then(r => r.json()).then(d => {
      setServicos(d.servicos);
      setServicoId(atual => (atual && !d.servicos.some((s: Servico) => s.id === atual) ? '' : atual));
    });
    setSlot(null);
  }, [barbeiroId]);

  // Trocar serviço muda a DURAÇÃO, logo muda a grade inteira.
  // Manter o horário selecionado garantiria 409 na confirmação.
  useEffect(() => {
    setSlot(null);
    if (!servicoId) { setDias([]); return; }
    // Vindo do calendário, o dia escolhido pode estar muito além dos dois
    // dias da home — busca-se o dia dele, não os próximos.
    const janela = inicioPendente
      ? `de=${diaLocalDe(inicioPendente)}&dias=1`
      : `dias=2`;
    fetch(`/api/horarios?barbeiroId=${barbeiroId}&servicoId=${servicoId}&${janela}`)
      .then(r => r.json()).then(d => setDias(d.dias));
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
    const r = await fetch('/api/agendamentos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        barbeiroId: slot!.barbeiroId, servicoId, inicio: slot!.inicio, nome, whatsapp: whats,
      }),
    });
    const corpo = await r.json();
    if (r.ok) { window.location.href = `/agendamento/${corpo.codigo}`; return; }
    setErro(corpo.erro);
    setEnviando(false);
    if (r.status === 409) {
      // Recarrega a lista mantendo nome e telefone preenchidos.
      setSlot(null);
      fetch(`/api/horarios?barbeiroId=${barbeiroId}&servicoId=${servicoId}&dias=2`)
        .then(x => x.json()).then(d => setDias(d.dias));
    }
  }

  return (
    <>
      <Lbl>1. Barbeiro</Lbl>
      <Row>
        {barbeiros.map(b => (
          <Box key={b.id} variante={barbeiroId === b.id ? 'sel' : 'normal'}
               className="flex gap-1.5 items-center cursor-pointer"
               onClick={() => setBarbeiroId(b.id)}>
            <Avatar />{b.nome}
          </Box>
        ))}
      </Row>
      <Chip ativo={barbeiroId === 'qualquer'} className="self-start"
            onClick={() => setBarbeiroId('qualquer')}>tanto faz</Chip>

      <Lbl>2. Serviço</Lbl>
      <Row wrap>
        {servicos.map(s => (
          <Chip key={s.id} ativo={servicoId === s.id} onClick={() => setServicoId(s.id)}>
            {s.nome} · {barbeiroId === 'qualquer' ? `a partir de ${s.duracaoMin}min` : `${s.duracaoMin}min`}
          </Chip>
        ))}
      </Row>

      <Lbl>3. Próximos horários livres</Lbl>
      {!servicoId && <Sub>Escolhe o serviço pra ver os horários.</Sub>}
      {dias.map(d => (
        <div key={d.data} className="flex flex-col gap-2">
          <Lbl className="text-[#444]">{d.rotulo}</Lbl>
          {d.slots.length === 0 ? <Sub>sem vaga nesse dia</Sub> : (
            <Row wrap>
              {d.slots.map(s => (
                <Chip key={s.inicio} ativo={slot?.inicio === s.inicio} onClick={() => setSlot(s)}>
                  {s.hora}
                </Chip>
              ))}
            </Row>
          )}
        </div>
      ))}
      <Lbl>só aparece o que está livre</Lbl>

      <a href={servicoId ? `/calendario?barbeiroId=${barbeiroId}&servicoId=${servicoId}` : '#'}>
        <Box className="flex justify-between items-center">
          <span>escolher outro dia</span><Lbl>calendário ›</Lbl>
        </Box>
      </a>

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
    </>
  );
}
