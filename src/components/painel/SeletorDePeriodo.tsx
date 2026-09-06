'use client';
import { useEffect, useRef, useState } from 'react';
import {
  MESES_CURTOS, diasDaGrade, inicioDaSemana, mesDe, rotuloDoMes, somarMeses,
  type Modo,
} from '@/lib/resumo';

/// A navegação de período do resumo: `‹ rótulo ›`, e o rótulo é um BOTÃO.
///
/// As setas sozinhas resolvem "a semana passada" e não resolvem "o domingo
/// retrasado": chegar lá custa dez cliques, e cada um deles refaz a consulta.
/// Clicando no rótulo, o salto é um clique só.
///
/// Ela também substituiu os DOIS campos de data que ficavam embaixo ("de" e
/// "até"). Dois campos pediam duas decisões para escolher uma coisa só, e
/// abriam um quarto estado — o intervalo que não é dia, nem semana, nem mês —
/// que a própria spec do resumo argumenta contra: o que o dono compara é
/// "setembro contra agosto", não "estes 23 dias contra os 23 anteriores".
///
/// O que se perde: não dá mais para pedir 12/03 a 07/08. Nenhum dos três modos
/// some, e a rota continua aceitando qualquer intervalo — o que saiu foi a
/// forma de digitá-lo aqui.
const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const numeroDoDia = (dia: string) => Number(dia.slice(8, 10));

export function SeletorDePeriodo({
  modo, ancora, rotulo, hoje, podeAvancar, aoVoltarParaHoje,
  aoAndar, aoEscolherDia, aoEscolherMes,
}: {
  modo: Modo;
  /// Dia âncora nos modos `dia` e `semana`; nele o mês é derivado.
  ancora: string;
  rotulo: string;
  hoje: string;
  podeAvancar: boolean;
  /// `null` quando o período mostrado JÁ contém hoje — não há de onde voltar,
  /// e um botão que não leva a lugar nenhum é pior que botão nenhum.
  aoVoltarParaHoje: (() => void) | null;
  aoAndar: (direcao: 1 | -1) => void;
  aoEscolherDia: (dia: string) => void;
  aoEscolherMes: (mesISO: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    const fechar = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    // Escape devolve o foco ao gatilho: quem abriu pelo teclado ficaria perdido
    // no fim do documento se o foco morresse junto com a grade.
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        gatilho.current?.focus();
      }
    };

    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', teclado);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', teclado);
    };
  }, [aberto]);

  function escolher(acao: () => void) {
    acao();
    setAberto(false);
    gatilho.current?.focus();
  }

  // O rótulo do atalho segue o MODO: "hoje" quando se olha um dia, "esta
  // semana" quando se olha uma semana. Um "hoje" que abrisse a semana inteira
  // prometeria uma coisa e faria outra.
  const rotuloDoAtalho = modo === 'dia' ? 'hoje' : modo === 'semana' ? 'esta semana' : 'este mês';

  return (
    // `flex-nowrap` e o `flex-1` na barra, e nao `flex-wrap` com largura fixa:
    // envolvendo, o atalho caia para a linha de baixo e ficava ATRAS do
    // calendario aberto (que e' `absolute` e nao ocupa espaco). Sumia
    // exatamente quando alguem estava olhando para ele.
    <div className="flex w-full max-w-[400px] items-center gap-2">
      <div ref={caixa} className="relative min-w-0 flex-1">
      <div className="flex items-center gap-1 rounded-wf border border-borda bg-superficie px-1">
        <Seta rotulo="Período anterior" onClick={() => aoAndar(-1)}>‹</Seta>

        <button ref={gatilho} type="button"
                onClick={() => setAberto((estava) => !estava)}
                aria-haspopup="dialog" aria-expanded={aberto}
                className="flex-1 min-w-0 truncate px-2 py-2.5 text-center font-letreiro
                           uppercase tracking-[0.06em] text-sm md:text-base
                           text-tinta hover:text-acento transition-colors">
          {rotulo}
        </button>

        {/* Adiantar não é proibido, só inútil: período que ainda não aconteceu
            vem zerado, porque o serviço só conta o que já terminou. A seta
            desligada diz isso sem precisar de uma tela vazia para explicar. */}
        <Seta rotulo="Próximo período" disabled={!podeAvancar} onClick={() => aoAndar(1)}>›</Seta>
      </div>

      {aberto && (
        <div role="dialog" aria-label={modo === 'mes' ? 'Escolher mês' : 'Escolher dia'}
             className="absolute z-30 mt-1 w-[290px] rounded-wf border border-borda
                        bg-superficie p-3 shadow-lg">
          {modo === 'mes' ? (
            <GradeDeMeses mesISO={mesDe(ancora)} hoje={hoje}
                          aoEscolher={(m) => escolher(() => aoEscolherMes(m))} />
          ) : (
            <GradeDeDias ancora={ancora} hoje={hoje} porSemana={modo === 'semana'}
                         aoEscolher={(d) => escolher(() => aoEscolherDia(d))} />
          )}
        </div>
        )}
      </div>

      {/* Só aparece quando há de onde voltar. Chegar em março pelas setas e
          precisar de doze cliques para desandar era o outro lado do problema
          que o calendário resolveu — o calendário leva a qualquer lugar, e
          este botão traz de volta do lugar nenhum. */}
      {aoVoltarParaHoje && (
        <button type="button" onClick={aoVoltarParaHoje}
                className="shrink-0 rounded-wf border border-borda bg-superficie
                           px-3 py-2.5 font-letreiro uppercase tracking-[0.06em]
                           text-[11px] md:text-xs text-sub hover:text-acento
                           transition-colors">
          {rotuloDoAtalho}
        </button>
      )}
    </div>
  );
}

