'use client';
import { useState } from 'react';
import { Box } from '@/components/wf';
import type { ServicoDoResumo } from '@/lib/api';
import { montarPizza } from '@/lib/resumo';
import { formatarPreco } from '@/lib/dinheiro';
import { useVocabulario } from '@/components/Vocabulario';

/// Os serviços do período — do salão inteiro ou de um profissional — numa
/// rosca, com a conta ao lado: quantos de cada, quanto entrou, e que parte do
/// movimento foi aquele serviço. Pedido do dono em 12/10, "igual ao
/// FechaCaixa": a rosca dá a proporção de relance, e a tabela ao lado dá o
/// número exato que a rosca não sabe mostrar.
///
/// As fatias são a QUANTIDADE, e não o dinheiro: a pergunta é "o que ele
/// fez". O dinheiro vem na coluna ao lado.
///
/// As cores chegam prontas (`cores`), calculadas sobre o salão inteiro, para
/// o mesmo serviço ter a mesma cor em qualquer chip — ver `coresPorServico`.

const RAIO = 60;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
/// O vão entre fatias vizinhas, na cor do fundo: sem ele, duas cores
/// encostadas viram uma mancha só na borda, que é justamente onde o olho
/// compara.
const RESPIRO = 2;

const real = (centavos: number | null) => (centavos === null ? '—' : formatarPreco(centavos));

export function PizzaDeServicos({
  servicos, cores,
}: {
  servicos: ServicoDoResumo[];
  cores: Map<string, string>;
}) {
  const v = useVocabulario();
  // A chave da FATIA sob o ponteiro. A legenda acende a fatia e vice-versa;
  // um serviço da cauda acende a fatia cinza que o contém.
  const [sobre, setSobre] = useState<string | null>(null);

  const { linhas, fatias, cortes, centavos } = montarPizza(servicos, cores);

  if (cortes === 0) {
    return <Box variante="dash">Nenhum {v.atendimento} nesse período.</Box>;
  }

  // Os arcos são calculados antes do JSX: acumular o deslocamento dentro do
  // `map` seria mudar uma variável de fora durante a renderização.
  const arcos = fatias.reduce<
    { chave: string; nome: string; cortes: number; cor: string; traco: number; inicio: number; comprimento: number }[]
  >((feitos, f) => {
    const anterior = feitos.at(-1);
    const inicio = anterior ? anterior.inicio + anterior.comprimento : 0;
    // O ÂNGULO usa a fração exata, não a porcentagem inteira da legenda: o
    // desenho fecha a volta certinha, e o arredondamento fica só no texto.
    const comprimento = (f.cortes / cortes) * CIRCUNFERENCIA;
    // Com uma fatia só não há vizinho de quem se separar.
    const traco = fatias.length > 1 ? Math.max(comprimento - RESPIRO, 1) : comprimento;
    return [...feitos, { ...f, traco, inicio, comprimento }];
  }, []);

  const chaveDaFatia = (servicoId: string, nomeado: boolean) => (nomeado ? servicoId : 'outros');
  // A porcentagem da fatia é a soma das da legenda, e não uma conta nova: o
  // "outros" de 12% no tooltip tem que ser os 7% + 5% escritos na tabela.
  const pctDaFatia = new Map<string, number>();
  for (const l of linhas) {
    const chave = chaveDaFatia(l.servicoId, l.nomeado);
    pctDaFatia.set(chave, (pctDaFatia.get(chave) ?? 0) + l.pct);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <svg
        viewBox="0 0 160 160"
        className="h-[148px] w-[148px] md:h-[168px] md:w-[168px] shrink-0"
        role="img"
        aria-label={`${cortes} ${cortes === 1 ? v.atendimento : v.atendimentos}: ${linhas
          .map((l) => `${l.nome}, ${l.cortes}`)
          .join('; ')}`}
      >
        <g transform="rotate(-90 80 80)">
          {arcos.map((a) => (
            <circle
              key={a.chave}
              cx="80" cy="80" r={RAIO}
              fill="none"
              stroke={a.cor}
              strokeWidth="26"
              strokeDasharray={`${a.traco} ${CIRCUNFERENCIA - a.traco}`}
              strokeDashoffset={-a.inicio}
              opacity={sobre !== null && sobre !== a.chave ? 0.35 : 1}
              className="transition-opacity"
              onMouseEnter={() => setSobre(a.chave)}
              onMouseLeave={() => setSobre(null)}
            >
              {/* Tooltip nativo: nome e número sem depender de mouse — quem
                  chega por teclado ou toque tem tudo na tabela ao lado. */}
              <title>{`${a.nome}: ${a.cortes} ${a.cortes === 1 ? v.atendimento : v.atendimentos} (${pctDaFatia.get(a.chave)}%)`}</title>
            </circle>
          ))}
        </g>
        {/* O total no miolo: é o número que a rosca inteira representa. */}
        <text x="80" y="80" textAnchor="middle" className="fill-tinta font-dado" fontSize="26">
          {cortes}
        </text>
        <text x="80" y="100" textAnchor="middle" className="fill-lbl uppercase" fontSize="10"
              letterSpacing="1.2">
          {cortes === 1 ? v.atendimento : v.atendimentos}
        </text>
      </svg>

      {/* Uma tabela de verdade, e não uma lista estilizada: é a leitura exata
          do que a rosca mostra, e o leitor de tela a percorre por coluna.
          Texto sempre em tinta de texto, nunca na cor da série — quem carrega
          a identidade é o quadradinho ao lado do nome. */}
      <table className="min-w-[260px] flex-1 text-[13px] md:text-sm tabular-nums">
        <thead>
          <tr className="text-[10px] md:text-[11px] text-lbl uppercase tracking-[0.12em]">
            <th className="pb-1.5 text-left font-normal">serviço</th>
            <th className="pb-1.5 pl-3 text-right font-normal">{v.atendimentos}</th>
            <th className="pb-1.5 pl-3 text-right font-normal">valor</th>
            <th className="pb-1.5 pl-3 text-right font-normal">%</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const chave = chaveDaFatia(l.servicoId, l.nomeado);
            return (
              <tr
                key={l.servicoId}
                className="border-t border-borda-suave"
                onMouseEnter={() => setSobre(chave)}
                onMouseLeave={() => setSobre(null)}
              >
                <td className="py-1.5 max-w-0 w-full">
                  <span className="flex items-center gap-2 min-w-0">
                    <span aria-hidden className="shrink-0 w-2.5 h-2.5 rounded-[2px]"
                          style={{ backgroundColor: l.cor }} />
                    <span className="truncate text-tinta">{l.nome}</span>
                  </span>
                </td>
                <td className="py-1.5 pl-3 text-right font-dado text-tinta">{l.cortes}</td>
                <td className="py-1.5 pl-3 text-right font-dado text-tinta whitespace-nowrap">
                  {real(l.centavos)}
                </td>
                <td className="py-1.5 pl-3 text-right font-dado text-sub">{l.pct}%</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-borda font-semibold">
            <td className="pt-2 text-tinta">Total</td>
            <td className="pt-2 pl-3 text-right font-dado text-tinta">{cortes}</td>
            <td className="pt-2 pl-3 text-right font-dado text-tinta whitespace-nowrap">{real(centavos)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
