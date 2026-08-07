'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
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

  const carregar = useCallback((signal?: AbortSignal) =>
    equipeApi.listar(signal).then(setEquipe).catch(ignorarAborto), []);

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
      <Lbl>equipe</Lbl>
      {equipe === null && <Sub>carregando…</Sub>}

      {equipe?.map((m) => (
        <Box key={m.id} variante={m.ativo ? 'normal' : 'mut'}>
          <div className="flex flex-wrap gap-2 justify-between items-baseline">
            <span>
              {m.nome}
              {m.id === euId && <span className="text-lbl"> (você)</span>}
            </span>
            <Lbl>{m.papel === 'DONO' ? 'dono' : 'barbeiro'} · {formatar(m.whatsapp)}</Lbl>
          </div>

          {avisosDe(m).map((a) => <Sub key={a} className="text-acento">{a}</Sub>)}
          {!m.ativo && <Sub>desativado</Sub>}
          {m.ativo && m.agendamentosFuturos > 0 && (
            <Sub>{m.agendamentosFuturos} horário(s) marcado(s)</Sub>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Chip onClick={() => agir(async () =>
              setLink((await equipeApi.reemitirConvite(m.id)).linkConvite))}>
              novo convite
            </Chip>
            <Chip onClick={() => agir(() => equipeApi.editar(m.id, {
              papel: m.papel === 'DONO' ? 'BARBEIRO' : 'DONO',
            }))}>
              {m.papel === 'DONO' ? 'rebaixar' : 'promover'}
            </Chip>
            {m.ativo
              ? <Chip acento onClick={() => agir(() => equipeApi.desativar(m.id))}>desativar</Chip>
              : <Chip onClick={() => agir(() => equipeApi.reativar(m.id))}>reativar</Chip>}
          </div>
        </Box>
      ))}

      {erro && <Sub className="text-acento">{erro}</Sub>}
      {link && (
        <Box variante="dash" className="break-all">
          <Lbl>manda esse link — ele só aparece uma vez</Lbl>
          {link}
        </Box>
      )}
      <Lbl>trocar o celular ou o papel derruba a sessão daquela pessoa</Lbl>
    </>
  );
}
