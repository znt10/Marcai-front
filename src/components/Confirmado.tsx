'use client';
import { useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';
import { publicoApi, mensagemDoErro } from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';

type Props = {
  codigo: string; clienteNome: string; barbeiroNome: string; servicoNome: string;
  inicioIso: string; fimIso: string; status: string; podeCancelar: boolean;
  endereco: string; whatsappBarbearia: string;
  /// Snapshot do momento de marcar — nulo quando o barbeiro não tinha
  /// preço definido pra aquele serviço naquela hora.
  precoCentavos: number | null;
};

export function Confirmado(p: Props) {
  const [status, setStatus] = useState(p.status);
  const [erro, setErro] = useState('');

  const emSaoPaulo = (opcoes: Intl.DateTimeFormatOptions) =>
    new Date(p.inicioIso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', ...opcoes,
    });

  const hora = emSaoPaulo({ hour: '2-digit', minute: '2-digit' });
  const data = emSaoPaulo({ weekday: 'long', day: 'numeric', month: 'long' });

  async function cancelar() {
    try {
      await publicoApi.cancelar(p.codigo);
      setStatus('CANCELADO_CLIENTE');
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
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
        <h1>Horário cancelado.</h1>
        <Sub>Esse agendamento não está mais valendo.</Sub>
        <a href="/agendar"><Box variante="fill">marcar outro horário</Box></a>
      </>
    );
  }

  return (
    <>
      <h1>Tá marcado, {p.clienteNome.split(' ')[0]}.</h1>

      {/* O cupom. É a tela que o cliente printa e guarda, e é o que a
          barbearia entrega de verdade: a senha da vez. A hora é a informação
          que ele vai reler — então é ela que fica enorme, e em fonte de dado.

          O `codigo` continua fora daqui de propósito: ele é a credencial que
          cancela e mora no link. Um cupom com número seria mais bonito e
          mudaria uma regra de produto por motivo estético. */}
      <div className="bg-superficie border border-borda rounded-wf shadow-[var(--shadow-sel)]">
        <div className="px-5 py-6 md:px-7 md:py-8">
          <Lbl>{data}</Lbl>
          <div className="font-dado font-bold text-[56px] md:text-[76px] leading-none
                          tracking-tight text-acento mt-2">
            {hora}
          </div>
        </div>

        {/* A serrilha do destaque: entalhe nas duas pontas e picote no meio.
            Os círculos são pintados com a cor do CHÃO, não do cartão — é o
            recorte que dá a impressão de papel arrancado. */}
        <div className="relative h-0">
          <div className="absolute -left-[9px] -top-[9px] w-[18px] h-[18px] rounded-full bg-fundo" />
          <div className="absolute -right-[9px] -top-[9px] w-[18px] h-[18px] rounded-full bg-fundo" />
          <div className="absolute inset-x-4 top-0 border-t border-dashed border-borda" />
        </div>

        <div className="px-5 py-5 md:px-7 md:py-6 flex flex-col gap-1">
          <div className="text-[15px] md:text-lg">
            {p.servicoNome.toLowerCase()} com {p.barbeiroNome}
            {p.precoCentavos !== null && ` · ${formatarPreco(p.precoCentavos)}`}
          </div>
          <Sub>{p.endereco}</Sub>
        </div>
      </div>

      <Sub>Mandamos o lembrete no WhatsApp 1h antes.</Sub>
      <Box variante="fill" className="cursor-pointer" onClick={baixarIcs}>salvar no calendário</Box>

      {p.podeCancelar ? (
        <Box className="text-center cursor-pointer" onClick={cancelar}>cancelar meu horário</Box>
      ) : (
        <>
          <Box variante="mut" className="text-center">cancelar meu horário</Box>
          <Sub className="text-acento">passou do prazo — chama no zap: {p.whatsappBarbearia}</Sub>
        </>
      )}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Sep />
      <Sub>dá pra cancelar até 1h antes. depois disso, só chamando a barbearia.</Sub>
    </>
  );
}
