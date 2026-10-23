'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  adminApi, mensagemDoErro, type LinhaDaMensalidade,
} from '@/lib/api';
import { formatarDiaCurto, formatarHora } from '@/lib/datas';
import { reais } from '@/lib/mensalidade';
import {
  centavosDoTexto, ordenarMensalidades, rotuloDaSituacao,
} from '@/lib/ordemDasMensalidades';
import { NOME_DA_CATEGORIA } from '@/lib/categorias';

const dataCurta = (iso: string) => {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}`;
};

/// `centavos` em reais para o campo de texto: 4990 → "49,90".
const emReais = (centavos: number | null) =>
  centavos == null ? '' : (centavos / 100).toFixed(2).replace('.', ',');

/// A tela de mensalidades da plataforma: quem está em dia, quem avisou que
/// pagou e quem vai ser (ou já foi) bloqueado.
export function Mensalidades() {
  const [linhas, setLinhas] = useState<LinhaDaMensalidade[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    adminApi.mensalidades(ctrl.signal)
      // Ordena UMA vez. Depois cada ação só troca a linha no mesmo lugar: a
      // linha confirmada não pode pular debaixo do ponteiro.
      .then((d) => setLinhas(ordenarMensalidades(d.barbearias)))
      .catch((e) => setErro(mensagemDoErro(e))); // aborto vira ''
    return () => ctrl.abort();
  }, []);

  const trocar = (nova: LinhaDaMensalidade) =>
    setLinhas((atuais) => atuais && atuais.map((l) => (l.barbeariaId === nova.barbeariaId ? nova : l)));

  // Contados aqui, a partir das linhas: depois de uma ação os números do topo
  // acompanham sem outra ida ao servidor.
  const lista = linhas ?? [];
  const informadas = lista.filter((l) => l.informada).length;
  const atrasadas = lista.filter((l) => l.situacao === 'ATRASADA').length;
  const bloqueadas = lista.filter((l) => l.situacao === 'BLOQUEADA').length;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-letreiro text-[22px] md:text-[26px] font-extrabold text-tinta">
          Mensalidades
        </span>
        <Link href="/admin"><Lbl>‹ início</Lbl></Link>
      </div>
      {/* Texto, e não `Chip`: são números, não filtros — um chip desabilitado
          parecia um botão quebrado. */}
      {linhas && (
        <Lbl>
          <span className={informadas > 0 ? 'font-semibold text-acento' : ''}>
            {informadas} {informadas === 1 ? 'avisou que pagou' : 'avisaram que pagaram'}
          </span>
          {' · '}{atrasadas} {atrasadas === 1 ? 'atrasada' : 'atrasadas'}
          {' · '}{bloqueadas} {bloqueadas === 1 ? 'bloqueada' : 'bloqueadas'}
        </Lbl>
      )}
      {!linhas && !erro && <Sub>carregando…</Sub>}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      {linhas?.length === 0 && <Sub>nenhuma barbearia ainda</Sub>}
      {lista.map((l) => <Linha key={l.barbeariaId} linha={l} aoMudar={trocar} />)}
    </>
  );
}

function Linha({ linha: l, aoMudar }: {
  linha: LinhaDaMensalidade; aoMudar: (l: LinhaDaMensalidade) => void;
}) {
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [valor, setValor] = useState(emReais(l.valorCentavos));
  const [registrando, setRegistrando] = useState(false);
  const [pagaAte, setPagaAte] = useState('');
  const [valorPago, setValorPago] = useState(emReais(l.valorCentavos));
  const [obs, setObs] = useState('');
  const [novaData, setNovaData] = useState(l.pagaAte ?? '');

  /// Toda ação: erro limpo, um clique por vez, linha trocada pela devolvida.
  async function agir(acao: () => Promise<LinhaDaMensalidade>): Promise<boolean> {
    setErro(''); setOcupado(true);
    try {
      const nova = await acao();
      aoMudar(nova);
      // Tirar a isenção, registrar ou confirmar também movem a data.
      setNovaData(nova.pagaAte ?? '');
      return true;
    } catch (e) {
      setErro(mensagemDoErro(e));
      return false;
    } finally {
      setOcupado(false);
    }
  }

  function salvarValor() {
    const c = centavosDoTexto(valor);
    if (c === null) { setErro('Valor inválido. Use algo como 49,90.'); return; }
    void agir(() => adminApi.ajustarMensalidade(l.barbeariaId, { valorCentavos: c }));
  }

  /// Mover o "pago até" sem registrar pagamento: corrigir um erro, dar uns
  /// dias, ou dizer de quando começa a cobrança de quem era isenta. A cobrança
  /// aberta (mesmo avisada) cai no back: o ciclo dela acabou.
  function salvarData() {
    if (!novaData) { setErro('Escolha até que dia está pago.'); return; }
    void agir(() => adminApi.ajustarMensalidade(l.barbeariaId, { pagaAte: novaData }));
  }

  async function registrar() {
    const c = centavosDoTexto(valorPago);
    if (c === null || c <= 0) { setErro('Valor inválido. Use algo como 49,90.'); return; }
    if (!pagaAte) { setErro('Escolha até que dia está pago.'); return; }
    const ok = await agir(() => adminApi.registrarPagamento(l.barbeariaId, {
      pagaAte, valorCentavos: c, ...(obs.trim() && { observacao: obs.trim() }),
    }));
    if (ok) { setRegistrando(false); setPagaAte(''); setObs(''); }
  }

  const inativa = !l.ativo || l.situacao === 'DESATIVADA';
  const campo = 'border border-borda rounded-wf bg-transparent px-2 py-1 outline-none';

  return (
    <Box variante={inativa ? 'mut' : l.informada ? 'alerta' : 'normal'} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 justify-between items-baseline">
        <span>
          {l.nome}
          {l.tipo && <> · <span className="text-lbl">{(NOME_DA_CATEGORIA[l.tipo] ?? l.tipo).toLowerCase()}</span></>}
        </span>
        <span className="font-semibold">{rotuloDaSituacao(l)}</span>
      </div>
      <Lbl>
        {l.valorCentavos != null ? `${reais(l.valorCentavos)}/mês` : 'sem valor'}
        {l.pagaAte && ` · pago até ${dataCurta(l.pagaAte)}`}
      </Lbl>

      {l.informada && (
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <span>
            {l.informada.porNome ?? 'o dono'} avisou que pagou {reais(l.informada.valorCentavos)} em{' '}
            {formatarDiaCurto(new Date(l.informada.em))} {formatarHora(new Date(l.informada.em))}
          </span>
          <div className="flex gap-2">
            <Chip acento disabled={ocupado}
                  onClick={() => void agir(() => adminApi.confirmarCobranca(l.informada!.cobrancaId))}>
              Confirmar
            </Chip>
            <Chip disabled={ocupado}
                  onClick={() => void agir(() => adminApi.recusarCobranca(l.informada!.cobrancaId))}>
              Recusar
            </Chip>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input className={`${campo} w-24`} inputMode="decimal" aria-label={`Valor da mensalidade de ${l.nome}`}
               value={valor} onChange={(e) => setValor(e.target.value)} />
        <Chip disabled={ocupado} onClick={salvarValor}>salvar valor</Chip>
        <Chip ativo={l.isenta} disabled={ocupado}
              onClick={() => void agir(() => adminApi.ajustarMensalidade(l.barbeariaId, { isenta: !l.isenta }))}>
          Isenta
        </Chip>
        <Chip ativo={l.nuncaBloquear} disabled={ocupado}
              onClick={() => void agir(() => adminApi.ajustarMensalidade(l.barbeariaId, { nuncaBloquear: !l.nuncaBloquear }))}>
          Nunca bloquear
        </Chip>
        <Chip ativo={registrando} onClick={() => setRegistrando((v) => !v)}>Registrar pagamento</Chip>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-1"><Lbl>pago até</Lbl>
          <input type="date" className={campo} value={novaData} aria-label={`Pago até, de ${l.nome}`}
                 onChange={(e) => setNovaData(e.target.value)} />
        </label>
        <Chip disabled={ocupado || !novaData || novaData === l.pagaAte} onClick={salvarData}>
          salvar data
        </Chip>
      </div>

      {registrando && (
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center gap-1"><Lbl>pago até</Lbl>
            <input type="date" className={campo} value={pagaAte} onChange={(e) => setPagaAte(e.target.value)} />
          </label>
          <label className="flex items-center gap-1"><Lbl>valor</Lbl>
            <input className={`${campo} w-24`} inputMode="decimal" value={valorPago}
                   onChange={(e) => setValorPago(e.target.value)} />
          </label>
          <input className={`${campo} flex-1 min-w-32`} placeholder="observação (opcional)" value={obs}
                 onChange={(e) => setObs(e.target.value)} />
          <Chip acento disabled={ocupado} onClick={() => void registrar()}>registrar</Chip>
        </div>
      )}
      {erro && <Sub className="text-acento">{erro}</Sub>}
    </Box>
  );
}
