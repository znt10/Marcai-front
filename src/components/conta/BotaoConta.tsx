'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { contaApi } from '@/lib/api';
import {
  CONTA_ABERTA, EVENTO_CONTA, guiaDaContaVisto, inicialDoNome, marcarGuiaDaContaVisto,
} from '@/lib/conta';

/// O botão do topo: "Entrar" para quem não tem sessão, a inicial do nome em
/// círculo para quem tem. Os dois levam a `/conta`.
///
/// Enquanto a resposta não chega ocupa o mesmo espaço (altura de 32px),
/// vazio, para o cabeçalho não pular quando ela vier. Qualquer erro vira
/// "Entrar": o botão é só uma porta, e a tela de destino diz o que houve.
///
/// Quem nunca entrou neste aparelho vê um balão debaixo do "Entrar", igual
/// ao do guia de agendar. Flutua (absoluto) em vez de empurrar o cabeçalho,
/// porque o topo não tem onde caber um balão em linha.
export function BotaoConta() {
  if (!CONTA_ABERTA) return null;
  return <BotaoContaAberto />;
}

function BotaoContaAberto() {
  const [estado, setEstado] = useState<'carregando' | 'fora' | { nome: string }>('carregando');
  // Lido em efeito, como o guia de agendar: o servidor não tem localStorage.
  const [guia, setGuia] = useState(false);
  useEffect(() => { setGuia(!guiaDaContaVisto()); }, []);
  const fecharGuia = () => { marcarGuiaDaContaVisto(); setGuia(false); };

  useEffect(() => {
    let ctl = new AbortController();
    const consultar = () => {
      ctl.abort();
      ctl = new AbortController();
      const meu = ctl;
      contaApi.eu(meu.signal)
        .then((eu) => { setEstado({ nome: eu.nome }); marcarGuiaDaContaVisto(); })
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
      <div className="relative shrink-0">
        <Link href="/conta" onClick={() => marcarGuiaDaContaVisto()}
              className={`flex h-8 items-center rounded-full border-[1.5px] border-borda
                         px-3.5 text-[12.5px] md:text-[13px] font-bold text-tinta
                         hover:border-acento transition-colors${guia ? ' guia-alvo' : ''}`}>
          Entrar
        </Link>
        {guia && (
          <div role="status"
               className="absolute right-0 top-full z-20 mt-2.5 w-[230px] rounded-[14px] bg-acento
                          px-4 pt-3 pb-2.5 text-fundo shadow-lg">
            {/* A ponta, apontando para o "Entrar" logo acima. */}
            <span aria-hidden className="absolute -top-1.5 right-6 size-3 rotate-45 bg-acento" />
            <p className="text-[14.5px] md:text-[15px] font-bold leading-snug">
              <span aria-hidden>👆 </span>Primeira vez aqui? Toque em Entrar e crie sua conta
            </p>
            <p className="mt-1 text-[12.5px] leading-snug">
              Assim você vê e cancela seus horários sem precisar do link.
            </p>
            <button type="button" onClick={fecharGuia}
                    className="mt-1.5 text-[12.5px] md:text-[13px] font-semibold underline underline-offset-2">
              Agora não
            </button>
          </div>
        )}
      </div>
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
