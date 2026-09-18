'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Cartao, BotaoCheio, BotaoVazado, Texto, TituloDaTela,
} from '@/components/painel/pecas';
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

  const contagem = itens === null ? '…'
    : itens.length === 0 ? 'nada marcado'
    : `${itens.length} ${itens.length === 1 ? 'marcado' : 'marcados'}`;

  return (
    <>
      {/* A data e a contagem ficam no cabeçalho da tela, como no desenho: são
          o que a tela É naquele momento, não um controle. O controle que as
          muda vem logo abaixo, e por isso a data também aparece nele. */}
      <TituloDaTela titulo="Agenda">
        {porExtenso(dia)} · {contagem}
      </TituloDaTela>

      {/* As setas do dia: o mesmo par de quadrados de 36px que o quadro do
          dia usa no Figma. O desenho não desenhou isto na agenda — mas andar
          um dia é o que a tela faz desde antes dele, e inventar um segundo
          jeito de andar seria pior que reusar o que o desenho já tem. */}
      <div className="flex w-[160px] items-center gap-2.5">
        <BotaoVazado className="size-9 rounded-[10px] px-0 text-[14px] text-sub"
                     aria-label="dia anterior" onClick={() => setDia(somar(dia, -1))}>
          ←
        </BotaoVazado>
        <span className="flex-1 text-center text-[13.5px] font-bold text-tinta">
          {ehHoje ? 'hoje' : porExtenso(dia)}
        </span>
        <BotaoVazado className="size-9 rounded-[10px] px-0 text-[14px] text-sub"
                     aria-label="próximo dia" onClick={() => setDia(somar(dia, 1))}>
          →
        </BotaoVazado>
      </div>

      {!ehHoje && (
        <button onClick={() => setDia(hoje())}
                className="self-start text-[12px] font-medium text-lbl hover:text-acento">
          ← voltar para hoje
        </button>
      )}

      {itens === null && <Texto>carregando…</Texto>}
      {itens?.length === 0 && (
        <Cartao variante="dash" className="py-6 text-center">
          <Texto>Nenhum horário marcado {ehHoje ? 'hoje' : 'neste dia'}.</Texto>
        </Cartao>
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
          <div key={i.id} className="flex flex-col gap-3">
            {vao >= VAO_MINIMO_MIN && (
              <div className="flex items-center gap-2">
                <span className="h-px flex-1 bg-borda-suave" />
                <span className="text-[11px] font-semibold text-livre">
                  livre · {duracao(vao)}
                </span>
                <span className="h-px flex-1 bg-borda-suave" />
              </div>
            )}

            {/* A LINHA DO AGORA. Cai uma vez só, logo acima do primeiro
                horário que ainda não terminou — é onde o dia está. */}
            {ehProximo && (
              <div className="flex items-center gap-2">
                <span className="font-dado text-[12px] font-bold text-acento-forte">
                  {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="h-px flex-1 bg-borda" />
                <span className="text-[11px] font-semibold text-lbl">agora</span>
              </div>
            )}

            <Cartao variante={ehProximo ? 'sel' : 'normal'}
                    className={`flex flex-col gap-2.5 ${passou ? 'opacity-45' : ''}`}>
              <div className="flex items-baseline gap-2.5">
                {/* A hora lidera e é o maior elemento da linha: é por ela que
                    se procura na lista, não pelo nome. */}
                <span className={`font-dado text-[21px] font-bold leading-none
                                  ${ehProximo ? 'text-acento-forte' : 'text-tinta'}`}>
                  {hora(i.inicio)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-tinta">
                  {i.clienteNome}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-sub">
                <span className="truncate">
                  {i.servicoNome}
                  {/* O nome do barbeiro só faz sentido para quem vê a agenda de
                      mais de um: para o barbeiro, seria a mesma linha o dia
                      inteiro. */}
                  {eu?.papel === 'DONO' && ` · ${i.barbeiroNome}`}
                </span>
                <span className="flex shrink-0 items-center">
                  {/* Alvos de toque de verdade: eram dois textos de 12px
                      colados, num aparelho segurado com uma mão só. */}
                  <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer"
                     className="px-1.5 py-1 hover:text-acento">
                    whatsapp
                  </a>
                  <span aria-hidden className="text-lbl">·</span>
                  {/* Cinza, não âmbar: o âmbar deste produto marca o que
                      CONCLUI e o agora. Cancelar é o contrário disso, e pintá-lo
                      de acento punha a ação mais destrutiva da tela como a mais
                      chamativa dela. A confirmação continua sendo a trava. */}
                  <button onClick={() => cancelar(i)} className="px-1.5 py-1 hover:text-acento">
                    cancelar
                  </button>
                </span>
              </div>
            </Cartao>
          </div>
        );
      })}

      <Link href="/painel/novo" className="self-start">
        <BotaoCheio tabIndex={-1}>+ marcar na mão</BotaoCheio>
      </Link>
    </>
  );
}
