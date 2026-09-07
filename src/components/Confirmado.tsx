'use client';
import Link from 'next/link';
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

  if (status !== 'CONFIRMADO') {
    return (
      <>
        <h1>Horário cancelado.</h1>
        <Sub>Esse agendamento não está mais valendo.</Sub>
        <Link href="/agendar"><Box variante="fill">marcar outro horário</Box></Link>
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

      {/* Aqui ficavam os dois botões de calendário (`.ics` e Google Agenda).
          Saíram inteiros a pedido do dono: dois botões disputando a tela
          logo abaixo do cupom, para uma coisa que o lembrete do WhatsApp já
          resolve. O que faltava mesmo era o caminho de VOLTA — sem ele, a
          única ação desta tela era desfazer o que a pessoa acabou de fazer.

          Marcar de novo é o que acontece de verdade: o outro filho, a barba
          junto, a semana que vem. Sem este botão o caminho era voltar no
          navegador ou digitar o endereço outra vez.

          `Box` liso e não `variante="fill"`: quem chegou aqui já conseguiu o
          que queria, e um botão gritando "marcar" logo depois de marcar
          convida ao horário duplicado. O destaque da tela é o cupom. */}
      <Link href="/agendar"><Box className="text-center">marcar outro horário</Box></Link>

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
