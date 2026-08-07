'use client';
import { useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { GRANULARIDADE_MIN, PAINEL_ANTECEDENCIA_PADRAO_MIN } from '@/lib/config';

type Servico = { id: string; nome: string; duracaoMin: number };
type Slot = { hora: string; inicio: string; barbeiroId: string };

/// O caso do balcão: o cliente está ali e quer o próximo horário. O padrão
/// economiza toque; não é regra — os dois campos continuam trocáveis.
function padraoDeHorario() {
  const d = new Date(Date.now() + PAINEL_ANTECEDENCIA_PADRAO_MIN * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / GRANULARIDADE_MIN) * GRANULARIDADE_MIN);
  return d;
}

export function FormMarcar({ eu }: { eu: { id: string; papel: 'DONO' | 'BARBEIRO' } }) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [servicoId, setServicoId] = useState('');
  const [dia, setDia] = useState(padraoDeHorario().toLocaleDateString('sv-SE'));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [inicio, setInicio] = useState('');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  // O primeiro da lista já vem escolhido — é o serviço mais comum da casa.
  useEffect(() => {
    fetch(`/api/servicos?barbeiroId=${eu.id}`)
      .then((r) => r.json())
      .then((s: Servico[]) => { setServicos(s); setServicoId(s[0]?.id ?? ''); });
  }, [eu.id]);

  useEffect(() => {
    if (!servicoId) return;
    fetch(`/api/horarios?barbeiroId=${eu.id}&servicoId=${servicoId}&de=${dia}&dias=1`)
      .then((r) => r.json())
      .then((d) => {
        const livres: Slot[] = d.dias?.[0]?.slots ?? [];
        setSlots(livres);
        const alvo = padraoDeHorario().toISOString();
        setInicio(livres.find((s) => s.inicio >= alvo)?.inicio ?? livres[0]?.inicio ?? '');
      });
  }, [servicoId, dia, eu.id, recarga]);

  const pronto = servicoId && inicio && nome.trim().length >= 2 && whatsapp && !enviando;

  async function marcar() {
    if (!pronto) return;
    setEnviando(true); setErro('');
    const r = await fetch('/api/painel/agendamentos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ barbeiroId: eu.id, servicoId, inicio, nome, whatsapp }),
    });
    if (r.ok) { window.location.href = '/painel'; return; }
    setErro((await r.json()).erro);
    setEnviando(false);
    // 409 é horário que acabou de ser pego: recarregar a lista é o conserto.
    if (r.status === 409) setRecarga((n) => n + 1);
  }

  return (
    <>
      <Lbl>serviço</Lbl>
      <div className="flex flex-wrap gap-2">
        {servicos.map((s) => (
          <Box key={s.id} variante={s.id === servicoId ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setServicoId(s.id)}>
            {s.nome}
          </Box>
        ))}
      </div>

      <Lbl>dia</Lbl>
      <Box>
        <input type="date" className="w-full outline-none bg-transparent"
               value={dia} onChange={(e) => setDia(e.target.value)} />
      </Box>

      <Lbl>hora</Lbl>
      {slots.length === 0 && <Sub>nenhum horário livre neste dia.</Sub>}
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <Box key={s.inicio} variante={s.inicio === inicio ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setInicio(s.inicio)}>
            {s.hora}
          </Box>
        ))}
      </div>

      <Lbl>cliente</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="nome"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Box>
      <Box variante={whatsapp ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="whatsapp"
               inputMode="numeric"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Box>

      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={pronto ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={marcar}>
        {enviando ? 'marcando…' : 'marcar'}
      </Box>
      <a href="/painel"><Box>← voltar para a agenda</Box></a>
    </>
  );
}
