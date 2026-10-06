'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Frame, Lbl, Sub } from '@/components/wf';
import { mensagemDoErro, whatsappApi, type WhatsappDaBarbearia } from '@/lib/api';
import { textoDasNaoEnviadas } from '@/lib/whatsapp-saudacao';

/// A resposta automática com o link, feita pelo próprio WhatsApp Business
/// da barbearia.
///
/// Desde a etapa 1 do número central o número da barbearia não fica ligado
/// a sistema nenhum — risco zero de bloqueio para o negócio. Quem responde
/// "marca por aqui" é a mensagem de saudação do app, e esta tela só entrega
/// o texto pronto, com o link certo, e o caminho para colar.
export default function WhatsappDoPainel() {
  const [dados, setDados] = useState<WhatsappDaBarbearia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      setDados(await whatsappApi.ver(signal));
    } catch (e) {
      // `mensagemDoErro` devolve string vazia para aborto: trocar de tela no
      // meio da busca não pinta erro nenhum.
      const msg = mensagemDoErro(e);
      if (msg) setErro(msg);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  async function copiar() {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(dados.saudacao);
      setCopiado(true);
    } catch {
      setErro('Não deu para copiar. Segura o dedo no texto e copia na mão.');
    }
  }

  const naoEnviadas = dados ? textoDasNaoEnviadas(dados.naoEnviadas) : null;

  return (
    <Frame>
      <h1>WhatsApp</h1>
      {erro && <Box variante="alerta">{erro}</Box>}
      {!dados ? <Sub>carregando…</Sub> : (
        <>
          {naoEnviadas && <Box variante="alerta">{naoEnviadas}</Box>}
          <Lbl>Resposta automática com o link</Lbl>
          <Box variante="copia" className="whitespace-pre-line break-words">{dados.saudacao}</Box>
          <button type="button" onClick={copiar} className="text-left">
            <Box variante={copiado ? 'sel' : 'normal'}>{copiado ? 'Copiado' : 'Copiar'}</Box>
          </button>
          <Lbl>Como ligar</Lbl>
          <Sub>
            No WhatsApp Business: Ferramentas comerciais → Mensagem de saudação →
            ativar → colar o texto → destinatários: todos.
          </Sub>
          <Sub>
            O WhatsApp manda a saudação na primeira mensagem de cada pessoa, ou
            depois de 14 dias sem conversa.
          </Sub>
        </>
      )}
    </Frame>
  );
}
