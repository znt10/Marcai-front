'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';
import { useVocabulario } from '@/components/Vocabulario';
import { publicoApi, contaApi, mensagemDoErro, ErroApi } from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';
import { CONTA_ABERTA } from '@/lib/conta';
import { criarEsperaDoToque, linkDoLembrete } from '@/lib/lembretePorToque';

type Props = {
  codigo: string; clienteNome: string; barbeiroNome: string; servicoNome: string;
  inicioIso: string; fimIso: string; status: string; podeCancelar: boolean;
  endereco: string; whatsappBarbearia: string; whatsappAoCliente: boolean;
  /// Snapshot do momento de marcar — nulo quando o barbeiro não tinha
  /// preço definido pra aquele serviço naquela hora.
  precoCentavos: number | null;
  /// Lembrete por toque: o número central (nulo = back sem a chave, fica o
  /// texto de antes), se este agendamento já pediu o lembrete, e o nome que
  /// vai na mensagem pronta.
  whatsappCentral: string | null;
  lembretePedido: boolean;
  barbeariaNome: string;
};

export function Confirmado(p: Props) {
  const v = useVocabulario();
  const [status, setStatus] = useState(p.status);
  const [erro, setErro] = useState('');
  const router = useRouter();
  const pedeOToque = p.whatsappAoCliente && p.whatsappCentral !== null;

  // Quem tocou no botão foi para o WhatsApp e volta para esta aba depois de
  // mandar: buscar de novo (por um tempo, o webhook pode atrasar) faz a tela
  // trocar sozinha para "Lembrete ligado". Só depois do toque — quem só
  // olha a tela não busca nada.
  // Contador, e não booleano: tocar de novo depois que a espera acabou
  // recomeça a espera.
  const [toques, setToques] = useState(0);
  const esperandoToque = toques > 0 && pedeOToque && !p.lembretePedido;
  useEffect(() => {
    if (!esperandoToque) return;
    const espera = criarEsperaDoToque({
      atualizar: () => router.refresh(),
      visivel: () => document.visibilityState === 'visible',
    });
    espera.iniciar();
    const aoMudar = () => espera.aoMudarVisibilidade();
    document.addEventListener('visibilitychange', aoMudar);
    return () => {
      document.removeEventListener('visibilitychange', aoMudar);
      espera.parar();
    };
  }, [esperandoToque, toques, router]);

  // O convite só aparece para quem sabidamente NÃO tem sessão (401). Erro de
  // rede ou 500 não diz nada sobre a pessoa, então não mostra nada.
  const [convidar, setConvidar] = useState(false);
  useEffect(() => {
    if (!CONTA_ABERTA) return;
    const ctl = new AbortController();
    contaApi.eu(ctl.signal)
      .catch((e) => { if (!ctl.signal.aborted && e instanceof ErroApi && e.status === 401) setConvidar(true); });
    return () => ctl.abort();
  }, []);

  const emSaoPaulo = (opcoes: Intl.DateTimeFormatOptions) =>
    new Date(p.inicioIso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', ...opcoes,
    });

  const hora = emSaoPaulo({ hour: '2-digit', minute: '2-digit' });
  const data = emSaoPaulo({ weekday: 'long', day: 'numeric', month: 'long' });

  async function cancelar() {
    try {
      await publicoApi.cancelar(p.codigo);
      setStatus('CANCELADO_CLIENTE');
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  if (status !== 'CONFIRMADO') {
    return (
      <>
        <h1>Horário cancelado.</h1>
        <Sub>Esse agendamento não está mais valendo.</Sub>
        <Link href="/agendar"><Box variante="fill">marcar outro horário</Box></Link>
      </>
    );
  }

  return (
    <>
      <h1>Tá marcado, {p.clienteNome.split(' ')[0]}.</h1>

      {/* O cupom. É a tela que o cliente printa e guarda, e é o que a
          barbearia entrega de verdade: a senha da vez. A hora é a informação
          que ele vai reler — então é ela que fica enorme, e em fonte de dado.

          O `codigo` continua fora daqui de propósito: ele é a credencial que
          cancela e mora no link. Um cupom com número seria mais bonito e
          mudaria uma regra de produto por motivo estético. */}
      <div className="bg-superficie border border-borda rounded-wf shadow-[var(--shadow-sel)]">
        <div className="px-5 py-6 md:px-7 md:py-8">
          <Lbl>{data}</Lbl>
          <div className="font-dado font-bold text-[56px] md:text-[76px] leading-none
                          tracking-tight text-acento mt-2">
            {hora}
          </div>
        </div>

        {/* A serrilha do destaque: entalhe nas duas pontas e picote no meio.
            Os círculos são pintados com a cor do CHÃO, não do cartão — é o
            recorte que dá a impressão de papel arrancado. */}
        <div className="relative h-0">
          <div className="absolute -left-[9px] -top-[9px] w-[18px] h-[18px] rounded-full bg-fundo" />
          <div className="absolute -right-[9px] -top-[9px] w-[18px] h-[18px] rounded-full bg-fundo" />
          <div className="absolute inset-x-4 top-0 border-t border-dashed border-borda" />
        </div>

        <div className="px-5 py-5 md:px-7 md:py-6 flex flex-col gap-1">
          <div className="text-[15px] md:text-lg">
            {p.servicoNome.toLowerCase()} com {p.barbeiroNome}
            {p.precoCentavos !== null && ` · ${formatarPreco(p.precoCentavos)}`}
          </div>
          <Sub>{p.endereco}</Sub>
        </div>
      </div>

      {/* Lembrete por toque: só recebe WhatsApp quem manda a mensagem pronta.
          O botão é o destaque logo abaixo do cupom porque sem ele não chega
          nada — nem a confirmação. Nova aba para esta tela continuar aqui
          quando a pessoa voltar. */}
      {/* A pergunta, e não só um botão (ideia do cunhado do José, 03/11):
          "Quer receber o lembrete 1 hora antes?" é o que a pessoa responde
          sem pensar. Cartão no mesmo papel do cupom, com o título na cor de
          destaque, para não passar batido logo abaixo do horário. */}
      {pedeOToque && !p.lembretePedido && (
        <div className="bg-superficie border border-borda rounded-wf shadow-[var(--shadow-sel)]
                        px-5 py-5 md:px-7 md:py-6 flex flex-col gap-3">
          <div className="font-bold text-[22px] md:text-[26px] leading-tight text-acento">
            Quer receber o lembrete 1 hora antes?
          </div>
          <a href={linkDoLembrete(p.whatsappCentral!, p.barbeariaNome, p.codigo)}
             target="_blank" rel="noopener noreferrer" onClick={() => setToques((n) => n + 1)}>
            <Box variante="fill" className="text-center">Sim, quero no WhatsApp</Box>
          </a>
          <Sub>Abre o WhatsApp com a mensagem pronta. É só enviar.</Sub>
        </div>
      )}
      {pedeOToque && p.lembretePedido && <Sub>Lembrete ligado ✓ · chega no WhatsApp 1h antes</Sub>}
      {!pedeOToque && (p.whatsappAoCliente
        ? <Sub>Mandamos o lembrete no WhatsApp 1h antes.</Sub>
        : <Sub>Por enquanto não mandamos confirmação nem lembrete no WhatsApp. Tire um print desta tela para não esquecer.</Sub>)}

      {/* Aqui ficavam os dois botões de calendário (`.ics` e Google Agenda).
          Saíram inteiros a pedido do dono: dois botões disputando a tela
          logo abaixo do cupom, para uma coisa que o lembrete do WhatsApp já
          resolve. O que faltava mesmo era o caminho de VOLTA — sem ele, a
          única ação desta tela era desfazer o que a pessoa acabou de fazer.

          Marcar de novo é o que acontece de verdade: o outro filho, a barba
          junto, a semana que vem. Sem este botão o caminho era voltar no
          navegador ou digitar o endereço outra vez.

          `Box` liso e não `variante="fill"`: quem chegou aqui já conseguiu o
          que queria, e um botão gritando "marcar" logo depois de marcar
          convida ao horário duplicado. O destaque da tela é o cupom. */}
      <Link href="/agendar"><Box className="text-center">marcar outro horário</Box></Link>

      {p.podeCancelar ? (
        <Box className="text-center cursor-pointer" onClick={cancelar}>cancelar meu horário</Box>
      ) : (
        <>
          <Box variante="mut" className="text-center">cancelar meu horário</Box>
          <Sub className="text-acento">passou do prazo — chama no zap: {p.whatsappBarbearia}</Sub>
        </>
      )}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {convidar && (
        <Link href="/conta" className="underline">
          <Sub>Crie uma conta pra cancelar sem precisar deste link</Sub>
        </Link>
      )}
      <Sep />
      <Sub>dá pra cancelar até 1h antes. depois disso, só chamando {v.oLugar}.</Sub>
    </>
  );
}