function Seta({ children, rotulo, disabled, onClick }: {
  children: React.ReactNode; rotulo: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" aria-label={rotulo} disabled={disabled} onClick={onClick}
            className="shrink-0 px-2.5 py-2 text-lg leading-none text-sub
                       hover:text-acento disabled:opacity-30 disabled:hover:text-sub
                       transition-colors">
      {children}
    </button>
  );
}

function Cabecalho({ titulo, aoVoltar, aoAvancar, rotuloVoltar, rotuloAvancar }: {
  titulo: string; aoVoltar: () => void; aoAvancar: () => void;
  rotuloVoltar: string; rotuloAvancar: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <Seta rotulo={rotuloVoltar} onClick={aoVoltar}>‹</Seta>
      <span className="flex-1 text-center font-letreiro uppercase tracking-[0.06em] text-sm">
        {titulo}
      </span>
      <Seta rotulo={rotuloAvancar} onClick={aoAvancar}>›</Seta>
    </div>
  );
}

function GradeDeDias({ ancora, hoje, porSemana, aoEscolher }: {
  ancora: string; hoje: string; porSemana: boolean; aoEscolher: (dia: string) => void;
}) {
  // O mês visitado é estado PRÓPRIO: folhear até março e fechar sem escolher
  // nada não pode mexer no que a tela está mostrando.
  const [mes, setMes] = useState(() => mesDe(ancora));
  const semanaEscolhida = inicioDaSemana(ancora);

  return (
    <>
      <Cabecalho titulo={rotuloDoMes(mes, hoje)}
                 aoVoltar={() => setMes(somarMeses(mes, -1))}
                 aoAvancar={() => setMes(somarMeses(mes, 1))}
                 rotuloVoltar="Mês anterior" rotuloAvancar="Próximo mês" />

      <div className="mb-1 grid grid-cols-7 gap-[2px]">
        {DIAS_DA_SEMANA.map((d) => (
          <span key={d} className="py-1 text-center text-[10px] uppercase
                                   tracking-[0.08em] text-lbl">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-[2px]">
        {diasDaGrade(mes).map((dia) => {
          // No modo semana a LINHA inteira acende, porque é ela que a tela vai
          // mostrar — clicar numa quarta abre a semana da quarta.
          const escolhido = porSemana ? inicioDaSemana(dia) === semanaEscolhida : dia === ancora;
          const doMes = mesDe(dia) === mes;
          const ehHoje = dia === hoje;

          return (
            <button key={dia} type="button" onClick={() => aoEscolher(dia)}
                    aria-pressed={escolhido}
                    aria-current={ehHoje ? 'date' : undefined}
                    className={[
                      'h-8 rounded-[4px] text-[13px] font-dado tabular-nums transition-colors',
                      // A semana inteira em latão sólido seriam sete blocos
                      // gritando dentro de uma caixa pequena; no fundo
                      // apagado ela continua óbvia e ainda deixa a marca de
                      // "hoje" aparecer por baixo.
                      escolhido && porSemana ? 'bg-mut text-acento'
                        : escolhido ? 'bg-latao text-fundo'
                        : doMes ? 'text-tinta hover:bg-mut'
                        : 'text-lbl/60 hover:bg-mut',
                      ehHoje && !(escolhido && !porSemana)
                        ? 'ring-1 ring-inset ring-latao/50 text-acento' : '',
                    ].join(' ')}>
              {numeroDoDia(dia)}
            </button>
          );
        })}
      </div>
    </>
  );
}

/// Doze botões e um ano: no modo mensal não há dia para escolher, e uma grade
/// de dias só pediria uma informação que a tela ia jogar fora.
function GradeDeMeses({ mesISO, hoje, aoEscolher }: {
  mesISO: string; hoje: string; aoEscolher: (mes: string) => void;
}) {
  const [ano, setAno] = useState(() => Number(mesISO.slice(0, 4)));
  const mesDeHoje = mesDe(hoje);

  return (
    <>
      <Cabecalho titulo={String(ano)}
                 aoVoltar={() => setAno(ano - 1)} aoAvancar={() => setAno(ano + 1)}
                 rotuloVoltar="Ano anterior" rotuloAvancar="Próximo ano" />

      <div className="grid grid-cols-3 gap-1.5">
        {MESES_CURTOS.map((nome, i) => {
          const valor = `${ano}-${String(i + 1).padStart(2, '0')}`;
          const escolhido = valor === mesISO;

          return (
            <button key={valor} type="button" onClick={() => aoEscolher(valor)}
                    aria-pressed={escolhido}
                    className={[
                      'h-9 rounded-[4px] text-[13px] transition-colors',
                      escolhido ? 'bg-latao text-fundo' : 'text-tinta hover:bg-mut',
                      valor === mesDeHoje && !escolhido
                        ? 'ring-1 ring-inset ring-latao/50 text-acento' : '',
                    ].join(' ')}>
              {nome}
            </button>
          );
        })}
      </div>
    </>
  );
}
