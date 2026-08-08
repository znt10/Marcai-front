'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  adminApi, ignorarAborto, mensagemDoErro, type BarbeariaDaLista,
} from '@/lib/api';

/// Reexportado porque a tela do admin já importava o tipo daqui; a definição
/// mora junto das rotas, em `lib/api/adminAPI.ts`.
export type Barbearia = BarbeariaDaLista;

export function ListaBarbearias({ recarregarEm }: { recarregarEm?: number }) {
  const [barbearias, setBarbearias] = useState<Barbearia[]>([]);
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');

  const carregar = (signal?: AbortSignal) =>
    adminApi.barbearias(signal).then(setBarbearias).catch(ignorarAborto);

  // Aborta na limpeza: criar duas barbearias em seguida muda `recarregarEm`
  // duas vezes, e a resposta da primeira busca chegando depois da segunda
  // deixaria a lista sem a barbearia recém-criada.
  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [recarregarEm]);

  async function alternar(b: Barbearia) {
    setErro('');
    try {
      await adminApi.alternarAtivo(b.id, !b.ativo);
      void carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  async function reemitir(b: Barbearia) {
    setErro(''); setLink('');
    try {
      setLink((await adminApi.reemitirConvite(b.id)).linkConvite);
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return (
    <>
      <Lbl>barbearias</Lbl>
      {barbearias.length === 0 && <Sub>nenhuma ainda</Sub>}
      {barbearias.map((b) => (
        <Box key={b.id} variante={b.ativo ? 'normal' : 'mut'}
             className="flex flex-wrap gap-2 justify-between items-center">
          <span>{b.nome} · <span className="text-lbl">{b.slug}</span></span>
          <Lbl>{b.barbeiros} barbeiros · {b.agendamentos} agendamentos</Lbl>
          <div className="flex gap-2">
            <Chip onClick={() => alternar(b)}>{b.ativo ? 'desativar' : 'reativar'}</Chip>
            <Chip acento onClick={() => reemitir(b)}>novo convite</Chip>
          </div>
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {link && (
        <Box variante="copia" className="break-all">
          <Sub>manda esse link pro dono — ele só aparece uma vez</Sub>
          {link}
        </Box>
      )}
      <Sub>desativar leva até um minuto para tirar a barbearia do ar</Sub>
    </>
  );
}
