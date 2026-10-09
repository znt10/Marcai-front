'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WhatsappCentral } from '@/components/admin/WhatsappCentral';
import { Box, Sep, Lbl, Sub } from '@/components/wf';
import {
  adminApi, ignorarAborto, origemDoTenant, LOGIN_DO_ADMIN, type BarbeariaDaLista,
} from '@/lib/api';
import { NOME_DA_CATEGORIA, daCategoria, slugDaCategoria } from '@/lib/categorias';
import { TIPOS } from '@/lib/tipos';

/// A ENTRADA do admin (pedido de 09/10/2026): o que é de todos (o número
/// central do WhatsApp) e um cartão por categoria. A lista e o formulário de
/// criar moram dentro de cada categoria (`/admin/<categoria>`).
export default function Admin() {
  // Só para contar quantos cada categoria tem. `null` enquanto carrega: um
  // "nenhum ainda" piscando antes da resposta seria mentira.
  const [todas, setTodas] = useState<BarbeariaDaLista[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    adminApi.barbearias(ctrl.signal).then(setTodas).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  // O admin do Django mora no DJANGO — outra porta (8000), não esta (3000).
  // Sem este link ele existia sem ter entrada: funcionava, respondia, e a
  // única forma de chegar lá era digitar `admin.<domínio>:8000/admin/django/`
  // de cabeça. Foi assim que ele passou por "desativado" mesmo ligado.
  //
  // Em efeito, e não no `useState`: `origemDoTenant()` lê `window.location`,
  // que não existe quando o Next renderiza este Client Component no servidor.
  // Vazio até o efeito rodar, e o link só aparece depois — é um clique numa
  // tela que já exigiu login, não a primeira pintura de nada.
  const [urlDoDjango, setUrlDoDjango] = useState('');
  useEffect(() => { setUrlDoDjango(`${origemDoTenant()}/admin/django/`); }, []);

  async function sair() {
    await adminApi.sair();
    window.location.href = LOGIN_DO_ADMIN;
  }

  return (
    <>
      <WhatsappCentral />
      <Sep />
      <Lbl>categorias</Lbl>
      {/* Uma por tipo, na ordem de `TIPOS`: tipo novo no código vira cartão
          novo aqui sem mexer nesta tela. */}
      {TIPOS.map((t) => {
        const n = todas ? daCategoria(todas, t).length : null;
        return (
          <Link key={t} href={`/admin/${slugDaCategoria(t)}`}>
            <Box className="flex items-baseline justify-between hover:border-acento">
              <span className="font-letreiro text-[17px] md:text-[19px] font-bold text-tinta">
                {NOME_DA_CATEGORIA[t]}
              </span>
              <Sub>
                {n === null ? '…' : n === 0 ? 'nenhum ainda' : n === 1 ? '1 cadastrado' : `${n} cadastrados`} ›
              </Sub>
            </Box>
          </Link>
        );
      })}
      <Sep />
      <div className="flex justify-between items-baseline text-[10px] md:text-xs text-lbl">
        {/* `<a>` e não `<Link>`, a mesma exceção de `Confirmado`: isto SAI do
            app Next e vai para uma página servida pelo Django, noutra porta.
            Um `<Link>` tentaria navegar por dentro e daria 404. */}
        {urlDoDjango
          ? <a href={urlDoDjango}><Lbl>admin do django ›</Lbl></a>
          : <span />}
        <span className="cursor-pointer" onClick={sair}><Lbl>sair</Lbl></span>
      </div>
    </>
  );
}
