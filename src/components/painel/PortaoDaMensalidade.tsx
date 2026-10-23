'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BotaoCheio, BotaoVazado, Cartao, Texto, TituloDaTela } from '@/components/painel/pecas';
import {
  ErroApi, MENSALIDADE_BLOQUEADA, ignorarAborto, mensalidadeApi, mensagemDoErro,
} from '@/lib/api';
import {
  chaveDaFaixaFechada, estadoDoPortao, faixaDaMensalidade, faixaFechada, jeitoDePagar, reais,
  rotuloDaFaixa, type Mensalidade,
} from '@/lib/mensalidade';

const CHAVE_FAIXA_FECHADA = 'marcai:faixa-da-mensalidade-fechada';

/// Entre a barra do topo e as telas do painel (ver `layout.tsx`).
///
/// A barra fica fora de propósito: quem está bloqueado precisa poder sair e
/// trocar de login.
///
/// Relê a situação ao montar, quando a janela volta a ter foco (o dono paga
/// no app do banco e volta) e quando qualquer pedido do painel leva 402 de
/// mensalidade (`client.ts` avisa por evento). Falha ao ler deixa passar:
/// quem barra de verdade é o servidor.
export function PortaoDaMensalidade({ children }: { children: React.ReactNode }) {
  const naEntrada = usePathname() === '/painel/login';
  const [m, setM] = useState<Mensalidade | null>(null);
  // Lido em efeito: o servidor não tem localStorage. Fechar é conveniência do
  // aparelho; sem localStorage (aba anônima) a faixa só volta ao recarregar.
  const [fechada, setFechada] = useState<string | null>(null);
  useEffect(() => {
    try { setFechada(localStorage.getItem(CHAVE_FAIXA_FECHADA)); } catch { /* sem storage */ }
  }, []);
  const fechar = (atual: Mensalidade) => {
    const chave = chaveDaFaixaFechada(atual);
    setFechada(chave);
    try { localStorage.setItem(CHAVE_FAIXA_FECHADA, chave); } catch { /* sem storage */ }
  };

  const ler = useCallback((signal?: AbortSignal) =>
    mensalidadeApi.ver(signal).then(setM).catch(ignorarAborto).catch(() => {}), []);

  useEffect(() => {
    // Na entrada não há sessão: um 401 aqui redirecionaria para a própria
    // entrada, em laço.
    if (naEntrada) return;
    const ctrl = new AbortController();
    const reler = () => { void ler(); };
    void ler(ctrl.signal);
    window.addEventListener('focus', reler);
    window.addEventListener(MENSALIDADE_BLOQUEADA, reler);
    return () => {
      ctrl.abort();
      window.removeEventListener('focus', reler);
      window.removeEventListener(MENSALIDADE_BLOQUEADA, reler);
    };
  }, [naEntrada, ler]);

  if (naEntrada) return <>{children}</>;

  const estado = estadoDoPortao(m, m?.souDono ?? false);
  if (estado === 'pagar' && m) return <TelaDePagamento m={m} aoMudar={setM} />;
  if (estado === 'falar-com-o-dono') {
    return (
      <main className="mx-auto flex max-w-[560px] flex-col gap-3 px-4 py-10">
        <TituloDaTela titulo="Painel bloqueado">
          Painel bloqueado. A mensalidade da barbearia está em atraso — fale com o dono.
        </TituloDaTela>
      </main>
    );
  }

  const faixa = faixaDaMensalidade(m);
  return (
    <>
      {faixa && m && !faixaFechada(m, fechada) && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4 md:px-10">
          <FaixaDaMensalidade
            m={m} texto={faixa.texto} mostraPix={faixa.mostraPix} aoMudar={setM}
            aoFechar={faixa.podeFechar ? () => fechar(m) : undefined}
          />
        </div>
      )}
      {children}
    </>
  );
}

