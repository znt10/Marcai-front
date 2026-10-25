'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  adminApi, mensagemDoErro, type HistoricoDaMensalidade as Historico,
  type PagamentoDoHistorico,
} from '@/lib/api';
import { formatarDiaCurto, formatarHora } from '@/lib/datas';
import { reais } from '@/lib/mensalidade';
import { NOME_DA_CATEGORIA } from '@/lib/categorias';
import { diaEMesEmBrasilia, perguntaDeRemover, rotuloDoComo } from '@/lib/historicoDaMensalidade';

const dataCurta = (iso: string) => {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
};

/// Todos os pagamentos da mensalidade de uma barbearia, do mais novo ao mais
/// velho. Remover só tira da lista: o "pago até" não muda (corrigir a data é
/// na tela de mensalidades).
export function HistoricoDaMensalidade({ barbeariaId }: { barbeariaId: string }) {
  const [h, setH] = useState<Historico | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    adminApi.historicoDaMensalidade(barbeariaId, ctrl.signal)
      .then(setH)
      .catch((e) => setErro(mensagemDoErro(e))); // aborto vira ''
    return () => ctrl.abort();
  }, [barbeariaId]);

  async function remover(p: PagamentoDoHistorico) {
    if (!confirm(perguntaDeRemover(p))) return;
    setErro(''); setOcupado(true);
    try {
      setH(await adminApi.removerPagamento(p.id));
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const tipo = h?.barbearia.tipo;
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-letreiro text-[22px] md:text-[26px] font-extrabold text-tinta">
          Histórico de mensalidade
        </span>
        <Link href="/admin/mensalidades"><Lbl>‹ mensalidades</Lbl></Link>
      </div>
      {h && (
        <Lbl>
          {h.barbearia.nome}
          {tipo && <> · {(NOME_DA_CATEGORIA[tipo] ?? tipo).toLowerCase()}</>}
        </Lbl>
      )}
      {!h && !erro && <Sub>carregando…</Sub>}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {h?.pagamentos.length === 0 && <Sub>Nenhum pagamento registrado ainda.</Sub>}
      {h?.pagamentos.map((p) => (
        <Box key={p.id} className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2 justify-between items-baseline">
            <span className="font-semibold">
              {reais(p.valorCentavos)} · {rotuloDoComo(p.como)}
            </span>
            <Chip disabled={ocupado} onClick={() => void remover(p)}>Remover</Chip>
          </div>
          <Lbl>
            {p.pagaEm
              ? `pago em ${formatarDiaCurto(new Date(p.pagaEm))} ${formatarHora(new Date(p.pagaEm))}`
              : 'sem dia do pagamento'}
            {p.pagaAteDepois && ` · pago até ${dataCurta(p.pagaAteDepois)}`}
          </Lbl>
          {p.pagaEm && diaEMesEmBrasilia(p.registradaEm) !== diaEMesEmBrasilia(p.pagaEm) && (
            <Sub>
              lançado em {formatarDiaCurto(new Date(p.registradaEm))} {formatarHora(new Date(p.registradaEm))}
            </Sub>
          )}
          {p.avisadoPor && <Sub>avisado por {p.avisadoPor}</Sub>}
          {p.observacao && <Sub>{p.observacao}</Sub>}
        </Box>
      ))}
    </>
  );
}
