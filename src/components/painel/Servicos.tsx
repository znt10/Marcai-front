'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub, Sep } from '@/components/wf';
import {
  servicosApi, publicoApi, mensagemDoErro,
  type ServicoDoCatalogo, type VinculoDeServico, type Eu, type Barbeiro,
} from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';

export function Servicos({ eu }: { eu: Eu }) {
  const [catalogo, setCatalogo] = useState<ServicoDoCatalogo[] | null>(null);
  const [vinculos, setVinculos] = useState<VinculoDeServico[]>([]);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [barbeiroId, setBarbeiroId] = useState(eu.id);
  const [erro, setErro] = useState('');
  // Fechado ao abrir a tela, sempre. Serviço desativado é o que a barbearia
  // NÃO vende hoje — é consulta ocasional, não parte do trabalho do dia.
  const [verDesativados, setVerDesativados] = useState(false);

  const alvo = barbeiroId === eu.id ? undefined : barbeiroId;

  // O backend ja devolve os desativados por ultimo (`order_by("-ativo",
  // "ordem")`); a separacao aqui e' o que os tira da lista principal.
  const ativos = catalogo?.filter((s) => s.ativo) ?? [];
  const desativados = catalogo?.filter((s) => !s.ativo) ?? [];

  const carregar = useCallback(async (signal?: AbortSignal) => {
    try {
      const [cat, vin] = await Promise.all([
        servicosApi.catalogo(signal),
        servicosApi.vinculos(alvo, signal),
      ]);
      setCatalogo(cat);
      setVinculos(vin);
      setErro('');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setCatalogo([]);
      setErro(mensagemDoErro(e));
    }
  }, [alvo]);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(ctrl.signal);
    return () => ctrl.abort();
  }, [carregar]);

  useEffect(() => {
    if (eu.papel !== 'DONO') return;
    const ctrl = new AbortController();
    publicoApi.barbeiros(ctrl.signal).then(setBarbeiros).catch(() => {});
    return () => ctrl.abort();
  }, [eu.papel]);

  async function agir(acao: () => Promise<unknown>) {
    setErro('');
    try {
      await acao();
      await carregar();
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  return (
    <>
      {barbeiros.length > 1 && (
        <Sub>Você está vendo os serviços de quem escolher aqui:</Sub>
      )}
      {barbeiros.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {barbeiros.map((b) => (
            <Box key={b.id} variante={b.id === barbeiroId ? 'fill' : 'normal'}
                 className="cursor-pointer" onClick={() => setBarbeiroId(b.id)}>
              {b.id === eu.id ? `${b.nome} (você)` : b.nome}
            </Box>
          ))}
        </div>
      )}

      {/* O nome da secao diz de QUEM sao os servicos. "o que ele faz" nao
          dizia quem era "ele" quando o dono trocava de barbeiro no seletor. */}
      <Lbl>{alvo ? `serviços de ${barbeiros.find((b) => b.id === barbeiroId)?.nome ?? ''}` : 'seus serviços'}</Lbl>
      {/* A frase que faltava. Sem ela, "Corte" aparece nesta lista E na lista
          da barbearia mais abaixo, e nada na tela explica por que o mesmo
          servico esta escrito duas vezes. */}
      <Sub>
        Marque o que você faz. O tempo e o preço são seus — cada barbeiro
        pode ter os dele no mesmo serviço.
      </Sub>
      {catalogo === null && <Sub>carregando…</Sub>}
      {vinculos.map((v) => (
        <Box key={v.servicoId} variante={v.faz ? 'normal' : 'mut'}>
          {/* Nome e botão numa linha fixa, os campos numa segunda: antes tudo
              corria na mesma linha com `flex-wrap`, e um nome mais longo
              ("Corte + Barba") empurrava os campos para baixo só naquela
              linha — cada cartão quebrava num ponto diferente e nada alinhava
              de uma linha para a outra. */}
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{v.nome}</span>
            {/* Dois botoes, e nao um que troca de texto: um botao escrito
                "nao faco" ao lado de um "✓ Corte" e' lido como RoTULO ("eu nao
                faco corte") tanto quanto como acao. Com os dois lado a lado e o
                atual aceso, o estado esta na tela e o toque so muda de lado —
                o mesmo desenho que a tela de Horarios ja usa em
                "toda semana / uma vez". */}
            <div className="flex gap-1.5 shrink-0" role="group"
                 aria-label={`Você faz ${v.nome}?`}>
              <Chip ativo={v.faz} aria-pressed={v.faz}
                    onClick={() => !v.faz && agir(() => servicosApi.vincular({
                      barbeiroId: alvo, servicoId: v.servicoId, faz: true,
                    }))}>
                faço
              </Chip>
              <Chip ativo={!v.faz} aria-pressed={!v.faz}
                    onClick={() => v.faz && agir(() => servicosApi.vincular({
                      barbeiroId: alvo, servicoId: v.servicoId, faz: false,
                    }))}>
                não faço
              </Chip>
            </div>
          </div>
          {v.faz && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2.5">
              {/* Os campos ganharam nome. Eram um número solto seguido de
                  "min" e um "R$" seguido de travessão — para saber o que se
                  editava ali era preciso deduzir pela unidade. */}
              <label className="flex items-baseline gap-1.5">
                <span className="text-[11px] md:text-xs text-lbl uppercase tracking-[0.12em]">duração</span>
                <input type="number" min={v.duracaoMinimaMin} step={5}
                       className="w-12 bg-transparent outline-none text-right font-dado
                                  border-b border-borda focus:border-acento"
                       defaultValue={v.duracaoMin}
                       onBlur={(e) => {
                         const min = Number(e.target.value);
                         if (!Number.isFinite(min) || min === v.duracaoMin) return;
                         void agir(() => servicosApi.vincular({
                           barbeiroId: alvo, servicoId: v.servicoId, faz: true, duracaoMin: min,
                         }));
                       }} />
                <Sub>min</Sub>
              </label>
              {/* Preço é decisão do PRÓPRIO barbeiro (ou do dono editando
                  pelo seletor acima), sem sugestão nenhuma do catálogo —
                  diferente da duração. Reais na tela, centavos no banco:
                  quem digita não pensa em centavos. */}
              <label className="flex items-baseline gap-1.5">
                <span className="text-[11px] md:text-xs text-lbl uppercase tracking-[0.12em]">preço</span>
                <Sub>R$</Sub>
                <input type="number" min={0} step={0.01} inputMode="decimal"
                       placeholder="a combinar"
                       className="w-24 bg-transparent outline-none text-right font-dado
                                  border-b border-borda focus:border-acento
                                  placeholder:font-corpo placeholder:text-[11px] placeholder:text-apagado"
                       defaultValue={v.precoCentavos !== null ? (v.precoCentavos / 100).toFixed(2) : ''}
                       onBlur={(e) => {
                         if (e.target.value.trim() === '') return;
                         const reais = Number(e.target.value);
                         if (!Number.isFinite(reais) || reais <= 0) return;
                         const centavos = Math.round(reais * 100);
                         if (centavos === v.precoCentavos) return;
                         void agir(() => servicosApi.vincular({
                           barbeiroId: alvo, servicoId: v.servicoId, faz: true,
                           precoCentavos: centavos,
                         }));
                       }} />
              </label>
            </div>
          )}
        </Box>
      ))}

      {eu.papel === 'DONO' && (
        <>
          <Sep />
          {/* "Catálogo" e' palavra de sistema. E a secao precisa dizer, com
              todas as letras, qual e' a diferenca dela para a lista de cima —
              e' de la' que vem o "por que Corte esta escrito duas vezes". */}
          <Lbl>a lista da barbearia</Lbl>
          <Sub>
            Tudo que a sua barbearia oferece. É desta lista que cada barbeiro
            escolhe, lá em cima, o que faz. Só você mexe aqui.
          </Sub>
          {ativos.map((s) => (
            <CartaoDoCatalogo key={s.id} servico={s} agir={agir} />
          ))}

          <NovoServico aoCriar={(d) => agir(() => servicosApi.criar(d))} />

          {/* Os desativados saem da lista principal e ficam AQUI, fechados.
              Antes eles seguiam no meio dos outros, apagados, para sempre — e
              numa barbearia que mexe no cardápio algumas vezes por ano isso
              vira uma lista em que a maioria das caixas é de coisa que não se
              vende mais.

              Escondidos, e não apagados: o serviço guarda o histórico de quem
              já cortou, e o nome dele é único na barbearia — quem "apagasse"
              Corte e tentasse criar outro Corte esbarraria no repetido sem
              entender por quê. Aqui ele volta com um toque. */}
          {desativados.length > 0 && (
            <>
              <button onClick={() => setVerDesativados((v) => !v)}
                      aria-expanded={verDesativados}
                      className="flex items-center gap-2 text-left text-[11px] md:text-xs
                                 text-lbl hover:text-acento uppercase tracking-[0.12em]">
                <span aria-hidden className={verDesativados ? 'rotate-90' : ''}>›</span>
                {desativados.length === 1
                  ? '1 serviço fora da lista'
                  : `${desativados.length} serviços fora da lista`}
              </button>
              {verDesativados && (
                <>
                  {/* Diz o que essa gaveta É, para quem abriu sem saber: sem
                      isto, um "Corte" apagado aqui embaixo parece um bug. */}
                  <Sub>
                    Estes não aparecem para o cliente e nenhum barbeiro pode
                    marcá-los. Ficam guardados aqui caso você queira de volta.
                  </Sub>
                  {desativados.map((s) => (
                    <CartaoDoCatalogo key={s.id} servico={s} agir={agir} />
                  ))}
                </>
              )}
            </>
          )}

        </>
      )}

      {erro && <Sub className="text-acento">{erro}</Sub>}
    </>
  );
}