/// A faixa acima do painel. Vencendo ou atrasada, traz o "Pagar com Pix",
/// que abre o mesmo pagamento da tela de bloqueio: quem quer pagar antes de
/// travar não precisa esperar o bloqueio para ver o QR. Depois do "Já
/// paguei" a situação vira AGUARDANDO, a faixa perde o botão e o Pix fecha
/// sozinho.
function FaixaDaMensalidade({ m, texto, mostraPix, aoMudar, aoFechar }: {
  m: Mensalidade; texto: string; mostraPix: boolean; aoMudar: (m: Mensalidade) => void;
  /// Só o "vence em X dias" traz: a faixa de atraso não se fecha.
  aoFechar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Cartao variante="dash" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Texto className="text-tinta">{texto}</Texto>
        <div className="flex flex-wrap gap-2">
          {mostraPix && (
            <BotaoVazado onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
              {aberto ? 'Esconder' : rotuloDaFaixa(m)}
            </BotaoVazado>
          )}
          {aoFechar && (
            <BotaoVazado onClick={aoFechar} aria-label="Fechar o aviso da mensalidade">
              Fechar
            </BotaoVazado>
          )}
        </div>
      </div>
      {mostraPix && aberto && (
        <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 text-center">
          <PagamentoPix m={m} aoMudar={aoMudar} />
        </div>
      )}
    </Cartao>
  );
}

/// O que o dono vê no lugar do painel. O site de agendamento segue aberto
/// para os clientes — só o painel trava.
function TelaDePagamento({ m, aoMudar }: { m: Mensalidade; aoMudar: (m: Mensalidade) => void }) {
  return (
    <main className="mx-auto flex max-w-[560px] flex-col gap-4 px-4 py-10">
      <TituloDaTela titulo="A mensalidade está em atraso">
        O painel volta assim que o pagamento for confirmado. O site de agendamento
        continua funcionando para os seus clientes.
      </TituloDaTela>
      <Cartao className="flex flex-col items-center gap-3 text-center">
        <PagamentoPix m={m} aoMudar={aoMudar} />
      </Cartao>
    </main>
  );
}

/// O pagamento em si, o mesmo na tela de bloqueio e na faixa. Pelo Pix
/// estático: o valor com os centavos próprios (é por eles que o Pix é
/// reconhecido), o QR, o copia e cola e o "Já paguei". Pela InfinitePay: o
/// valor e o botão que abre o link numa aba nova.
function PagamentoPix({ m, aoMudar }: { m: Mensalidade; aoMudar: (m: Mensalidade) => void }) {
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const jeito = jeitoDePagar(m);

  async function copiar() {
    if (jeito.tipo !== 'pix') return;
    try {
      await navigator.clipboard.writeText(jeito.copiaECola);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  async function jaPaguei() {
    setEnviando(true);
    setErro('');
    try {
      aoMudar(await mensalidadeApi.jaPaguei());
    } catch (e) {
      // 400 traz a frase do back; qualquer outra falha cai no texto padrão.
      setErro(e instanceof ErroApi ? e.message : mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {jeito.tipo === 'link' && (
        <>
          <p className="text-[22px] font-bold text-tinta tabular-nums md:text-[26px]">
            {reais(jeito.valorCentavos)}
          </p>
          <a
            href={jeito.link}
            target="_blank"
            rel="noopener noreferrer"
            // O mesmo desenho do `BotaoCheio`, mas é link: abre o checkout.
            className="w-full rounded-[11px] bg-acento px-6 py-[15px] text-center text-[14.5px]
                       font-bold text-no-acento transition-opacity hover:opacity-90
                       md:rounded-[13px] md:px-7 md:py-[17px] md:text-[16px]"
          >
            {jeito.rotulo}
          </a>
          <Texto>{jeito.frase}</Texto>
        </>
      )}
      {jeito.tipo === 'pix' && (
        <>
          <p className="text-[22px] font-bold text-tinta tabular-nums md:text-[26px]">
            {reais(jeito.valorCentavos)}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={jeito.qrSvg} alt={`QR Code Pix de ${reais(jeito.valorCentavos)}`}
               className="size-[220px] rounded-[10px] bg-white p-2" />
          <div className="flex w-full gap-2">
            <input
              readOnly
              value={jeito.copiaECola}
              aria-label="Pix copia e cola"
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-[10px] border border-borda bg-superficie2
                         px-3 py-2 text-[12px] text-tinta md:text-[13px]"
            />
            <BotaoVazado onClick={copiar}>{copiado ? 'Copiado' : 'Copiar'}</BotaoVazado>
          </div>
        </>
      )}
      {jeito.tipo === 'indisponivel' && <Texto>{jeito.texto}</Texto>}
      {jeito.jaPaguei && (
        <BotaoCheio largura="cheia" onClick={jaPaguei} disabled={enviando}>
          {enviando ? 'Avisando...' : 'Já paguei'}
        </BotaoCheio>
      )}
      {erro && <Texto className="text-acento">{erro}</Texto>}
    </>
  );
}
