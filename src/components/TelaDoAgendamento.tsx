'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Box, Sub } from '@/components/wf';
import { Confirmado } from '@/components/Confirmado';
import { publicoApi, type DetalheDoAgendamento } from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';
import { lerRascunho, limparRascunho, salvarRascunho } from '@/lib/rascunho';
import {
  estadoDaTela, formatarRelogio, linkDoZap, precisaConsultar,
} from '@/lib/telaDoAgendamento';
import { useAtualizacaoPeriodica } from '@/lib/useAtualizacaoPeriodica';

const CONSULTA_MS = 3000;

/// Escolhe a tela pelo estado do agendamento e a troca sozinha quando ele
/// muda. O servidor manda o `status`; o relógio daqui (1 s) só antecipa o
/// vencimento, ver `@/lib/telaDoAgendamento`.
export function TelaDoAgendamento({ inicial }: { inicial: DetalheDoAgendamento }) {
  const [ag, setAg] = useState(inicial);
  // O primeiro valor sai do render do servidor e o relógio assume na hidratação:
  // o texto do cronômetro difere por segundos, e por isso ele leva
  // `suppressHydrationWarning`.
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const estado = estadoDaTela(ag, agora);

  let tela: React.ReactNode;
  if (estado.tipo === 'confirmado' || estado.tipo === 'cancelado') {
    tela = <ConfirmadoOuCancelado ag={ag} />;
  } else if (estado.tipo === 'expirado') {
    tela = <Expirado ag={ag} />;
  } else if (estado.tipo === 'aguardando' && ag.pix) {
    tela = <Aguardando ag={ag} pix={ag.pix} segundos={estado.segundosRestantes} urgente={estado.urgente} />;
  } else {
    tela = <><h1>Gerando seu Pix…</h1><Sub>É rapidinho, essa tela atualiza sozinha.</Sub></>;
  }

  return (
    <>
      {precisaConsultar(estado) && <Consulta codigo={ag.codigo} aoChegar={setAg} />}
      {tela}
    </>
  );
}

/// A consulta mora num componente próprio de propósito: ele só EXISTE nos
/// estados em que algo pode mudar sozinho, então sair desses estados
/// desmonta o ciclo (e ele para) sem nenhuma condição para esquecer.
function Consulta({ codigo, aoChegar }: {
  codigo: string; aoChegar: (d: DetalheDoAgendamento) => void;
}) {
  useAtualizacaoPeriodica(() => {
    publicoApi.detalhe(codigo).then(aoChegar).catch(() => {
      /* sem rede por um instante: a próxima volta tenta de novo. */
    });
  }, CONSULTA_MS);
  return null;
}

function ConfirmadoOuCancelado({ ag }: { ag: DetalheDoAgendamento }) {
  // O nome e o telefone ficaram guardados na aba para o caso de o Pix vencer
  // ("escolher outro horário"). Passado esse risco, somem: o balcão da
  // barbearia é um aparelho só.
  useEffect(() => { limparRascunho(); }, []);
  return (
    <Confirmado
      codigo={ag.codigo}
      clienteNome={ag.clienteNome}
      barbeiroNome={ag.barbeiroNome}
      servicoNome={ag.servicoNome}
      inicioIso={ag.inicio}
      fimIso={ag.fim}
      status={ag.status}
      podeCancelar={ag.podeCancelar}
      endereco={ag.endereco}
      whatsappBarbearia={ag.whatsappBarbearia}
      precoCentavos={ag.precoCentavos}
    />
  );
}

function Aguardando({ ag, pix, segundos, urgente }: {
  ag: DetalheDoAgendamento;
  pix: NonNullable<DetalheDoAgendamento['pix']>;
  segundos: number; urgente: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix.copiaECola);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem permissão de área de transferência: o texto está à mostra para
         selecionar na mão. */
    }
  }

  const hora = new Date(ag.inicio).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      <h1>Falta o Pix, {ag.clienteNome.split(' ')[0]}.</h1>
      <Sub>Seu horário ({ag.servicoNome.toLowerCase()}, {hora}) está reservado até o Pix cair.</Sub>

      <div className="bg-superficie border border-borda rounded-wf shadow-[var(--shadow-sel)]
                      px-5 py-6 md:px-7 md:py-8 flex flex-col items-center gap-3 text-center">
        <div className="font-dado font-bold text-[44px] md:text-[56px] leading-none
                        tracking-tight text-acento">
          {formatarPreco(pix.valorCentavos)}
        </div>
        <Sub>
          Pague o valor exato, com os centavos: é por eles que a gente sabe que o Pix é seu.
        </Sub>

        {/* O SVG vem pronto do nosso servidor, mas entra como imagem e não como
            HTML: <img> não executa script, então nada que vier dentro do SVG
            roda aqui. Fundo branco fixo — o QR precisa de contraste claro/escuro
            em qualquer tema. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(pix.qrSvg)}`}
          alt="QR code do Pix"
          width={220} height={220}
          className="bg-white p-2 rounded-wf w-[220px] h-[220px]"
        />

        <div
          role="timer"
          aria-live="off"
          suppressHydrationWarning
          className={`font-dado font-bold text-[32px] leading-none ${urgente ? 'text-acento animate-pulse' : 'text-tinta'}`}
        >
          {formatarRelogio(segundos)}
        </div>
        <Sub className={urgente ? 'text-acento' : undefined}>
          {urgente ? 'Últimos minutos! Depois disso o horário é liberado.' : 'tempo para pagar'}
        </Sub>
      </div>

      <Sub>Ou use o Pix copia e cola no app do seu banco:</Sub>
      <Box variante="copia" className="break-all text-[12px] select-all">{pix.copiaECola}</Box>
      <Box variante="fill" className="text-center cursor-pointer" onClick={copiar}>
        {copiado ? 'Copiado' : 'Copiar código'}
      </Box>
      <Sub>Assim que o Pix cair, essa tela muda sozinha e a gente confirma no WhatsApp.</Sub>
    </>
  );
}

function Expirado({ ag }: { ag: DetalheDoAgendamento }) {
  const zap = linkDoZap(ag.barbeiro.whatsapp);

  // O telefone não vem do servidor (§9.1), mas o formulário o deixou na aba;
  // o nome completa o que faltar. Quem usa `/agendar` lê isto em efeito.
  function guardarParaRemarcar() {
    const r = lerRascunho();
    salvarRascunho({ nome: r.nome || ag.clienteNome, whats: r.whats });
  }

  return (
    <>
      <h1>O prazo para pagar acabou e o horário foi liberado.</h1>
      <Sub>Se você já pagou, fale com {ag.barbeiro.nome}.</Sub>
      {zap && (
        <a href={zap} target="_blank" rel="noopener noreferrer">
          <Box variante="fill" className="text-center">falar com {ag.barbeiro.nome} no zap</Box>
        </a>
      )}
      <Link href="/agendar" onClick={guardarParaRemarcar}>
        <Box className="text-center">Escolher outro horário</Box>
      </Link>
    </>
  );
}
