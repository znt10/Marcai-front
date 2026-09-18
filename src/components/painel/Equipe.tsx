'use client';
import { useCallback, useEffect, useState } from 'react';
import { Cartao, BotaoVazado, Texto } from '@/components/painel/pecas';
import { formatar } from '@/lib/telefone';
import {
  equipeApi, ignorarAborto, mensagemDoErro, type MembroDaEquipe,
} from '@/lib/api';

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
  const [equipe, setEquipe] = useState<MembroDaEquipe[] | null>(null);
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');

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

  return (
    <>
      {equipe === null && <Texto>carregando…</Texto>}

      {equipe?.map((m) => (
        <Cartao key={m.id} variante={m.ativo ? 'normal' : 'mut'}
                className="flex flex-col gap-2 px-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[14.5px] font-bold text-tinta">
              {m.nome}
              {m.id === euId && <span className="text-lbl"> (você)</span>}
            </span>
            <span className="shrink-0 font-dado text-[11px] text-sub">
              {m.papel === 'DONO' ? 'dono' : 'barbeiro'}
            </span>
          </div>

          <span className="text-[12px] font-medium text-sub">
            {m.ativo && m.agendamentosFuturos > 0
              ? `${m.agendamentosFuturos} ${m.agendamentosFuturos === 1 ? 'horário marcado' : 'horários marcados'} · `
              : ''}
            {formatar(m.whatsapp)}
          </span>

          {avisosDe(m).map((a) => (
            <span key={a} className="text-[12px] font-medium text-acento">{a}</span>
          ))}
          {!m.ativo && <Texto>desativado</Texto>}

          {/* Os três botões dividem a linha em partes iguais, como no desenho:
              são ações do mesmo peso, e uma delas mais larga que as outras
              leria como a principal. */}
          <div className="flex gap-2 pt-0.5">
            <BotaoVazado className="flex-1"
                         onClick={() => agir(async () =>
                           setLink((await equipeApi.reemitirConvite(m.id)).linkConvite))}>
              novo convite
            </BotaoVazado>
            {/* Não na própria linha: rebaixar a si mesmo é permitido pela
                regra (havendo outro dono) e incrementa o tokenVersion — um
                clique sem confirmação mataria a sua própria sessão. É o mesmo
                cuidado que o servidor tem em `ehEuMesmo` para desativar. */}
            {m.id !== euId && (
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
                  desativar
                </BotaoVazado>
              : <BotaoVazado className="flex-1"
                             onClick={() => agir(() => equipeApi.reativar(m.id))}>
                  reativar
                </BotaoVazado>}
          </div>
        </Cartao>
      ))}

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
