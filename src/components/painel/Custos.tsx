'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { BotaoCheio, BotaoVazado } from '@/components/painel/pecas';
import { custosApi, mensagemDoErro, type Custo } from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';

/// A caixa de custos do Resumo: um nome que pode ficar em branco e o valor,
/// que é obrigatório. Sem campo de data (decisão do dono) — o custo vale no
/// dia em que foi lançado. Só registro: nada aqui sai do faturamento.
const quando = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

const CAMPO = 'w-full border-b border-borda bg-transparent py-2 text-[15px] text-tinta '
  + 'outline-none focus:border-acento placeholder:text-lbl';

export function Custos({ de, ate }: { de: string; ate: string }) {
  const [lista, setLista] = useState<Custo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback((signal?: AbortSignal) =>
    custosApi.listar(de, ate, signal)
      .then((r) => { setLista(r.custos); setTotal(r.totalCentavos); setErro(''); })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        setLista([]);
        setErro(mensagemDoErro(e));
      }), [de, ate]);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  // Aceita "45,90" e "45.90": no celular o teclado decimal mostra vírgula.
  const centavos = Math.round(Number(valor.replace(',', '.')) * 100);
  const valido = valor.trim() !== '' && Number.isFinite(centavos) && centavos > 0;

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || salvando) return;
    setSalvando(true);
    try {
      await custosApi.lancar({ nome: nome.trim() || undefined, valorCentavos: centavos });
      setNome('');
      setValor('');
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(c: Custo) {
    if (!confirm(`Apagar ${c.nome ?? 'este custo'} de ${formatarPreco(c.valorCentavos)}?`)) return;
    try {
      await custosApi.apagar(c.id);
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return (
    <section className="mt-4 flex flex-col gap-2">
      <h2 className="font-letreiro uppercase tracking-[0.06em]">Custos</h2>

      {/* O total em cima do formulário: é o que o dono quer ver de relance,
          antes de lançar o próximo. */}
      {lista && (
        <Box variante="mut">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-letreiro uppercase tracking-[0.06em]">total no período</span>
            <span className="font-dado text-base tabular-nums md:text-lg">{formatarPreco(total)}</span>
          </div>
        </Box>
      )}

      <Box>
        <form onSubmit={lancar} className="flex flex-col gap-3">
          <label className="flex flex-col gap-0.5">
            <Lbl>nome (se quiser)</Lbl>
            <input className={CAMPO} value={nome} maxLength={80}
                   placeholder="ex.: lâminas, luz, aluguel"
                   onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5">
            <Lbl>valor</Lbl>
            <span className="flex items-baseline gap-1 font-dado text-[15px] text-tinta">
              R$
              <input className={CAMPO} required inputMode="decimal" placeholder="0,00"
                     value={valor} onChange={(e) => setValor(e.target.value)} />
            </span>
          </label>
          <BotaoCheio type="submit" largura="cheia" disabled={!valido || salvando}>
            {salvando ? 'lançando…' : '+ lançar custo'}
          </BotaoCheio>
        </form>
      </Box>

      {erro && <Sub className="text-acento">{erro}</Sub>}
      {lista === null && !erro && <Sub>carregando…</Sub>}
      {lista?.length === 0 && !erro && <Sub>Nenhum custo lançado no período.</Sub>}

      {lista?.map((c) => (
        <Box key={c.id}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate">{c.nome ?? 'Sem nome'}</div>
              <Sub>{quando(c.criadoEm)}</Sub>
            </div>
            <span className="shrink-0 font-dado tabular-nums">{formatarPreco(c.valorCentavos)}</span>
            <BotaoVazado onClick={() => apagar(c)}>apagar</BotaoVazado>
          </div>
        </Box>
      ))}
    </section>
  );
}
