'use client';
import { useCallback, useEffect, useState } from 'react';
import { Cartao, BotaoVazado, Texto } from '@/components/painel/pecas';
import { formatar } from '@/lib/telefone';
import {
  equipeApi, ignorarAborto, mensagemDoErro, type MembroDaEquipe,
} from '@/lib/api';
import { useVocabulario } from '@/components/Vocabulario';

/// Os avisos que explicam por que alguém não recebe cliente. O design da
/// Etapa 1 pediu isso em destaque: barbeiro sem serviço ou sem expediente
/// desaparece da tela do cliente EM SILÊNCIO, e sem o aviso o dono não entende
/// por que o funcionário novo não recebe ninguém.
function avisosDe(m: MembroDaEquipe): string[] {
  const avisos: string[] = [];
  if (!m.temSenha) avisos.push(m.conviteExpirado ? 'convite expirado' : 'sem senha ainda');
  if (m.servicos === 0) avisos.push('sem serviço — não aparece para o cliente');
  if (m.expediente === 0) avisos.push('sem expediente — não aparece para o cliente');
  return avisos;
}

export function Equipe({ recarregarEm, euId }: { recarregarEm?: number; euId?: string }) {
  const v = useVocabulario();
  const [equipe, setEquipe] = useState<MembroDaEquipe[] | null>(null);
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');
  // Fechado ao abrir a tela, como a gaveta de serviços: arquivado é consulta
  // ocasional, não o trabalho do dia.
  const [verArquivados, setVerArquivados] = useState(false);

  /// O erro da CARGA precisa virar texto na tela, não rejeição solta: sem
  /// isto, um 403 (barbeiro abrindo a rota na unha) ou um 500 deixavam
  /// `equipe` em null e a tela em "carregando…" para sempre, sem dizer nada.
  const carregar = useCallback((signal?: AbortSignal) =>
    equipeApi.listar(signal)
      .then((lista) => { setEquipe(lista); setErro(''); })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        setEquipe([]);
        setErro(mensagemDoErro(e));
      }), []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [recarregarEm, carregar]);

  /// Toda ação passa por aqui: a recusa (409) da rota vira o texto do erro sem
  /// tradução, porque as três mensagens já foram escritas para o dono ler.
  async function agir(acao: () => Promise<unknown>) {
    setErro(''); setLink('');
    try {
      await acao();
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  const ativos = equipe?.filter((m) => m.ativo) ?? [];
  const arquivados = equipe?.filter((m) => !m.ativo) ?? [];

  function cartao(m: MembroDaEquipe) {
    return (
      <Cartao key={m.id} variante={m.ativo ? 'normal' : 'mut'}
              className="flex flex-col gap-2 px-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14.5px] font-bold text-tinta">
            {m.nome}
            {m.id === euId && <span className="text-lbl"> (você)</span>}
          </span>
          <span className="shrink-0 font-dado text-[11px] text-sub">
            {m.papel === 'DONO' ? 'dono' : v.prof}
          </span>
        </div>

        <span className="text-[12px] font-medium text-sub">
          {m.ativo && m.agendamentosFuturos > 0
            ? `${m.agendamentosFuturos} ${m.agendamentosFuturos === 1 ? 'horário marcado' : 'horários marcados'} · `
            : ''}
          {formatar(m.whatsapp)}
        </span>

        {/* No arquivo os avisos não servem: quem está ali já não recebe
            cliente de propósito. */}
        {m.ativo && avisosDe(m).map((a) => (
          <span key={a} className="text-[12px] font-medium text-acento">{a}</span>
        ))}

        {/* Os botões dividem a linha em partes iguais, como no desenho:
            são ações do mesmo peso, e uma delas mais larga que as outras
            leria como a principal. No arquivo sobra só "reativar" (e
            "apagar", quando dá): o servidor recusa convite a quem está
            arquivado, e promover quem não trabalha mais não faz sentido. */}
        <div className="flex gap-2 pt-0.5">
          {m.ativo && (
            <BotaoVazado className="flex-1"
                         onClick={() => agir(async () =>
                           setLink((await equipeApi.reemitirConvite(m.id)).linkConvite))}>
              novo convite
            </BotaoVazado>
          )}
          {/* Não na própria linha: rebaixar a si mesmo é permitido pela
              regra (havendo outro dono) e incrementa o tokenVersion — um
              clique sem confirmação mataria a sua própria sessão. É o mesmo
              cuidado que o servidor tem em `ehEuMesmo` para desativar. */}
          {m.ativo && m.id !== euId && (
            <BotaoVazado className="flex-1"
                         onClick={() => agir(() => equipeApi.editar(m.id, {
                           papel: m.papel === 'DONO' ? 'BARBEIRO' : 'DONO',
                         }))}>
              {m.papel === 'DONO' ? 'rebaixar' : 'promover'}
            </BotaoVazado>
          )}
          {m.ativo
            ? <BotaoVazado className="flex-1"
                           onClick={() => agir(() => equipeApi.desativar(m.id))}>
                arquivar
              </BotaoVazado>
            : <BotaoVazado className="flex-1"
                           onClick={() => agir(() => equipeApi.reativar(m.id))}>
                reativar
              </BotaoVazado>}
        </div>
        {/* Linha própria, e não um quarto botão: ao lado dos outros três
            ficaria espremido no celular, e é a única ação sem volta. */}
        {m.podeApagar && m.id !== euId && (
          <BotaoVazado onClick={() => {
            if (!confirm(`Apagar ${m.nome} da equipe? Não tem como desfazer — se foi o celular errado, depois é só cadastrar de novo.`)) return;
            void agir(() => equipeApi.apagar(m.id));
          }}>
            apagar cadastro
          </BotaoVazado>
        )}
      </Cartao>
    );
  }

  return (
    <>
      {equipe === null && <Texto>carregando…</Texto>}

      {ativos.map(cartao)}

      {/* Quem saiu da equipe (o "desativar" do servidor) sai da lista
          principal e fica AQUI, fechado — o mesmo desenho da gaveta de
          serviços. Arquivado, e não apagado: quem já teve horário marcado
          guarda o histórico dos clientes, e só o cadastro nunca usado pode
          sumir de vez (ver `podeApagar`). */}
      {arquivados.length > 0 && (
        <>
          <button onClick={() => setVerArquivados((x) => !x)}
                  aria-expanded={verArquivados}
                  className="flex items-center gap-2 self-start text-left text-[12px]
                             font-semibold text-lbl hover:text-acento">
            <span aria-hidden className={verArquivados ? 'rotate-90' : ''}>›</span>
            {arquivados.length === 1 ? '1 arquivado' : `${arquivados.length} arquivados`}
          </button>
          {verArquivados && (
            <>
              <Texto>
                Não aparecem para o cliente nem entram no painel. Ficam
                guardados aqui com o histórico; reativar traz de volta.
              </Texto>
              {arquivados.map(cartao)}
            </>
          )}
        </>
      )}

      {erro && <Texto className="text-acento">{erro}</Texto>}
      {link && (
        <Cartao className="flex flex-col gap-1 break-all">
          <Texto>manda esse link — ele só aparece uma vez</Texto>
          <span className="font-dado text-[11px] text-sub">{link}</span>
        </Cartao>
      )}
      <Texto>Trocar o celular ou o papel de alguém derruba a sessão dessa pessoa.</Texto>
    </>
  );
}
