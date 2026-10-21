'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  adminApi, ignorarAborto, mensagemDoErro, type BarbeariaDaLista,
} from '@/lib/api';
import { daCategoria } from '@/lib/categorias';
import { paleta } from '@/lib/paletas';
import { vocabulario, type Tipo } from '@/lib/tipos';

/// Reexportado porque a tela do admin já importava o tipo daqui; a definição
/// mora junto das rotas, em `lib/api/adminAPI.ts`.
export type Barbearia = BarbeariaDaLista;

/// Só os da categoria em que o admin entrou (`/admin/<categoria>`). O
/// filtro é aqui, e não no back: a rota já devolve o tipo de cada um, e a
/// entrada do admin precisa da lista inteira para contar as categorias.
export function ListaBarbearias({ tipo, recarregarEm }: { tipo: Tipo; recarregarEm?: number }) {
  const [todas, setTodas] = useState<Barbearia[]>([]);
  const barbearias = daCategoria(todas, tipo);
  const v = vocabulario(tipo);
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');

  const carregar = (signal?: AbortSignal) =>
    adminApi.barbearias(signal).then(setTodas).catch(ignorarAborto);

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
      <Lbl>cadastrados</Lbl>
      {barbearias.length === 0 && <Sub>nenhum ainda</Sub>}
      {barbearias.map((b) => (
        <Box key={b.id} variante={b.ativo ? 'normal' : 'mut'}
             className="flex flex-wrap gap-2 justify-between items-center">
          <span>
            {b.nome} · <span className="text-lbl">{b.slug}</span>
            {' '}· <span className="text-lbl">{paleta(b.paleta).nome.toLowerCase()}</span>
          </span>
          <Lbl>
            {b.barbeiros} {b.barbeiros === 1 ? v.prof : v.profs}
            {' · '}{b.agendamentos} {b.agendamentos === 1 ? 'agendamento' : 'agendamentos'}
          </Lbl>
          <div className="flex gap-2 flex-wrap">
            <Chip onClick={() => alternar(b)}>{b.ativo ? 'desativar' : 'reativar'}</Chip>
            <Chip acento onClick={() => reemitir(b)}>novo convite</Chip>
          </div>
          <CidadeDoPix b={b} aoSalvar={() => void carregar()} aoFalhar={setErro} />
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {link && (
        <Box variante="copia" className="break-all">
          <Sub>manda esse link pro dono — ele só aparece uma vez</Sub>
          {link}
        </Box>
      )}
      <Sub>desativar leva até um minuto para tirar do ar</Sub>
    </>
  );
}

/// A cidade que vai no copia e cola do Pix (BR Code). Vazia, o back usa
/// "BRASIL": os bancos não conferem a cidade de um Pix estático.
function CidadeDoPix({ b, aoSalvar, aoFalhar }: {
  b: Barbearia; aoSalvar: () => void; aoFalhar: (msg: string) => void;
}) {
  const [cidade, setCidade] = useState(b.cidade ?? '');
  const [salvando, setSalvando] = useState(false);
  const mudou = cidade.trim() !== (b.cidade ?? '');

  async function salvar() {
    setSalvando(true); aoFalhar('');
    try {
      await adminApi.mudarCidade(b.id, cidade.trim());
      aoSalvar();
    } catch (e) {
      aoFalhar(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex w-full items-center gap-2">
      <label htmlFor={`cidade-${b.id}`}><Lbl>cidade do pix</Lbl></label>
      <input id={`cidade-${b.id}`} value={cidade} maxLength={40} placeholder="BRASIL"
             onChange={(e) => setCidade(e.target.value)}
             className="min-w-0 flex-1 rounded-[8px] border border-borda bg-transparent px-2 py-1 text-tinta" />
      <Chip disabled={!mudou || salvando} onClick={salvar}>{salvando ? 'salvando…' : 'salvar'}</Chip>
    </div>
  );
}