/// Um cartao do catalogo da barbearia. Extraido porque a lista principal e a
/// gaveta dos desativados desenham o MESMO cartao — duas copias divergiriam na
/// primeira vez que alguem mexesse so numa delas.
function CartaoDoCatalogo({ servico: s, agir }: {
  servico: ServicoDoCatalogo;
  agir: (acao: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <Box variante={s.ativo ? 'normal' : 'mut'}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate">{s.nome}</span>
        {/* Sem `acento`: era ambar em todo servico LIGADO, ou seja,
            quatro botoes de destaque no estado normal da tela — e no
            botao que DESLIGA. O ambar aqui e' do que conclui. */}
        <Chip onClick={() => agir(() => servicosApi.editar(s.id, { ativo: !s.ativo }))}>
          {s.ativo ? 'tirar da lista' : 'voltar para a lista'}
        </Chip>
      </div>
      {/* "min 20 · sugerida 40" nao dizia minimo de QUE, nem sugerida
          para quem. Sao os dois limites que o barbeiro encontra la em
          cima quando poe o tempo dele. */}
      <Sub className="mt-1">
        nunca menos de {s.duracaoMinimaMin} min · normalmente {s.duracaoSugeridaMin} min
      </Sub>
      {/* Zero é o aviso de que o serviço existe e ninguém oferece. */}
      {s.ativo && s.barbeiros === 0 && (
        <Sub className="text-acento mt-1">
          nenhum barbeiro faz este — o cliente não vê ele
        </Sub>
      )}
    </Box>
  );
}

function NovoServico({ aoCriar }: {
  aoCriar: (d: { nome: string; duracaoMinimaMin: number; duracaoSugeridaMin: number }) => void;
}) {
  const [nome, setNome] = useState('');
  const [minima, setMinima] = useState(20);
  const [sugerida, setSugerida] = useState(30);

  return (
    <>
      <Lbl>acrescentar um serviço</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent"
               placeholder="nome do serviço — ex.: sobrancelha"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Box>
      {/* Eram dois numeros rotulados "minima" e "sugerida", sem unidade e sem
          dizer minima de que. Viram duas frases inteiras, com o campo no meio
          e "min" do lado. */}
      <Box>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 flex-wrap">
            <Sub>nunca leva menos que</Sub>
            <input type="number" step={5} min={5}
                   className="w-14 bg-transparent outline-none text-right font-dado
                              border-b border-borda focus:border-acento"
                   value={minima} onChange={(e) => setMinima(Number(e.target.value))} />
            <Sub>min</Sub>
          </label>
          <label className="flex items-center gap-2 flex-wrap">
            <Sub>normalmente leva</Sub>
            <input type="number" step={5} min={5}
                   className="w-14 bg-transparent outline-none text-right font-dado
                              border-b border-borda focus:border-acento"
                   value={sugerida} onChange={(e) => setSugerida(Number(e.target.value))} />
            <Sub>min</Sub>
          </label>
        </div>
      </Box>
      <Sub>
        Cada barbeiro ajusta o tempo dele depois. Estes dois números são só o
        ponto de partida.
      </Sub>
      <Box variante={nome.trim().length >= 2 ? 'fill' : 'mut'}
           className={nome.trim().length >= 2 ? 'cursor-pointer' : ''}
           onClick={() => {
             if (nome.trim().length < 2) return;
             aoCriar({ nome, duracaoMinimaMin: minima, duracaoSugeridaMin: sugerida });
             setNome('');
           }}>
        + acrescentar à lista
      </Box>
    </>
  );
}
