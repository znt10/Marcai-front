'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro, type WhatsappCentral as Central } from '@/lib/api';
import { formatar } from '@/lib/telefone';
import { proximaConferencia } from '@/lib/whatsapp-central';

/// O chip da equipe (Evolution) no topo do admin.
///
/// Desde a API oficial (Meta), o cliente recebe pelo número da Meta e este
/// chip leva só o que vai para os barbeiros: a lista do dia e os avisos. Se
/// ele cai, cai para a equipe de todas as barbearias de uma vez; por isso o
/// estado fica à vista, e o QR para reconectar fica aqui, sem precisar expor
/// o manager da Evolution.
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

  return (
    <>
      <Lbl>chip do marcaí (equipe e lembretes)</Lbl>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {!dados ? <Sub>carregando…</Sub>
        : !dados.configurado ? <Box variante="mut">sem Evolution configurada neste ambiente</Box>
        : dados.conectado ? (
          <Box variante="sel">conectado{dados.numero ? ` · ${formatar(dados.numero)}` : ''}</Box>
        ) : dados.qrBase64 ? (
          <>
            <Box variante="alerta">desconectado — os barbeiros não recebem a lista, e os lembretes de quem escreveu no chip saem pela Meta (pagos) até reconectar.</Box>
            {/* `data:image/png;base64,...` vem pronto da Evolution. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dados.qrBase64}
              alt="QR code para conectar o chip da equipe"
              className="w-full max-w-[280px] self-center rounded-wf border border-borda bg-white p-2"
            />
            <Sub>No celular do chip: WhatsApp → Aparelhos conectados → Conectar um aparelho.</Sub>
          </>
        ) : (
          <Box variante="alerta">desconectado, e a Evolution não mandou QR — tenta de novo em instantes</Box>
        )}
    </>
  );
}
