'use client';
import { useCallback, useEffect, useState } from 'react';
import { Cartao, BotaoVazado, Texto, Titulo } from '@/components/painel/pecas';
import { formatar } from '@/lib/telefone';
import { clientesApi, mensagemDoErro, type ClienteBloqueado } from '@/lib/api';

/// Quem a equipe bloqueou (spec 2026-10-13). Só o dono vê esta lista e só
/// ele desbloqueia; bloquear é pela Agenda. Desbloquear libera o número e o
/// aparelho na hora, mas os horários cancelados no bloqueio não voltam.
const quando = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export function ClientesBloqueados() {
  const [lista, setLista] = useState<ClienteBloqueado[] | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback((signal?: AbortSignal) =>
    clientesApi.bloqueados(signal)
      .then((l) => { setLista(l); setErro(''); })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        setLista([]);
        setErro(mensagemDoErro(e));
      }), []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  async function desbloquear(c: ClienteBloqueado) {
    if (!confirm(`Desbloquear ${c.nome}? O número volta a conseguir marcar pelo site.`)) return;
    try {
      await clientesApi.desbloquear(c.id);
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <Titulo>Clientes bloqueados</Titulo>
      {lista === null && <Texto>carregando…</Texto>}
      {erro && <Texto className="text-acento">{erro}</Texto>}
      {lista?.length === 0 && !erro && (
        <Texto>Ninguém bloqueado. Para bloquear, use o botão na Agenda.</Texto>
      )}
      {lista?.map((c) => (
        <Cartao key={c.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-tinta">{c.nome}</div>
              <div className="text-[12.5px] text-sub">
                {formatar(c.whatsapp)} · {c.bloqueadoPor ? `por ${c.bloqueadoPor}, ` : ''}
                em {quando(c.bloqueadoEm)}
              </div>
            </div>
            <BotaoVazado onClick={() => desbloquear(c)}>desbloquear</BotaoVazado>
          </div>
        </Cartao>
      ))}
    </section>
  );
}
