'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Sub } from '@/components/wf';
import { painelApi, ignorarAborto, type ItemDaAgenda } from '@/lib/api';
import { useAtualizacaoPeriodica } from '@/lib/useAtualizacaoPeriodica';
import { PAINEL_ATUALIZACAO_MS } from '@/lib/config';
import { useEu } from '@/components/painel/SessaoDoPainel';

/// `sv-SE` porque é o locale que formata como YYYY-MM-DD — o formato que a
/// rota espera — sem passar por UTC e cair no dia anterior.
const hoje = () => new Date().toLocaleDateString('sv-SE');
const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/// "ter · 2 set" — o dia por extenso, curto. `hoje` sozinho não diz QUE dia é,
/// e a data crua (`2026-09-03`) é formato de máquina: quem está de pé ao lado
/// da cadeira lê "qui · 4 set" sem traduzir nada.
const porExtenso = (dia: string) =>
  new Date(`${dia}T12:00:00`)
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\.$/, '')
    .replace('.,', ' ·')
    .replace(',', ' ·');

const minutosDe = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/// Um vão só vira linha se couber alguma coisa nele. Menos que isso é a folga
/// normal entre um cliente e o próximo, e anunciá-la encheria a lista de
/// "livre · 5 min" entre todos os pares.
const VAO_MINIMO_MIN = 30;

