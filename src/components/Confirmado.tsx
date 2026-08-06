'use client';
import { useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';

type Props = {
  codigo: string; clienteNome: string; barbeiroNome: string; servicoNome: string;
  inicioIso: string; fimIso: string; status: string; podeCancelar: boolean;
  endereco: string; whatsappBarbearia: string;
};

export function Confirmado(p: Props) {
  const [status, setStatus] = useState(p.status);
  const [erro, setErro] = useState('');

  const quando = new Date(p.inicioIso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric',
    month: 'short', hour: '2-digit', minute: '2-digit',
  });

  async function cancelar() {
    const r = await fetch(`/api/agendamentos/${p.codigo}/cancelar`, { method: 'POST' });
    const corpo = await r.json();
    if (r.ok) setStatus('CANCELADO_CLIENTE'); else setErro(corpo.erro);
  }

  function baixarIcs() {
    const fmt = (s: string) => s.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `UID:${p.codigo}@barbearia`,
      // DTSTAMP é obrigatório no RFC 5545; sem ele parte dos clientes de
      // calendário recusa o arquivo em silêncio.
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${fmt(p.inicioIso)}`, `DTEND:${fmt(p.fimIso)}`,
      `SUMMARY:${p.servicoNome} com ${p.barbeiroNome}`,
      `LOCATION:${p.endereco}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'agendamento.ics';
    a.click();
  }

  if (status !== 'CONFIRMADO') {
    return (
      <>
        <h1 className="text-[17px] font-normal">Horário cancelado.</h1>
        <Sub>Esse agendamento não está mais valendo.</Sub>
        <a href="/"><Box variante="fill">marcar outro horário</Box></a>
      </>
    );
  }

  return (
    <>
      <div className="h-5" />
      <div className="w-[52px] h-[52px] border-2 border-traco rounded-full
                      flex items-center justify-center text-[22px]">✓</div>
      <h1 className="text-[17px] font-normal m-0">Tá marcado, {p.clienteNome.split(' ')[0]}.</h1>
      <Box className="flex flex-col gap-1.5">
        <div className="text-[15px]">{quando}</div>
        <Sub>{p.servicoNome.toLowerCase()} · com {p.barbeiroNome} · {p.endereco}</Sub>
      </Box>
      <Sub>Mandamos o lembrete no WhatsApp 1h antes.</Sub>
      <Box variante="fill" className="cursor-pointer" onClick={baixarIcs}>salvar no calendário</Box>

      {p.podeCancelar ? (
        <Box className="text-center cursor-pointer" onClick={cancelar}>cancelar meu horário</Box>
      ) : (
        <>
          <Box variante="mut" className="text-center">cancelar meu horário</Box>
          <Lbl>passou do prazo — chama no zap: {p.whatsappBarbearia}</Lbl>
        </>
      )}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Sep />
      <Lbl>dá pra cancelar até 1h antes. depois disso, só chamando a barbearia.</Lbl>
    </>
  );
}
