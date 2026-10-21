'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { contaApi } from '@/lib/api';
import { EVENTO_CONTA, inicialDoNome } from '@/lib/conta';

/// O botão do topo: "Entrar" para quem não tem sessão, a inicial do nome em
/// círculo para quem tem. Os dois levam a `/conta`.
///
/// Enquanto a resposta não chega ocupa o mesmo espaço (altura de 32px),
/// vazio, para o cabeçalho não pular quando ela vier. Qualquer erro vira
/// "Entrar": o botão é só uma porta, e a tela de destino diz o que houve.
export function BotaoConta() {
  const [estado, setEstado] = useState<'carregando' | 'fora' | { nome: string }>('carregando');

  useEffect(() => {
    let ctl = new AbortController();
    const consultar = () => {
      ctl.abort();
      ctl = new AbortController();
      const meu = ctl;
      contaApi.eu(meu.signal)
        .then((eu) => setEstado({ nome: eu.nome }))
        .catch(() => { if (!meu.signal.aborted) setEstado('fora'); });
    };
    consultar();
    // "Sair" em outra parte da página: consulta de novo.
    window.addEventListener(EVENTO_CONTA, consultar);
    return () => { ctl.abort(); window.removeEventListener(EVENTO_CONTA, consultar); };
  }, []);

  if (estado === 'carregando') return <span aria-hidden className="block h-8 w-[58px] shrink-0" />;

  if (estado === 'fora') {
    return (
      <Link href="/conta"
            className="flex h-8 shrink-0 items-center rounded-full border-[1.5px] border-borda
                       px-3.5 text-[12.5px] md:text-[13px] font-bold text-tinta
                       hover:border-acento transition-colors">
        Entrar
      </Link>
    );
  }
  return (
    <Link href="/conta" aria-label={`Minha conta, ${estado.nome}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-latao
                     text-[14px] font-bold text-fundo">
      {inicialDoNome(estado.nome)}
    </Link>
  );
}