const duracao = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}h${String(m).padStart(2, '0')}` : h ? `${h}h` : `${m} min`;
};

export function AgendaDoDia() {
  // `eu` vem do provider do layout — era aqui uma das seis buscas
  // independentes de `painelApi.eu()`. Ver `SessaoDoPainel.tsx`.
  const { eu } = useEu();
  const [dia, setDia] = useState(hoje());
  const [itens, setItens] = useState<ItemDaAgenda[] | null>(null);
  /// O relógio da tela. Sem ele a linha do "agora" congela no minuto em que a
  /// página abriu — e o painel fica aberto no balcão a manhã inteira.
  const [agora, setAgora] = useState(() => new Date());

  /// Toda busca leva um `signal`, e todo efeito aborta ao sair. Sem isso,
  /// trocar de dia rápido deixa duas requisições no ar e quem responde por
  /// último pinta a tela: o cabeçalho diz 7 e a lista é do dia 6.
  ///
  /// É também o que faz o StrictMode do desenvolvimento parar de duplicar
  /// requisição — ele monta, desmonta e remonta de propósito justamente para
  /// expor efeito sem limpeza.
  ///
  /// `silencioso` é o que separa a carga que a pessoa pediu da que acontece
  /// sozinha. Sem ele, a atualização automática zeraria `itens` a cada 30s e
  /// a lista sumiria e voltaria na cara de quem está olhando.
  ///
  /// E o erro também é tratado diferente: numa falha silenciosa, ficar com o
  /// que já está na tela é melhor do que apagar tudo por causa de um sinal
  /// ruim de celular — o próximo toque tenta de novo.
  const carregar = useCallback(async (d: string, signal?: AbortSignal, silencioso = false) => {
    if (!silencioso) setItens(null);
    try {
      setItens((await painelApi.agenda(d, undefined, signal)).itens);
    } catch (e) {
      if (silencioso) return;
      ignorarAborto(e);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(dia, ctrl.signal);
    return () => ctrl.abort();
  }, [dia, carregar]);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  /// Um agendamento novo aparece sozinho, sem recarregar a página. Sem
  /// `signal`: esta busca não pertence a nenhum efeito que possa ser
  /// cancelado no meio — ela nasce e morre no mesmo toque.
  useAtualizacaoPeriodica(
    () => { void carregar(dia, undefined, true); },
    PAINEL_ATUALIZACAO_MS,
  );

  async function cancelar(item: ItemDaAgenda) {
    if (!confirm(`Cancelar o horário de ${item.clienteNome} às ${hora(item.inicio)}?`)) return;
    await painelApi.cancelar(item.id);
    void carregar(dia);
  }

  const ehHoje = dia === hoje();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  /// O primeiro que ainda não terminou. É a resposta da pergunta que o barbeiro
  /// faz o dia inteiro — "quem é o próximo?" — e a lista não respondia: doze
  /// linhas idênticas, todas com o mesmo peso.
  const proximo = ehHoje
    ? itens?.find((i) => minutosDe(i.fim) > minutosAgora) ?? null
    : null;

  return (
    <>
      {/* A data e a contagem ficam JUNTAS do controle que as muda. Antes o
          cabeçalho dizia só "hoje", e ao andar um dia virava `2026-09-03`. */}
      <div className="flex items-stretch gap-2">
        <Box className="cursor-pointer flex items-center px-4" onClick={() => setDia(somar(dia, -1))}
             aria-label="dia anterior">←</Box>
        <div className="flex-1 text-center self-center">
          <div className="font-letreiro uppercase tracking-[0.06em] text-base md:text-lg">
            {ehHoje ? 'hoje' : porExtenso(dia)}
          </div>
          <Sub>
            {ehHoje && `${porExtenso(dia)} · `}
            {itens === null ? '…' : itens.length === 0 ? 'nada marcado'
              : `${itens.length} ${itens.length === 1 ? 'marcado' : 'marcados'}`}
          </Sub>
        </div>
        <Box className="cursor-pointer flex items-center px-4" onClick={() => setDia(somar(dia, 1))}
             aria-label="próximo dia">→</Box>
      </div>

      {!ehHoje && (
        <button onClick={() => setDia(hoje())} className="text-[11px] md:text-xs text-lbl hover:text-acento">
          ← voltar para hoje
        </button>
      )}

      {itens === null && <Sub>carregando…</Sub>}
      {itens?.length === 0 && (
        <Box variante="dash" className="text-center py-6">
          <Sub>Nenhum horário marcado {ehHoje ? 'hoje' : 'neste dia'}.</Sub>
        </Box>
      )}

      {itens?.map((i, n) => {
        const anterior = itens[n - 1];
        // O vão entre o fim do anterior e o começo deste. É o que o barbeiro
        // precisa saber para aceitar quem chega sem marcar — a lista antiga
        // mostrava só o que estava ocupado, nunca o que estava livre.
        const vao = anterior ? minutosDe(i.inicio) - minutosDe(anterior.fim) : 0;
        const ehProximo = proximo?.id === i.id;
        const passou = ehHoje && minutosDe(i.fim) <= minutosAgora;

        return (
          <div key={i.id} className="flex flex-col gap-2.5">
            {vao >= VAO_MINIMO_MIN && (
              <div className="flex items-center gap-2 px-1">
                <span className="h-px flex-1 bg-linha" />
                <span className="text-[11px] md:text-xs text-livre uppercase tracking-[0.12em]">
                  livre · {duracao(vao)}
                </span>
                <span className="h-px flex-1 bg-linha" />
              </div>
            )}

            {/* A LINHA DO AGORA. Cai uma vez só, logo acima do primeiro
                horário que ainda não terminou — é onde o dia está. */}
            {ehProximo && (
              <div className="flex items-center gap-2">
                <span className="font-dado text-[11px] md:text-xs text-acento">
                  {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="h-px flex-1 bg-acento" />
                {/* Nao usa `Lbl`: ele ja traz `text-lbl`, e duas utilitarias
                    de mesma especificidade nao se resolvem pela ordem na
                    string — o cinza ganhava do ambar por acaso. */}
                <span className="text-[11px] md:text-xs text-acento uppercase tracking-[0.12em]">
                  agora
                </span>
              </div>
            )}

            <Box variante={ehProximo ? 'sel' : 'normal'} className={passou ? 'opacity-45' : ''}>
              <div className="flex items-baseline gap-3">
                {/* A hora lidera e é o maior elemento da linha: é por ela que
                    se procura na lista, não pelo nome. */}
                <span className={`font-dado tracking-tight text-lg md:text-xl leading-none
                                  ${ehProximo ? 'text-acento' : ''}`}>
                  {hora(i.inicio)}
                </span>
                <span className="flex-1 min-w-0 truncate">{i.clienteNome}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 mt-1">
                <Sub className="truncate">
                  {i.servicoNome}
                  {/* O nome do barbeiro só faz sentido para quem vê a agenda de
                      mais de um: para o barbeiro, seria a mesma linha o dia
                      inteiro. */}
                  {eu?.papel === 'DONO' && ` · ${i.barbeiroNome}`}
                </Sub>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Alvos de toque de verdade: eram dois textos de 12px
                      colados, num aparelho segurado com uma mão só. */}
                  <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer"
                     className="px-2.5 py-1.5 text-[12px] md:text-[13px] text-sub hover:text-acento">
                    whatsapp
                  </a>
                  {/* Cinza, não âmbar: o âmbar deste produto marca o que
                      CONCLUI e o agora. Cancelar é o contrário disso, e pintá-lo
                      de acento punha a ação mais destrutiva da tela como a mais
                      chamativa dela. A confirmação continua sendo a trava. */}
                  <button onClick={() => cancelar(i)}
                          className="px-2.5 py-1.5 text-[12px] md:text-[13px] text-apagado hover:text-acento">
                    cancelar
                  </button>
                </div>
              </div>
            </Box>
          </div>
        );
      })}

      <a href="/painel/novo"><Box variante="fill">+ marcar na mão</Box></a>
    </>
  );
}
