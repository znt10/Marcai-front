'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { precisaAtualizar, VERSAO_DE_DESENVOLVIMENTO, VERSAO_DO_APP } from '@/lib/versao';

/// A faixa "saiu versão nova", a mesma do FechaCaixa.
///
/// NÃO recarrega sozinha, e essa é a regra principal deste arquivo: quem está
/// com o painel aberto pode estar no meio de marcar um horário, e um reload
/// apagaria o que já preencheu. A pessoa toca em "Atualizar" quando puder.
///
/// Mora no painel e no admin, que são as telas que passam o dia abertas. O
/// cliente abre o link, marca e vai embora — para ele a faixa só atrapalharia.

/// De quanto em quanto tempo perguntar. Ninguém precisa saber do deploy no
/// segundo em que ele acontece, e são ~30 bytes por pergunta.
const INTERVALO_DE_CHECAGEM = 15 * 60 * 1000;

/// Piso entre duas perguntas. Sem ele, trocar de app e voltar dez vezes
/// seguidas (o barbeiro responde o zap e volta) dispararia dez chamadas.
const ESPERA_MINIMA_ENTRE_CHECAGENS = 60 * 1000;

/// Quanto tempo o "Depois" segura a faixa: tempo de terminar o atendimento.
const DURACAO_DO_ADIAMENTO = 30 * 60 * 1000;

/// A versão que o servidor está servindo agora, ou undefined se não deu.
async function versaoNoAr(sinal: AbortSignal): Promise<string | undefined> {
  try {
    const r = await fetch('/versao', { cache: 'no-store', signal: sinal });
    if (!r.ok) return undefined;
    const corpo: unknown = await r.json();
    const versao = (corpo as { versao?: unknown } | null)?.versao;
    return typeof versao === 'string' ? versao : undefined;
  } catch {
    // Rede caída, ou o servidor reiniciando no meio do deploy. Silêncio é a
    // resposta certa: não há o que o barbeiro fazer com esse erro.
    return undefined;
  }
}

export function AvisoDeVersaoNova() {
  const [temVersaoNova, setTemVersaoNova] = useState(false);
  const [adiado, setAdiado] = useState(false);
  const ultimaChecagem = useRef(0);
  const timerDoAdiamento = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (VERSAO_DO_APP === VERSAO_DE_DESENVOLVIMENTO) return;

    const controle = new AbortController();
    let montado = true;

    const checar = async () => {
      const agora = Date.now();
      if (agora - ultimaChecagem.current < ESPERA_MINIMA_ENTRE_CHECAGENS) return;
      ultimaChecagem.current = agora;
      const doServidor = await versaoNoAr(controle.signal);
      if (montado && precisaAtualizar(VERSAO_DO_APP, doServidor)) setTemVersaoNova(true);
    };

    // Voltar para o app é o melhor momento para avisar: a pessoa acabou de
    // olhar para a tela e provavelmente não está no meio de um campo.
    const aoVoltarParaOApp = () => {
      if (document.visibilityState === 'visible') void checar();
    };

    const intervalo = setInterval(() => void checar(), INTERVALO_DE_CHECAGEM);
    document.addEventListener('visibilitychange', aoVoltarParaOApp);
    return () => {
      montado = false;
      controle.abort();
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltarParaOApp);
    };
  }, []);

  useEffect(
    () => () => {
      if (timerDoAdiamento.current) clearTimeout(timerDoAdiamento.current);
    },
    [],
  );

  const adiar = useCallback(() => {
    setAdiado(true);
    if (timerDoAdiamento.current) clearTimeout(timerDoAdiamento.current);
    timerDoAdiamento.current = setTimeout(() => setAdiado(false), DURACAO_DO_ADIAMENTO);
  }, []);

  if (!temVersaoNova || adiado) return null;

  return (
    <div
      role="status"
      // Embaixo, e não em cima: no celular o topo é a barra do painel e o
      // título da tela que a pessoa está usando.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-borda bg-superficie px-4 pt-4
                 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.25)]"
    >
      <div className="mx-auto flex max-w-[520px] flex-col gap-3">
        <div>
          <p className="text-[15px] font-semibold text-tinta">Nova versão disponível</p>
          <p className="mt-1 text-[13px] text-sub">
            Atualize quando terminar o que está fazendo. Nada do que já foi salvo se perde.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-[44px] flex-1 rounded-[11px] bg-acento text-[15px] font-bold text-no-acento
                       transition hover:brightness-110"
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={adiar}
            className="h-[44px] rounded-[11px] border border-borda px-4 text-[15px] font-medium text-sub
                       transition hover:text-tinta"
          >
            Depois
          </button>
        </div>
      </div>
    </div>
  );
}
