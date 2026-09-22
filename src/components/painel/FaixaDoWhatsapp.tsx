'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { whatsappApi, type WhatsappDaBarbearia } from '@/lib/api';
import { PAINEL_ATUALIZACAO_MS } from '@/lib/config';
import { useAtualizacaoPeriodica } from '@/lib/useAtualizacaoPeriodica';
import { faixaDoWhatsapp } from '@/lib/whatsapp-estado';
import { useEu } from '@/components/painel/SessaoDoPainel';

/// O aviso de que o WhatsApp da barbearia caiu, no cabeçalho de todas as
/// telas do painel.
///
/// **No cabeçalho, e não numa tela própria**, porque o modo de falha é não
/// olhar: o vínculo cai sozinho, sem ninguém clicar em nada, e uma tela que
/// precisasse ser visitada só seria visitada depois que o cliente ligou
/// perguntando por que não recebeu a confirmação.
///
/// Quem decide o texto é `faixaDoWhatsapp` — função pura, testada em
/// `tests/whatsapp-estado.test.ts`. Aqui fica só a busca e o desenho: a regra
/// perigosa (dono vê caminho para o QR, barbeiro não) não deve morar dentro de
/// um componente que só dá para testar montando React.
export function FaixaDoWhatsapp() {
  const { eu } = useEu();
  const [dados, setDados] = useState<WhatsappDaBarbearia | null>(null);

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      setDados(await whatsappApi.ver(signal));
    } catch {
      // Silêncio de propósito: esta busca é acessório de TODA tela do painel.
      // Um erro aqui viraria uma tarja vermelha em cima da agenda por causa
      // de uma rede que piscou — e a agenda, que é o trabalho, continua
      // funcionando sem esta resposta.
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  // No plano sem zap não há vínculo que possa cair, então a resposta nunca
  // muda sem alguém mexer no admin: parar de perguntar economiza uma ida ao
  // servidor a cada 30s, em toda tela, para sempre.
  const semZap = dados?.plano === 'SEM_ZAP';
  useAtualizacaoPeriodica(
    () => { if (!semZap) void carregar(); },
    PAINEL_ATUALIZACAO_MS,
  );

  if (!dados || !eu) return null;
  const faixa = faixaDoWhatsapp(dados, eu.papel);
  if (!faixa) return null;

  // `alerta` no `role`, não só na cor: quem usa leitor de tela precisa saber
  // que apareceu algo que muda o que dá para esperar do sistema.
  return (
    <div role="status"
         className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-borda
                    py-2 text-[12px] md:text-[13px] lg:py-2.5 lg:text-[15px] text-acento">
      <span aria-hidden>⚠</span>
      <span className="min-w-0">{faixa.texto}</span>
      {faixa.link && (
        <Link href={faixa.link} className="underline underline-offset-2 shrink-0">
          {faixa.acao}
        </Link>
      )}
    </div>
  );
}
