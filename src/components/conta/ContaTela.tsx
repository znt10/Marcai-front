'use client';
import { useCallback, useEffect, useState } from 'react';
import { contaApi, ErroApi, mensagemDoErro } from '@/lib/api';
import type { Lugar } from '@/lib/api';
import { Historico } from './Historico';
import { PortaDaConta } from './PortaDaConta';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'fora' }
  | { tipo: 'dentro'; nome: string; lugares: Lugar[] }
  | { tipo: 'erro'; texto: string };

/// Decide entre a porta e o histórico. 401 é "não logado", não erro.
export function ContaTela() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      const eu = await contaApi.eu(signal);
      const lugares = await contaApi.historico(signal);
      if (!signal?.aborted) setEstado({ tipo: 'dentro', nome: eu.nome, lugares });
    } catch (e) {
      if (signal?.aborted) return;
      if (e instanceof ErroApi && e.status === 401) setEstado({ tipo: 'fora' });
      else setEstado({ tipo: 'erro', texto: mensagemDoErro(e) });
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    carregar(ctl.signal);
    return () => ctl.abort();
  }, [carregar]);

  async function sair() {
    try { await contaApi.sair(); } catch { /* sem sessão já é sair */ }
    setEstado({ tipo: 'fora' });
  }

  switch (estado.tipo) {
    case 'carregando': return <div className="min-h-[200px]" aria-busy />;
    case 'fora': return <PortaDaConta aoEntrar={() => carregar()} />;
    case 'erro': return <p role="alert" className="text-[13px] text-acento">{estado.texto}</p>;
    case 'dentro':
      return <Historico nome={estado.nome} lugares={estado.lugares} aoMudar={() => carregar()} aoSair={sair} />;
  }
}
