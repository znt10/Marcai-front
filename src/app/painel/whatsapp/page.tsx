'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Frame, Lbl, Sub } from '@/components/wf';
import { useEu } from '@/components/painel/SessaoDoPainel';
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
          {/* Sem a hora, é o back de antes dela: o front pode subir primeiro. */}
          {dados.horaDaLista && (
            <HoraDaLista dados={dados}
                         aoMudar={(horaDaLista) => setDados({ ...dados, horaDaLista })} />
          )}
        </>
      )}
    </Frame>
  );
}

/// A hora da lista do dia que cada barbeiro recebe pelo número do Marcaí
/// (pedido de 07/10/2026). Escolhida pelo dono, porque vale para a equipe
/// inteira; o barbeiro só vê quando ela chega. Um `<select>` com as horas que
/// o back aceita, e não um campo de hora livre: 07:15 não tem disparo, e a
/// lista daquela barbearia simplesmente pararia de sair.
function HoraDaLista({ dados, aoMudar }: {
  dados: WhatsappDaBarbearia; aoMudar: (hora: string) => void;
}) {
  const { eu } = useEu();
  const [escolhida, setEscolhida] = useState(dados.horaDaLista);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const mudou = escolhida !== dados.horaDaLista;

  async function salvar() {
    setSalvando(true); setResultado(null);
    try {
      const { horaDaLista } = await whatsappApi.mudarHoraDaLista(escolhida);
      aoMudar(horaDaLista);
      setResultado({ ok: true, texto: `Salvo. A lista sai às ${horaDaLista}.` });
    } catch (e) {
      setResultado({ ok: false, texto: mensagemDoErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Lbl className="mt-2">Lista do dia da equipe</Lbl>
      <Sub>
        Todo dia de manhã, cada barbeiro recebe no WhatsApp os horários dele.
        Se a agenda de hoje muda depois disso, a lista é refeita.
      </Sub>
      {eu?.papel !== 'DONO' ? (
        <Box>Sai às <b className="font-dado">{dados.horaDaLista}</b>. Só o dono muda a hora.</Box>
      ) : (
        <>
          <Box className="flex items-center gap-2">
            <label htmlFor="hora-da-lista" className="text-sub">Sai às</label>
            <select id="hora-da-lista" value={escolhida}
                    onChange={(e) => { setEscolhida(e.target.value); setResultado(null); }}
                    className="bg-transparent font-dado text-tinta outline-none">
              {dados.horasDaLista.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Box>
          <button type="button" onClick={salvar} disabled={!mudou || salvando} className="text-left">
            <Box variante={mudou ? 'fill' : 'mut'}>{salvando ? 'Salvando…' : 'Salvar'}</Box>
          </button>
          {resultado && (resultado.ok ? <Sub>{resultado.texto}</Sub>
                                      : <Box variante="alerta">{resultado.texto}</Box>)}
        </>
      )}
    </>
  );
}
