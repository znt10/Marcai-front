'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';
import { painelApi, ignorarAborto, type Eu, type ItemDaAgenda } from '@/lib/api';

/// `sv-SE` porque é o locale que formata como YYYY-MM-DD — o formato que a
/// rota espera — sem passar por UTC e cair no dia anterior.
const hoje = () => new Date().toLocaleDateString('sv-SE');
const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function AgendaDoDia() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [dia, setDia] = useState(hoje());
  const [itens, setItens] = useState<ItemDaAgenda[] | null>(null);

  /// Toda busca leva um `signal`, e todo efeito aborta ao sair. Sem isso,
  /// trocar de dia rápido deixa duas requisições no ar e quem responde por
  /// último pinta a tela: o cabeçalho diz 7 e a lista é do dia 6.
  ///
  /// É também o que faz o StrictMode do desenvolvimento parar de duplicar
  /// requisição — ele monta, desmonta e remonta de propósito justamente para
  /// expor efeito sem limpeza.
  const carregar = useCallback(async (d: string, signal?: AbortSignal) => {
    setItens(null);
    try {
      setItens((await painelApi.agenda(d, undefined, signal)).itens);
    } catch (e) {
      ignorarAborto(e);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    painelApi.eu(ctrl.signal).then(setEu).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(dia, ctrl.signal);
    return () => ctrl.abort();
  }, [dia, carregar]);

  async function cancelar(item: ItemDaAgenda) {
    if (!confirm(`Cancelar o horário de ${item.clienteNome} às ${hora(item.inicio)}?`)) return;
    await painelApi.cancelar(item.id);
    void carregar(dia);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, -1))}>←</Box>
        <Lbl>{dia === hoje() ? 'hoje' : dia}</Lbl>
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, 1))}>→</Box>
      </div>

      {itens === null && <Sub>carregando…</Sub>}
      {itens?.length === 0 && <Sub>nenhum horário marcado neste dia.</Sub>}

      {itens?.map((i) => (
        <Box key={i.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span><span className="font-dado">{hora(i.inicio)}</span> · {i.clienteNome}</span>
            <Sub>{i.servicoNome}</Sub>
          </div>
          {/* O nome do barbeiro só faz sentido para quem vê a agenda de mais
              de um: para o barbeiro, seria a mesma linha o dia inteiro. */}
          {eu?.papel === 'DONO' && <Sub>{i.barbeiroNome}</Sub>}
          <Sep />
          <div className="flex gap-3">
            <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer">
              <Sub>whatsapp</Sub>
            </a>
            <button onClick={() => cancelar(i)}>
              <Sub className="text-acento">cancelar</Sub>
            </button>
          </div>
        </Box>
      ))}

      <a href="/painel/novo"><Box variante="fill">+ marcar na mão</Box></a>
      {/* O barbeiro não vê o link. A segurança está no 403 da rota; isto é não
          oferecer o que vai ser negado. */}
      {/* Horários e serviços são para todos: cada um mexe no que é seu. */}
      {/* O quadro também: para o dono é a equipe lado a lado, para o barbeiro
          é a própria coluna com o "próximo livre" que esta tela não mostra. */}
      <a href="/painel/dia"><Box>quadro do dia</Box></a>
      <a href="/painel/horarios"><Box>meus horários</Box></a>
      <a href="/painel/servicos"><Box>meus serviços</Box></a>
      {eu?.papel === 'DONO' && <a href="/painel/equipe"><Box>equipe</Box></a>}
    </>
  );
}
