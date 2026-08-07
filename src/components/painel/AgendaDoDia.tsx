'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';

type Item = {
  id: string; inicio: string; fim: string; servicoNome: string;
  barbeiroId: string; barbeiroNome: string;
  clienteNome: string; clienteWhatsapp: string;
};
type Eu = { id: string; nome: string; papel: 'DONO' | 'BARBEIRO' };

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

export function AgendaDoDia() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [dia, setDia] = useState(hoje());
  const [itens, setItens] = useState<Item[] | null>(null);

  const carregar = useCallback(async (d: string) => {
    setItens(null);
    const r = await fetch(`/api/painel/agenda?dia=${d}`);
    if (r.status === 401) { window.location.href = '/painel/login'; return; }
    setItens((await r.json()).itens);
  }, []);

  useEffect(() => {
    fetch('/api/auth/eu').then((r) => (r.ok ? r.json() : null)).then(setEu);
  }, []);

  useEffect(() => { void carregar(dia); }, [dia, carregar]);

  async function cancelar(item: Item) {
    if (!confirm(`Cancelar o horário de ${item.clienteNome} às ${hora(item.inicio)}?`)) return;
    const r = await fetch(`/api/painel/agendamentos/${item.id}/cancelar`, { method: 'POST' });
    if (r.ok) void carregar(dia);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, -1))}>←</Box>
        <Lbl>{dia === hoje() ? 'hoje' : dia}</Lbl>
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, 1))}>→</Box>
      </div>

      {itens === null && <Sub>carregando…</Sub>}
      {itens?.length === 0 && <Sub>nenhum horário marcado neste dia.</Sub>}

      {itens?.map((i) => (
        <Box key={i.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span>{hora(i.inicio)} · {i.clienteNome}</span>
            <Sub>{i.servicoNome}</Sub>
          </div>
          {/* O nome do barbeiro só faz sentido para quem vê a agenda de mais
              de um: para o barbeiro, seria a mesma linha o dia inteiro. */}
          {eu?.papel === 'DONO' && <Sub>{i.barbeiroNome}</Sub>}
          <Sep />
          <div className="flex gap-3">
            <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer">
              <Sub>whatsapp</Sub>
            </a>
            <button onClick={() => cancelar(i)}>
              <Sub className="text-acento">cancelar</Sub>
            </button>
          </div>
        </Box>
      ))}

      <a href="/painel/novo"><Box variante="fill">+ marcar na mão</Box></a>
    </>
  );
}
