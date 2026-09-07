'use client';
import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Row, Lbl, Sub, Avatar } from '@/components/wf';
import { formatar, celular } from '@/lib/telefone';
import { formatarPreco } from '@/lib/dinheiro';
import {
  publicoApi, ignorarAborto, mensagemDoErro, ErroApi,
  type Barbeiro, type Servico, type Slot, type DiaComSlots as Dia,
} from '@/lib/api';
import { DIAS_NA_HOME } from '@/lib/config';
import { urlCalendario } from '@/lib/escolha';
import { lerRascunho, salvarRascunho, limparRascunho } from '@/lib/rascunho';
import { lerMeusDados, salvarMeusDados, esquecerMeusDados } from '@/lib/meus-dados';

/// 'YYYY-MM-DD' de um instante ISO, no fuso do navegador. Não usa
/// `@/lib/datas` de propósito: aquele módulo é o ponto único de conversão do
/// SERVIDOR, e arrastá-lo para o bundle do cliente traria date-fns-tz junto.
const diaLocalDe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/// O que o calendário devolve na volta (`/?barbeiroId=…&servicoId=…&inicio=…`).
type Inicial = { barbeiroId?: string; servicoId?: string; inicio?: string };

export function FormAgendamento({ inicial = {} }: { inicial?: Inicial }) {
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [dias, setDias] = useState<Dia[]>([]);

  // Sem barbeiro escolhido a tela não tem o que mostrar adiante: a duração —
  // e portanto a grade inteira — é por barbeiro E serviço.
  const [barbeiroId, setBarbeiroId] = useState<string>(inicial.barbeiroId ?? '');
  const [servicoId, setServicoId] = useState<string>(inicial.servicoId ?? '');
  const [slot, setSlot] = useState<Slot | null>(null);
  // REF, e não estado, e isso é a correção de um bug real: consumi-lo não pode
  // disparar de novo o efeito que busca a grade. Como estado, ele era
  // dependência daquele efeito — e o efeito começa com `setSlot(null)`. A
  // sequência era: a lista chega, o horário é eleito, `inicioPendente` vira
  // null, o efeito roda DE NOVO e apaga o horário recém-eleito, rebuscando
  // hoje. Quem vinha do calendário via o dia sumir e o botão voltar a
  // "confirmar" seco. O sintoma visível era a segunda requisição a /horarios.
  //
  // Consumido uma vez só, pelo mesmo motivo de antes: não reeleger o mesmo
  // horário quando a pessoa trocar de serviço.
  const inicioPendente = useRef<string | null>(inicial.inicio ?? null);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Só para a tela poder DIZER que lembrou e oferecer esquecer. Sem esta
  // marca, o formulário apareceria preenchido sem explicação — que é
  // exatamente o que `rascunho.ts` recusou quando decidiu não usar
  // `localStorage`: no balcão, um aparelho só, o telefone do cliente anterior
  // esperando o próximo. O que torna isto aceitável é o "não é você?".
  const [veioDaMemoria, setVeioDaMemoria] = useState(false);

  // O nome e o telefone atravessam a ida ao calendário pela aba, não pela URL
  // (`@/lib/rascunho` explica por que não pela URL). Lido em efeito, e nunca no
  // `useState` inicial: `sessionStorage` não existe no servidor, e ler no
  // render faria o HTML do servidor divergir do primeiro render do cliente —
  // erro de hidratação, com o React descartando a árvore inteira.
  useEffect(() => {
    // O rascunho PRIMEIRO e a memória depois: quem está no meio de um
    // preenchimento (foi ao calendário e voltou) não pode ter o que acabou de
    // digitar sobrescrito pelo que marcou mês passado.
    const r = lerRascunho();
    if (r.nome || r.whats) {
      setNome(r.nome);
      setWhats(r.whats);
      return;
    }

    const meus = lerMeusDados();
    if (meus) {
      setNome(meus.nome);
      setWhats(meus.whats);
      setVeioDaMemoria(true);
    }
  }, []);

  // Grava a cada tecla. É barato (duas strings curtas) e é o que sobrevive a
  // fechar a aba sem querer no meio do preenchimento.
  useEffect(() => { salvarRascunho({ nome, whats }); }, [nome, whats]);

  // Todo fetch em efeito leva `signal` e aborta na limpeza. Sem isso, trocar
  // de barbeiro ou de serviço rápido deixa buscas sobrepostas no ar, e a
  // última a responder pinta a tela: a grade seria de um serviço e a
  // confirmação, de outro — 409 na cara do cliente.
  useEffect(() => {
    const ctrl = new AbortController();
    publicoApi.barbeiros(ctrl.signal).then(setBarbeiros).catch(ignorarAborto);
    return () => ctrl.abort();
  }, []);

  // Trocar barbeiro pode invalidar o serviço (Rael não faz pezinho).
  useEffect(() => {
    setSlot(null);
    if (!barbeiroId) { setServicos([]); setServicoId(''); return; }
    const ctrl = new AbortController();
    publicoApi.servicos(barbeiroId, ctrl.signal)
      .then(lista => {
        setServicos(lista);
        setServicoId(atual => (atual && !lista.some(s => s.id === atual) ? '' : atual));
      })
      .catch(ignorarAborto);
    return () => ctrl.abort();
  }, [barbeiroId]);

  // Trocar serviço muda a DURAÇÃO, logo muda a grade inteira.
  // Manter o horário selecionado garantiria 409 na confirmação.
  useEffect(() => {
    setSlot(null);
    if (!servicoId || !barbeiroId) { setDias([]); return; }
    // Vindo do calendário, o dia escolhido pode estar muito além dos dois
    // dias da home — busca-se o dia dele, não os próximos.
    const janela = inicioPendente.current
      ? { de: diaLocalDe(inicioPendente.current), dias: 1 }
      : { dias: DIAS_NA_HOME };
    const ctrl = new AbortController();
    publicoApi.horarios({ barbeiroId, servicoId, ...janela }, ctrl.signal)
      .then(setDias).catch(ignorarAborto);
    return () => ctrl.abort();
  }, [servicoId, barbeiroId]);

  // Reeleger o horário que veio do calendário assim que a lista chega.
  useEffect(() => {
    if (!inicioPendente.current) return;
    const achado = dias.flatMap(d => d.slots).find(s => s.inicio === inicioPendente.current);
    // Zerar a ref não re-renderiza — e é justamente isso que se quer: eleger o
    // horário não pode remexer na grade que acabou de chegar.
    if (achado) { setSlot(achado); inicioPendente.current = null; }
  }, [dias]);

  const servico = servicos.find(s => s.id === servicoId);
  // `celular()` e não "tem 10 dígitos": a regra virou a mesma do Django, que
  // agora exige CELULAR (11 dígitos, DDD que existe). Um botão que acende com
  // um fixo é um botão que promete o que a API vai recusar — e o número
  // errado só apareceria como cadeira vazia, porque sem WhatsApp não há
  // confirmação, nem lembrete, nem link de cancelar.
  const whatsValido = celular(whats) !== null;
  const pronto = !!servicoId && !!slot && nome.trim().length >= 2 && whatsValido;

  async function confirmar() {
    if (!pronto || enviando) return;
    setEnviando(true); setErro('');
    try {
      const { codigo } = await publicoApi.agendar({
        barbeiroId: slot!.barbeiroId, servicoId, inicio: slot!.inicio,
        nome, whatsapp: whats,
      });
      // O rascunho cumpriu o papel de atravessar o calendário. Some agora,
      // e não quando a aba fechar: o balcão da barbearia é um aparelho só, e o
      // próximo cliente não pode achar o telefone do anterior no formulário.
      limparRascunho();
      // E LEMBRAR, que é o par disto: o rascunho some porque cumpriu o papel
      // de atravessar o calendário; a memória nasce agora, porque o servidor
      // acabou de aceitar este nome e este número. Guardar antes gravaria
      // "Jos" e meio telefone.
      salvarMeusDados({ nome, whats });
      window.location.href = `/agendamento/${codigo}`;
    } catch (e) {
      setErro(mensagemDoErro(e));
      setEnviando(false);
      if (e instanceof ErroApi && e.status === 409) {
        // Recarrega a lista mantendo nome e telefone preenchidos.
        setSlot(null);
        void publicoApi.horarios({ barbeiroId, servicoId, dias: DIAS_NA_HOME })
          .then(setDias);
      }
    }
  }

  // As quatro etapas são irmãs na marcação, na ordem do wireframe — é assim
  // que o celular as empilha, 1, 2, 3, 4. No desktop o grid as recoloca em
  // duas colunas SEM mexer na ordem do DOM: fossem dois <div> de coluna, o
  // celular receberia "4. Seus dados" antes de "3. Horários".
  return (
    <div className="grid gap-2.5 md:grid-cols-2 md:gap-x-8 md:gap-y-5 md:items-start">
      <section className="flex flex-col gap-2.5 md:col-start-1 md:row-start-1">
        <Lbl>1. Barbeiro</Lbl>
        <Row wrap>
          {barbeiros.map(b => (
            <Box key={b.id} variante={barbeiroId === b.id ? 'sel' : 'normal'}
                 className="flex gap-1.5 items-center cursor-pointer"
                 onClick={() => setBarbeiroId(b.id)}>
              {/* A foto vinha sendo descartada aqui: `Barbeiro` carrega
                  `fotoUrl` desde a fatia 8 e esta tela renderizava o círculo
                  vazio de qualquer jeito. A vitrine (`app/page.tsx`) já
                  passava — eram duas telas discordando sobre o mesmo dado. */}
              <Avatar tamanho={40} fotoUrl={b.fotoUrl} nome={b.nome} />{b.nome}
            </Box>
          ))}
        </Row>
      </section>

      <section className="flex flex-col gap-2.5 md:col-start-1 md:row-start-2">
        <Lbl>2. Serviço</Lbl>
        {!barbeiroId ? <Sub>Escolhe o barbeiro pra ver os serviços.</Sub> : (
          <Row wrap>
            {servicos.map(s => (
              <Chip key={s.id} ativo={servicoId === s.id} onClick={() => setServicoId(s.id)}>
                {s.nome} · {s.duracaoMin}min
                {s.precoCentavos !== null && ` · ${formatarPreco(s.precoCentavos)}`}
              </Chip>
            ))}
          </Row>
        )}
      </section>

      <section className="flex flex-col gap-2.5 md:col-start-2 md:row-start-1 md:row-span-3">
        {/* O rótulo acompanha DIAS_NA_HOME: com 1 dia, "próximos" seria
            promessa que a lista não cumpre — quem quer outro dia vai pelo
            calendário, logo abaixo. */}
        <Lbl>{DIAS_NA_HOME === 1 ? '3. Horários livres hoje' : '3. Próximos horários livres'}</Lbl>
        {!servicoId && <Sub>Escolhe o serviço pra ver os horários.</Sub>}
        {dias.map(d => (
          <div key={d.data} className="flex flex-col gap-2">
            <Lbl>{d.rotulo}</Lbl>
            {d.slots.length === 0 ? <Sub>sem vaga nesse dia</Sub> : (
              <Row wrap>
                {d.slots.map(s => (
                  <Chip key={s.inicio} dado ativo={slot?.inicio === s.inicio} onClick={() => setSlot(s)}>
                    {s.hora}
                  </Chip>
                ))}
              </Row>
            )}
          </div>
        ))}
        {servicoId && <Sub>só aparece o que está livre</Sub>}

        {barbeiroId && servicoId && (
          // `urlCalendario`, e não uma URL escrita à mão: era escrita à mão, e
          // esquecia o `inicio`. Quem já tinha um horário na mão e ia ao
          // calendário só para dar uma olhada voltava sem ele — o "‹ voltar"
          // de lá só sabe devolver o que chegou.
          <a href={urlCalendario({ barbeiroId, servicoId, inicio: slot?.inicio })}>
            <Box className="flex justify-between items-center">
              <span>escolher outro dia</span><Lbl>calendário ›</Lbl>
            </Box>
          </a>
        )}
      </section>

      <section className="flex flex-col gap-2.5 md:col-start-1 md:row-start-3">
        <Lbl>4. Seus dados</Lbl>
        <Box variante={nome ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" placeholder="Seu nome"
                 value={nome} onChange={e => setNome(e.target.value)} />
        </Box>
        <Box variante={whats ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" inputMode="numeric"
                 placeholder="WhatsApp (11) 9 ____-____" value={whats}
                 onChange={e => {
                   const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                   setWhats(d.length >= 10 ? formatar(d) : d);
                 }} />
        </Box>

        {/* Só depois de 10 dígitos: acusar "número inválido" no terceiro
            dígito é o formulário reclamando de quem ainda está digitando. */}
        {whats.replace(/\D/g, '').length >= 10 && !whatsValido && (
          <Sub className="text-acento">
            Precisa ser um celular com DDD — o horário é confirmado no WhatsApp.
          </Sub>
        )}

        {/* A saída que torna a memória aceitável. Sem ela o formulário
            apareceria preenchido sem explicação, e no balcão da barbearia
            (um aparelho só) o próximo cliente marcaria com o telefone do
            anterior sem perceber. */}
        {veioDaMemoria && (
          <Sub>
            salvo neste aparelho ·{' '}
            <button type="button" className="underline hover:text-acento"
                    onClick={() => {
                      esquecerMeusDados();
                      setNome(''); setWhats(''); setVeioDaMemoria(false);
                    }}>
              não é você?
            </button>
          </Sub>
        )}

        {erro && <Sub className="text-acento">{erro}</Sub>}

        <Box variante={pronto && !enviando ? 'fill' : 'mut'}
             className={pronto ? 'cursor-pointer' : ''} onClick={confirmar}>
          {slot && servico
            ? `confirmar ${servico.nome.toLowerCase()} ${slot.hora} com ${slot.barbeiroNome}`
            : 'confirmar'}
        </Box>
        <Sub className="text-center">confirmação chega no seu zap</Sub>
      </section>
    </div>
  );
}
