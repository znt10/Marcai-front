'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Frame, Lbl, Sep, Sub } from '@/components/wf';
import { useEu } from '@/components/painel/SessaoDoPainel';
import { mensagemDoErro, whatsappApi, type WhatsappDaBarbearia } from '@/lib/api';

/// A tela de conectar o WhatsApp da barbearia — só do dono.
///
/// **Fora da lista de abas de propósito.** Ela é visitada duas vezes na vida
/// da barbearia (no dia em que conecta e no dia em que troca de celular), e
/// uma aba permanente para isso disputaria espaço com agenda, equipe e
/// serviços, que são o trabalho de todo dia. Quem traz o dono para cá é a
/// faixa, que só existe quando há o que fazer.
///
/// O QR expira em segundos e a Evolution gera um novo a cada ~40s, então a
/// tela confere de 3 em 3 — bem mais rápido que o resto do painel. É o único
/// lugar do produto onde o dado envelhece nessa escala, e a janela em que
/// isso custa caro é curta (a tela fica aberta o tempo de escanear).
const CONFERIR_MS = 3_000;

export default function WhatsappDoPainel() {
  const { eu, carregando } = useEu();
  const [dados, setDados] = useState<WhatsappDaBarbearia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [mudandoBot, setMudandoBot] = useState(false);

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      setDados(await whatsappApi.ver(signal));
    } catch (e) {
      // `mensagemDoErro` devolve string vazia para aborto, então trocar de
      // tela no meio de uma busca não pinta erro nenhum.
      const msg = mensagemDoErro(e);
      if (msg) setErro(msg);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  // Intervalo próprio, e não `useAtualizacaoPeriodica`: aquele hook serve ao
  // painel inteiro com os 30s de lá, e aqui o ritmo é outro pela natureza do
  // dado. Para de bater quando já conectou — não há mais o que esperar.
  const conectado = dados?.estado === 'CONECTADO';
  useEffect(() => {
    if (conectado) return;
    const t = setInterval(() => { void carregar(); }, CONFERIR_MS);
    return () => clearInterval(t);
  }, [conectado, carregar]);

  async function trocarDeCelular() {
    if (!confirm('Desconectar este celular? Você vai precisar ler o QR de novo.')) return;
    setTrocando(true);
    try {
      await whatsappApi.desconectar();
      await carregar();
    } catch {
      setErro('Não deu para desconectar agora.');
    } finally {
      setTrocando(false);
    }
  }

  async function mudarBot(ativo: boolean) {
    // Ligar pergunta; desligar não. Ligar faz as mensagens do número passarem
    // pelo Marcaí — o dono precisa saber disso ANTES, não descobrir depois.
    if (ativo && !confirm(
      'Ligar o atendimento automático? As mensagens que chegarem neste número '
      + 'passam pelo Marcaí para o robô responder. Nada da conversa fica guardado.',
    )) return;
    setMudandoBot(true);
    setErro(null);
    try {
      await whatsappApi.ligarBot(ativo);
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e) || 'Não deu para mudar agora.');
    } finally {
      setMudandoBot(false);
    }
  }

  if (carregando) {
    return <Frame><h1>WhatsApp</h1><Sub>carregando…</Sub></Frame>;
  }

  // A barreira de verdade é o `qrBase64: null` que a rota devolve para quem
  // não é dono; isto aqui só evita mostrar ao barbeiro uma tela cujo miolo
  // viria vazio. Mesma divisão de trabalho da tela de equipe.
  if (eu && eu.papel !== 'DONO') {
    return (
      <Frame>
        <h1>WhatsApp</h1>
        <Sub>Só o dono conecta o WhatsApp da barbearia.</Sub>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1>WhatsApp</h1>
      {erro && <Box variante="alerta">{erro}</Box>}
      {!dados ? <Sub>carregando…</Sub> : (
        <Miolo
          dados={dados} trocando={trocando} aoTrocar={trocarDeCelular}
          mudandoBot={mudandoBot} aoMudarBot={mudarBot}
        />
      )}
    </Frame>
  );
}

