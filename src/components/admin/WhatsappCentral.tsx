'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import {
  adminApi, mensagemDoErro, type WhatsappCentral as Central, type WhatsappEvolution, type WhatsappMeta,
} from '@/lib/api';
import { formatar } from '@/lib/telefone';
import { proximaConferencia } from '@/lib/whatsapp-central';

/// Os dois caminhos do WhatsApp no topo do admin, lado a lado: a Meta (API
/// oficial) na esquerda e o chip da Evolution na direita.
///
/// Cada um cai sozinho e derruba coisas diferentes: sem a Meta, o painel
/// não confirma ao cliente e a reserva dos lembretes some; sem o chip, a
/// equipe fica sem a lista e os lembretes de quem escreveu nele saem pagos
/// pela Meta. Por isso os dois ficam à vista, e o QR para reconectar o chip
/// fica aqui, sem precisar expor o manager da Evolution.
export function WhatsappCentral() {
  const [dados, setDados] = useState<Central | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (signal: AbortSignal): Promise<Central | null> => {
    try {
      const novos = await adminApi.whatsappCentral(signal);
      setDados(novos);
      setErro('');
      return novos;
    } catch (e) {
      const msg = mensagemDoErro(e);
      if (msg) setErro(msg);
      return null;
    }
  }, []);

  // Uma conferência de cada vez: a próxima só é marcada depois que a
  // anterior respondeu (ver `proximaConferencia`).
  useEffect(() => {
    const ctrl = new AbortController();
    let espera: ReturnType<typeof setTimeout> | undefined;
    async function conferir() {
      const ms = proximaConferencia(await carregar(ctrl.signal));
      if (ms !== null && !ctrl.signal.aborted) espera = setTimeout(conferir, ms);
    }
    void conferir();
    return () => {
      ctrl.abort();
      clearTimeout(espera);
    };
  }, [carregar]);

  // Back antigo (antes do #76): só o card único, que é o do chip.
  const chip: WhatsappEvolution | undefined = dados?.evolution
    ?? (dados ? { emUso: true, ...dados } : undefined);

  return (
    <>
      <Lbl>whatsapp do marcaí</Lbl>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {!dados || !chip ? <Sub>carregando…</Sub> : (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <Sub>API oficial (Meta)</Sub>
            <LadoDaMeta meta={dados.meta} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Sub>chip (Evolution)</Sub>
            <LadoDoChip chip={chip} />
          </div>
        </div>
      )}
    </>
  );
}

function LadoDaMeta({ meta }: { meta?: WhatsappMeta }) {
  if (!meta) return <Box variante="mut">o back ainda não informa a Meta</Box>;
  if (!meta.ligada) return <Box variante="mut">desligada (WHATSAPP_PROVEDOR não é meta)</Box>;
  if (!meta.configurado) return <Box variante="alerta">ligada, mas sem token ou número configurado</Box>;
  if (meta.conectado) {
    return <Box variante="sel">conectada{meta.numero ? ` · ${formatar(meta.numero)}` : ''}</Box>;
  }
  return (
    <Box variante="alerta">
      desconectada — o painel não confirma ao cliente, e os lembretes não têm reserva se o chip cair.
      Ver no WhatsApp Manager.
    </Box>
  );
}

function LadoDoChip({ chip }: { chip: WhatsappEvolution }) {
  if (!chip.configurado) return <Box variante="mut">sem Evolution configurada neste ambiente</Box>;
  const uso = chip.emUso ? 'equipe e lembretes' : 'fora de uso (variáveis desligadas)';
  if (chip.conectado) {
    return (
      <>
        <Box variante="sel">conectado{chip.numero ? ` · ${formatar(chip.numero)}` : ''}</Box>
        <Sub>{uso}</Sub>
      </>
    );
  }
  return (
    <>
      <Box variante="alerta">
        desconectado — os barbeiros não recebem a lista, e os lembretes de quem escreveu no chip saem
        pela Meta (pagos) até reconectar.
      </Box>
      {chip.qrBase64 ? (
        <>
          {/* `data:image/png;base64,...` vem pronto da Evolution. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={chip.qrBase64}
            alt="QR code para conectar o chip"
            className="w-full max-w-[280px] self-center rounded-wf border border-borda bg-white p-2"
          />
          <Sub>No celular do chip: WhatsApp → Aparelhos conectados → Conectar um aparelho.</Sub>
        </>
      ) : (
        <Sub>a Evolution não mandou QR — tenta de novo em instantes</Sub>
      )}
    </>
  );
}
