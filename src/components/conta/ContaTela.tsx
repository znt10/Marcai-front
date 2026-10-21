'use client';
import { useCallback, useEffect, useState } from 'react';
import { contaApi, ErroApi, mensagemDoErro } from '@/lib/api';
import type { Lugar } from '@/lib/api';
import { Historico } from './Historico';
import { EVENTO_CONTA } from '@/lib/conta';
import { PortaDaConta } from './PortaDaConta';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'fora' }
  | { tipo: 'dentro'; nome: string; lugares: Lugar[] }
  | { tipo: 'erro'; texto: string };

/// Decide entre a porta e o histórico. 401 é "não logado", não erro.
export function ContaTela() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  /// Devolve `true` quando a conta carregou (logado).
  const carregar = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    try {
      const eu = await contaApi.eu(signal);
      const lugares = await contaApi.historico(signal);
      if (!signal?.aborted) setEstado({ tipo: 'dentro', nome: eu.nome, lugares });
      return true;
    } catch (e) {
      if (signal?.aborted) return false;
      if (e instanceof ErroApi && e.status === 401) setEstado({ tipo: 'fora' });
      else setEstado({ tipo: 'erro', texto: mensagemDoErro(e) });
      return false;
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    carregar(ctl.signal);
    return () => ctl.abort();
  }, [carregar]);

  async function sair() {
    // Se o sair falhar a sessão segue de pé: mostra o erro, não a porta.
    try { await contaApi.sair(); } catch (e) {
      setEstado({ tipo: 'erro', texto: mensagemDoErro(e) });
      return;
    }
    setEstado({ tipo: 'fora' });
    window.dispatchEvent(new Event(EVENTO_CONTA));
  }

  switch (estado.tipo) {
    case 'carregando': return <div className="min-h-[200px]" aria-busy />;
    // Entrou ou confirmou o código: volta para a página do lugar (pedido de
    // 21/10/2026), onde o botão do topo já mostra a inicial. Carregamento
    // inteiro, como todo link do fluxo do cliente.
    case 'fora': return <PortaDaConta aoEntrar={async () => {
      const ok = await carregar();
      if (ok) window.location.assign('/');
      return ok;
    }} />;
    case 'erro': return <p role="alert" className="text-[13px] text-acento">{estado.texto}</p>;
    case 'dentro':
      return <Historico nome={estado.nome} lugares={estado.lugares} aoMudar={() => carregar()} aoSair={sair} />;
  }
}
