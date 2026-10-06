'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { adminApi, mensagemDoErro, type WhatsappCentral as Central } from '@/lib/api';
import { formatar } from '@/lib/telefone';

/// O QR troca a cada ~40s na Evolution: enquanto não conecta, a tela confere
/// de 3 em 3 — o mesmo ritmo que a tela do QR da barbearia usava.
const CONFERIR_MS = 3_000;

/// O número central do Marcaí no topo do admin.
///
/// Desde a etapa 1 ele carrega tudo — lista, avisos, confirmação, lembrete.
/// Se ele cai, cai para todas as barbearias de uma vez; por isso o estado
/// fica à vista, e o QR para reconectar fica aqui, sem precisar expor o
/// manager da Evolution.
export function WhatsappCentral() {
  const [dados, setDados] = useState<Central | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      setDados(await adminApi.whatsappCentral(signal));
      setErro('');
    } catch (e) {
      const msg = mensagemDoErro(e);
      if (msg) setErro(msg);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  const conectado = dados?.conectado === true;
  useEffect(() => {
    if (conectado) return;
    const t = setInterval(() => { void carregar(); }, CONFERIR_MS);
    return () => clearInterval(t);
  }, [conectado, carregar]);

  return (
    <>
      <Lbl>whatsapp do marcaí</Lbl>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {!dados ? <Sub>carregando…</Sub>
        : !dados.configurado ? <Box variante="mut">sem Evolution configurada neste ambiente</Box>
        : dados.conectado ? (
          <Box variante="sel">conectado{dados.numero ? ` · ${formatar(dados.numero)}` : ''}</Box>
        ) : dados.qrBase64 ? (
          <>
            <Box variante="alerta">desconectado — nada sai para equipe nem cliente</Box>
            {/* `data:image/png;base64,...` vem pronto da Evolution. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dados.qrBase64}
              alt="QR code para conectar o WhatsApp do Marcaí"
              className="w-full max-w-[280px] self-center rounded-wf border border-borda bg-white p-2"
            />
            <Sub>No celular do chip do Marcaí: WhatsApp → Aparelhos conectados → Conectar um aparelho.</Sub>
          </>
        ) : (
          <Box variante="alerta">desconectado, e a Evolution não mandou QR — tenta de novo em instantes</Box>
        )}
    </>
  );
}
