'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Cartao, Pilula, BotaoCheio, BotaoVazado, Titulo, Texto, Etiqueta, Fio,
} from '@/components/painel/pecas';
import {
  servicosApi, publicoApi, mensagemDoErro,
  type ServicoDoCatalogo, type VinculoDeServico, type Eu, type Barbeiro,
} from '@/lib/api';
import { formatarPreco } from '@/lib/dinheiro';
import { DURACAO_MAXIMA_MIN, DURACAO_MINIMA_MIN } from '@/lib/config';
import { useVocabulario } from '@/components/Vocabulario';
import { EscolhaPorGrupo } from '@/components/EscolhaPorGrupo';
import { Gaveta } from '@/components/Gaveta';
import {
  FormDoGrupo, ApagarGrupo, SeletorDeGrupo,
} from '@/components/painel/GruposDoCatalogo';
import { agrupar, type GrupoDeServico } from '@/lib/grupos';

export function Servicos({ eu }: { eu: Eu }) {
  const v = useVocabulario();
  const [catalogo, setCatalogo] = useState<ServicoDoCatalogo[] | null>(null);
  const [grupos, setGrupos] = useState<GrupoDeServico[]>([]);
  // O último grupo aberto no catálogo: é o que já vem marcado no "Adicionar
  // serviço", porque quem abre Combos e desce para criar quer criar ali.
  const [grupoAberto, setGrupoAberto] = useState('');
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
      setCatalogo(cat.servicos);
      setGrupos(cat.grupos);
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

  // O vínculo não traz o grupo; ele vem do catálogo, pelo id do serviço.
  const grupoDe = new Map(catalogo?.map((s) => [s.id, s.grupoId]) ?? []);
  const vinculosComGrupo = vinculos.map((x) => ({
    ...x, id: x.servicoId, grupoId: grupoDe.get(x.servicoId) ?? null,
  }));

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
        <>
          <Texto>Você está vendo os serviços de:</Texto>
          <div className="flex flex-wrap gap-2">
            {barbeiros.map((b) => (
              <Pilula key={b.id} ativo={b.id === barbeiroId} onClick={() => setBarbeiroId(b.id)}>
                {b.id === eu.id ? `${b.nome} (você)` : b.nome}
              </Pilula>
            ))}
          </div>
        </>
      )}

      {/* O nome da secao diz de QUEM sao os servicos. "o que ele faz" nao
          dizia quem era "ele" quando o dono trocava de barbeiro no seletor. */}
      <Titulo>
        {alvo
          ? `Serviços de ${barbeiros.find((b) => b.id === barbeiroId)?.nome ?? ''}`
          : 'Seus serviços'}
      </Titulo>
      {/* A frase que faltava. Sem ela, "Corte" aparece nesta lista E na lista
          da barbearia mais abaixo, e nada na tela explica por que o mesmo
          servico esta escrito duas vezes. */}
      <Texto>
        Marque o que você faz, duração e preço — cada {v.prof} pode
        personalizar.
      </Texto>
      {catalogo === null && <Texto>carregando…</Texto>}

      <EscolhaPorGrupo itens={vinculosComGrupo} grupos={grupos} escolhido=""
                       aoEscolher={() => {}} lista={(itens) => itens.map((v) => (
        <Cartao key={v.servicoId} variante={v.faz ? 'normal' : 'mut'}
                className="flex flex-col gap-2.5">
          {/* Nome e botão numa linha fixa, os campos numa segunda: antes tudo
              corria na mesma linha com `flex-wrap`, e um nome mais longo
              ("Corte + Barba") empurrava os campos para baixo só naquela
              linha — cada cartão quebrava num ponto diferente e nada alinhava
              de uma linha para a outra. */}
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[15px] font-bold text-tinta">{v.nome}</span>
            {/* Dois botoes, e nao um que troca de texto: um botao escrito
                "nao faco" ao lado de um "✓ Corte" e' lido como RoTULO ("eu nao
                faco corte") tanto quanto como acao. Com os dois lado a lado e o
                atual aceso, o estado esta na tela e o toque so muda de lado —
                o mesmo desenho que a tela de Horarios ja usa em
                "toda semana / uma vez". */}
            <div className="flex shrink-0 gap-1.5" role="group"
                 aria-label={`Você faz ${v.nome}?`}>
              <Pilula ativo={v.faz} aria-pressed={v.faz}
                      onClick={() => !v.faz && agir(() => servicosApi.vincular({
                        barbeiroId: alvo, servicoId: v.servicoId, faz: true,
                      }))}>
                faço
              </Pilula>
              <Pilula ativo={!v.faz} aria-pressed={!v.faz}
                      onClick={() => v.faz && agir(() => servicosApi.vincular({
                        barbeiroId: alvo, servicoId: v.servicoId, faz: false,
                      }))}>
                não faço
              </Pilula>
            </div>
          </div>

          {v.faz && (
            <div className="flex flex-wrap items-start gap-x-10 gap-y-3">
              {/* Os campos ganharam nome. Eram um número solto seguido de
                  "min" e um "R$" seguido de travessão — para saber o que se
                  editava ali era preciso deduzir pela unidade. */}
              <label className="flex flex-col gap-0.5">
                <Etiqueta>duração</Etiqueta>
                <span className="flex items-baseline gap-1 font-dado text-[15px] font-bold text-tinta">
                  <input type="number" min={DURACAO_MINIMA_MIN} max={DURACAO_MAXIMA_MIN} step={5}
                         className="w-12 border-b border-borda bg-transparent text-right
                                    outline-none focus:border-acento"
                         defaultValue={v.duracaoMin}
                         onBlur={(e) => {
                           const min = Number(e.target.value);
                           if (!Number.isFinite(min) || min === v.duracaoMin) return;
                           void agir(() => servicosApi.vincular({
                             barbeiroId: alvo, servicoId: v.servicoId, faz: true, duracaoMin: min,
                           }));
                         }} />
                  min
                </span>
              </label>
              {/* Preço é decisão do PRÓPRIO barbeiro (ou do dono editando
                  pelo seletor acima), sem sugestão nenhuma do catálogo —
                  diferente da duração. Reais na tela, centavos no banco:
                  quem digita não pensa em centavos. */}
              <label className="flex flex-col gap-0.5">
                <Etiqueta>preço</Etiqueta>
                <span className="flex items-baseline gap-1 font-dado text-[15px] font-bold text-tinta">
                  R$
                  <input type="number" min={0} step={0.01} inputMode="decimal"
                         placeholder="a combinar"
                         className="w-24 border-b border-borda bg-transparent text-right outline-none
                                    focus:border-acento placeholder:text-[11px]
                                    placeholder:font-medium placeholder:text-lbl"
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
                </span>
              </label>
            </div>
          )}
        </Cartao>
      ))} />

      {eu.papel === 'DONO' && (
        <>
          <Fio className="my-1" />
          {/* "Catálogo" e' palavra de sistema. E a secao precisa dizer, com
              todas as letras, qual e' a diferenca dela para a lista de cima —
              e' de la' que vem o "por que Corte esta escrito duas vezes". */}
          <Titulo>A lista {v.doLugar}</Titulo>
          <Texto>
            Tudo que {v.oLugar} oferece. Cada {v.prof} escolhe, acima, o que
            faz. Só você mexe aqui.
          </Texto>
          {grupos.length === 0
            ? ativos.map((s) => (
                <CartaoDoCatalogo key={s.id} servico={s} grupos={grupos} agir={agir} />
              ))
            : <CatalogoEmGavetas servicos={ativos} grupos={grupos} agir={agir}
                                 aoAbrir={setGrupoAberto} />}

          <NovoServico grupos={grupos} grupoAberto={grupoAberto}
                       aoCriar={(d) => agir(() => servicosApi.criar(d))} />

          {/* Grupos são do dono que tem serviço demais para uma lista só
              (pedido de 06/11/2026). Quem tem cinco nunca precisa tocar aqui. */}
          <Titulo>{grupos.length === 0 ? 'Separar em grupos' : 'Novo grupo'}</Titulo>
          <Texto>
            {grupos.length === 0
              ? 'Tem muito serviço? Separe em grupos (Cabelo, Barba, Combos…). O cliente vê cada grupo numa faixa que abre e fecha. Ao criar o primeiro, todos os serviços entram nele e você move cada um para o grupo certo.'
              : 'Todo serviço fica dentro de um grupo.'}
          </Texto>
          <FormDoGrupo rotulo="+ criar grupo"
                       aoSalvar={(d) => agir(() => servicosApi.criarGrupo(d))} />

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
                      className="flex items-center gap-2 self-start text-left text-[12px]
                                 font-semibold text-lbl hover:text-acento">
                <span aria-hidden className={verDesativados ? 'rotate-90' : ''}>›</span>
                {desativados.length === 1
                  ? '1 serviço fora da lista'
                  : `${desativados.length} serviços fora da lista`}
              </button>
              {verDesativados && (
                <>
                  {/* Diz o que essa gaveta É, para quem abriu sem saber: sem
                      isto, um "Corte" apagado aqui embaixo parece um bug. */}
                  <Texto>
                    Estes não aparecem para o cliente e {v.nenhumProf} pode
                    marcá-los. Ficam guardados aqui caso você queira de volta.
                  </Texto>
                  {desativados.map((s) => (
                    <CartaoDoCatalogo key={s.id} servico={s} grupos={grupos} agir={agir} />
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}

      {erro && <Texto className="text-acento">{erro}</Texto>}
    </>
  );
}

/// Um cartao do catalogo da barbearia. Extraido porque a lista principal e a
/// gaveta dos desativados desenham o MESMO cartao — duas copias divergiriam na
/// primeira vez que alguem mexesse so numa delas.
function CartaoDoCatalogo({ servico: s, grupos, agir }: {
  servico: ServicoDoCatalogo;
  grupos: GrupoDeServico[];
  agir: (acao: () => Promise<unknown>) => Promise<void>;
}) {
  const v = useVocabulario();
  return (
    <Cartao variante={s.ativo ? 'normal' : 'mut'} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[14px] font-semibold text-tinta">{s.nome}</span>
        {/* Sem âmbar: era ambar em todo servico LIGADO, ou seja, quatro
            botoes de destaque no estado normal da tela — e no botao que
            DESLIGA. O ambar aqui e' do que conclui. */}
        <BotaoVazado className="text-sub"
                     onClick={() => agir(() => servicosApi.editar(s.id, { ativo: !s.ativo }))}>
          {s.ativo ? 'tirar da lista' : 'voltar para a lista'}
        </BotaoVazado>
      </div>
      {/* Zero é o aviso de que o serviço existe e ninguém oferece. */}
      {s.ativo && s.barbeiros === 0 && (
        <span className="text-[11.5px] font-medium text-acento">
          {v.nenhumProf} faz este — o cliente não vê ele
        </span>
      )}
      {grupos.length > 0 && (
        <SeletorDeGrupo grupos={grupos} valor={s.grupoId ?? ''}
                        aoMudar={(grupoId) => agir(() => servicosApi.editar(s.id, { grupoId }))} />
      )}
    </Cartao>
  );
}

/// Só o nome. O "nunca leva menos que" e o "normalmente leva" saíram em
/// 06/10/2026: o tempo é de cada barbeiro, no campo duração de "Seus
/// serviços", e dois números do dono por cima disso só confundiam.
function NovoServico({ grupos, grupoAberto, aoCriar }: {
  grupos: GrupoDeServico[]; grupoAberto: string;
  aoCriar: (d: { nome: string; grupoId?: string }) => void;
}) {
  const v = useVocabulario();
  const [nome, setNome] = useState('');
  // Casa com grupos: o serviço novo nasce num grupo, sempre (o back recusa
  // sem). Vem marcado o último grupo aberto, ou o primeiro.
  const [escolhido, setEscolhido] = useState('');
  const grupoId = grupos.some((g) => g.id === escolhido)
    ? escolhido
    : grupos.some((g) => g.id === grupoAberto) ? grupoAberto : grupos[0]?.id ?? '';

  return (
    <>
      <Titulo>Adicionar serviço</Titulo>
      {/* Tracejado enquanto vazio, e o fio inteiro assim que tem nome: o
          tracejado aqui é literal — falta preencher. */}
      <Cartao variante={nome ? 'normal' : 'dash'}>
        <input className="w-full bg-transparent text-[13.5px] font-medium outline-none
                          placeholder:text-lbl"
               placeholder={`nome do serviço — ex.: ${v.exemploServico}`}
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Cartao>
      {grupos.length > 0 && (
        <SeletorDeGrupo grupos={grupos} valor={grupoId} aoMudar={setEscolhido} />
      )}
      <Texto>
        O tempo, cada {v.prof} coloca o {v.dele} em Seus serviços, acima.
      </Texto>
      <BotaoCheio largura="cheia" disabled={nome.trim().length < 2}
                  onClick={() => {
                    if (nome.trim().length < 2) return;
                    aoCriar(grupos.length > 0 ? { nome, grupoId } : { nome });
                    setNome('');
                  }}>
        + acrescentar à lista
      </BotaoCheio>
    </>
  );
}

/// O catálogo do dono separado em gavetas, uma por grupo, com o que se faz
/// com o grupo dentro dela: subir, descer, editar e apagar. Começam fechadas
/// pelo mesmo motivo do agendar — a lista de 20 é o problema que os grupos
/// vieram resolver. Grupo vazio TAMBÉM aparece aqui (acabou de ser criado,
/// e é aqui que o dono o enche), ao contrário da tela do cliente.
function CatalogoEmGavetas({ servicos, grupos, agir, aoAbrir }: {
  servicos: ServicoDoCatalogo[]; grupos: GrupoDeServico[];
  agir: (acao: () => Promise<unknown>) => Promise<void>;
  aoAbrir: (id: string) => void;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState('');
  const [apagando, setApagando] = useState('');
  const ordenados = [...grupos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const soltos = agrupar(servicos, grupos)?.soltos ?? [];

  // Trocar de lugar com o vizinho: as duas ordens viram as posições na lista
  // ordenada, o que também desfaz empates antigos de `ordem`.
  const mover = (i: number, passo: -1 | 1) => {
    const j = i + passo;
    if (j < 0 || j >= ordenados.length) return;
    const nova = [...ordenados];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    void agir(() => Promise.all(nova.map((g, k) =>
      g.ordem === k ? null : servicosApi.editarGrupo(g.id, { ordem: k }))));
  };

  const setinha = (rotulo: string, d: string, onClick: () => void, desligado: boolean) => (
    <button type="button" aria-label={rotulo} disabled={desligado} onClick={onClick}
            className="grid size-8 place-items-center rounded-[8px] text-lbl hover:text-acento
                       disabled:opacity-30">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none" stroke="currentColor"
           strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {ordenados.map((g, i) => {
        const doGrupo = servicos.filter((s) => s.grupoId === g.id);
        const aberta = abertos.has(g.id);
        return (
          <Gaveta key={g.id} grupo={g} quantidade={doGrupo.length} aberta={aberta}
                  alternar={() => {
                    setAbertos((a) => {
                      const n = new Set(a);
                      if (n.has(g.id)) n.delete(g.id); else n.add(g.id);
                      return n;
                    });
                    if (!aberta) aoAbrir(g.id);
                  }}
                  acoes={<>
                    {setinha(`subir ${g.nome}`, 'M4 10l4-4 4 4', () => mover(i, -1), i === 0)}
                    {setinha(`descer ${g.nome}`, 'M4 6l4 4 4-4', () => mover(i, 1), i === ordenados.length - 1)}
                  </>}>
            {doGrupo.length === 0 && (
              <Texto>Nenhum serviço aqui ainda. Mova um pelo campo grupo de cada serviço ou crie um novo abaixo.</Texto>
            )}
            {doGrupo.map((s) => (
              <CartaoDoCatalogo key={s.id} servico={s} grupos={grupos} agir={agir} />
            ))}

            {editando === g.id ? (
              <FormDoGrupo inicial={{ nome: g.nome, icone: g.icone }} rotulo="salvar"
                           aoCancelar={() => setEditando('')}
                           aoSalvar={(d) => { setEditando(''); void agir(() => servicosApi.editarGrupo(g.id, d)); }} />
            ) : apagando === g.id ? (
              <ApagarGrupo grupo={g} outros={ordenados.filter((o) => o.id !== g.id)}
                           quantidade={servicos.filter((s) => s.grupoId === g.id).length}
                           aoCancelar={() => setApagando('')}
                           aoApagar={(moverPara) => {
                             setApagando('');
                             void agir(() => servicosApi.apagarGrupo(g.id, moverPara));
                           }} />
            ) : (
              <div className="flex gap-2">
                <BotaoVazado className="text-sub" onClick={() => setEditando(g.id)}>editar grupo</BotaoVazado>
                <BotaoVazado className="text-sub" onClick={() => setApagando(g.id)}>apagar grupo</BotaoVazado>
              </div>
            )}
          </Gaveta>
        );
      })}
      {soltos.map((s) => (
        <CartaoDoCatalogo key={s.id} servico={s} grupos={grupos} agir={agir} />
      ))}
    </div>
  );
}
