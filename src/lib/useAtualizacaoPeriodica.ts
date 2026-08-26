'use client';
import { useEffect, useRef } from 'react';
import { criarCiclo } from './atualizacao-periodica';

/// Liga `criarCiclo` numa tela: chama `aoTocar` de tempos em tempos enquanto
/// a aba estiver à vista, e uma vez a mais assim que ela voltar.
///
/// A função entra por `ref` e NÃO na lista de dependências. Um componente
/// recria a função a cada render, então dependê-la remontaria o ciclo a cada
/// render — e um ciclo remontado nunca chega ao fim do intervalo, ou seja,
/// nunca atualizaria nada. Guardada em `ref`, o ciclo vive enquanto a tela
/// vive e sempre chama a versão mais recente, com o estado atual junto.
export function useAtualizacaoPeriodica(aoTocar: () => void, intervaloMs: number) {
  const ultima = useRef(aoTocar);

  // Em efeito, não durante o render: escrever numa ref no corpo do
  // componente quebra sob renderização concorrente.
  useEffect(() => { ultima.current = aoTocar; });

  useEffect(() => {
    const ciclo = criarCiclo({
      intervaloMs,
      visivel: () => document.visibilityState === 'visible',
      aoTocar: () => ultima.current(),
    });
    ciclo.iniciar();

    const aoMudar = () => ciclo.aoMudarVisibilidade();
    document.addEventListener('visibilitychange', aoMudar);

    return () => {
      document.removeEventListener('visibilitychange', aoMudar);
      ciclo.parar();
    };
  }, [intervaloMs]);
}