function Miolo({
  dados, trocando, aoTrocar, mudandoBot, aoMudarBot,
}: {
  dados: WhatsappDaBarbearia;
  trocando: boolean;
  aoTrocar: () => void;
  mudandoBot: boolean;
  aoMudarBot: (ativo: boolean) => void;
}) {
  if (dados.plano !== 'COM_ZAP') {
    return (
      <>
        <Box variante="mut">Esta barbearia está no plano sem WhatsApp.</Box>
        <Sub>
          Os clientes veem a confirmação na tela do agendamento, e a equipe
          continua recebendo os avisos pelo número do Marcaí.
        </Sub>
      </>
    );
  }

  if (dados.estado === 'CONECTADO') {
    return (
      <>
        <Lbl>Conectado</Lbl>
        <Box variante="sel">{formatarNumero(dados.numeroConectado)}</Box>
        <Sub>As mensagens para os clientes saem deste número.</Sub>
        <Sep />
        <button type="button" onClick={aoTrocar} disabled={trocando} className="text-left">
          <Box variante="normal">{trocando ? 'desconectando…' : 'Trocar de celular'}</Box>
        </button>
        <Sep />
        <Lbl>Atendimento automático</Lbl>
        {/* Só com o WhatsApp conectado: ligar um robô num número que não
            recebe nada seria um interruptor que não faz coisa nenhuma. */}
        <button
          type="button" role="switch" aria-checked={dados.botAtivo}
          onClick={() => aoMudarBot(!dados.botAtivo)} disabled={mudandoBot}
          className="text-left"
        >
          <Box variante={dados.botAtivo ? 'sel' : 'normal'}>
            {mudandoBot ? 'mudando…' : dados.botAtivo ? 'Ligado' : 'Desligado'}
          </Box>
        </button>
        <Sub>
          {dados.botAtivo
            ? 'Quem escreve para este número recebe um menu para marcar ou cancelar. Se alguém da barbearia responder pelo celular, o robô fica quieto naquela conversa por 4 horas.'
            : 'Ligado, o robô responde quem escrever para este número com um menu para marcar ou cancelar horário. Grupo, áudio e foto ele ignora.'}
        </Sub>
      </>
    );
  }

  if (dados.estado === 'PENDENTE' || !dados.qrBase64) {
    return (
      <>
        <Box variante="dash">Preparando o número…</Box>
        {/* A conferência de 5 minutos do servidor é quem cria a instância —
            não há botão para apressar, e inventar um só produziria cliques
            que não fazem nada. */}
        <Sub>Isso leva alguns minutos. Pode deixar esta tela aberta.</Sub>
        <NaoEnviadas quantas={dados.naoEnviadas} />
      </>
    );
  }

  return (
    <>
      <Lbl>Leia com o WhatsApp do celular da barbearia</Lbl>
      {/* `data:image/png;base64,...` vem pronto da Evolution — o servidor não
          remonta a imagem, só repassa. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dados.qrBase64}
        alt="QR code para conectar o WhatsApp"
        className="w-full max-w-[280px] self-center rounded-wf border border-borda bg-white p-2"
      />
      <Sub>
        No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.
        O código troca sozinho de tempos em tempos; é só ler o que estiver na tela.
      </Sub>
      <NaoEnviadas quantas={dados.naoEnviadas} />
    </>
  );
}

function NaoEnviadas({ quantas }: { quantas: number }) {
  if (quantas <= 0) return null;
  // O número que transforma "está desconectado" em "está custando dinheiro".
  return (
    <Box variante="alerta">
      {quantas === 1
        ? '1 mensagem não chegou ao cliente enquanto o WhatsApp esteve fora do ar.'
        : `${quantas} mensagens não chegaram aos clientes enquanto o WhatsApp esteve fora do ar.`}
    </Box>
  );
}

/// `5583999990000` → `(83) 99999-0000`. O número vem da Evolution com o 55 na
/// frente; mostrar o que o dono reconhece vale mais que mostrar o que o
/// sistema guardou.
function formatarNumero(bruto: string | null): string {
  if (!bruto) return 'conectado';
  const digitos = bruto.replace(/\D/g, '').replace(/^55/, '');
  if (digitos.length < 10) return bruto;
  const ddd = digitos.slice(0, 2);
  const resto = digitos.slice(2);
  const meio = resto.length > 8 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}
