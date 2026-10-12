import { somarDias, diaSemanaDe } from '@/lib/datas';
import type { ServicoDoResumo } from '@/lib/api';

/// Os períodos do resumo: **modo mais âncora**, e não uma janela rolando.
///
/// A versão anterior tinha "7 dias" como os últimos sete dias contados de
/// hoje — o que na prática dava terça a terça, e não uma semana. Semana de
/// calendário (domingo a sábado) e mês pelo nome existem por um motivo que a
/// janela rolando não atende: **comparar**. "Setembro contra agosto" é uma
/// pergunta que o dono faz; "os últimos 30 dias contra os 30 anteriores" não é.
///
/// A âncora é qualquer dia DENTRO do período — as setas movem a âncora, e o
/// período se redesenha em volta dela. Guardar as duas pontas em vez da
/// âncora obrigaria cada seta a saber desmontar e remontar o intervalo, e é
/// onde nasce o erro de somar 30 dias achando que somou um mês.
///
/// Todo intervalo daqui é INCLUSIVO nas duas pontas, que é o que a rota
/// `/painel/resumo` espera.

export type Modo = 'dia' | 'semana' | 'mes';
export type Periodo = { de: string; ate: string };

/// A ordem é a dos botões na tela e o critério de desempate de
/// `modoDoPeriodo`: um período de um dia só casa com `dia` e com nada mais,
/// mas se um dia casasse com dois modos, o primeiro da lista ganharia.
export const MODOS: readonly { chave: Modo; rotulo: string }[] = [
  { chave: 'dia', rotulo: 'dia' },
  { chave: 'semana', rotulo: 'semana' },
  { chave: 'mes', rotulo: 'mês' },
];

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
/// Os mesmos três caracteres que `tenant/datas.py` usa do outro lado —
/// inclusive "sab" e "set" sem acento. Divergir aqui faria a mesma data se
/// escrever de dois jeitos dependendo de qual lado a produziu.
export const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const partes = (dia: string) => {
  const [ano, mes, d] = dia.split('-').map(Number);
  return { ano, mes, dia: d };
};

/// Aritmética de mês em inteiro, sem `Date`: `mes` pode ser 0 ou 13 e a
/// função resolve o ano sozinha. É o que impede o buraco clássico — somar 30
/// dias a 31/01 dá 02/03 e pula fevereiro inteiro — sem precisar de nenhuma
/// tabela de comprimento de mês, e sem tocar em fuso.
function primeiroDoMes(ano: number, mes: number): string {
  const a = ano + Math.floor((mes - 1) / 12);
  const m = (((mes - 1) % 12) + 12) % 12 + 1;
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

export function periodoDe(modo: Modo, ancora: string): Periodo {
  switch (modo) {
    case 'dia':
      return { de: ancora, ate: ancora };
    case 'semana': {
      // `diaSemanaDe` é `getDay()`: DOMINGO = 0. Essa é a linha mais fácil de
      // errar do arquivo — a convenção de segunda=0 (o `weekday()` do Python,
      // o `isoweekday()`, e o hábito de quem pensa "semana começa segunda")
      // desloca a semana INTEIRA em um dia, e o resultado fica coerente
      // consigo mesmo o suficiente para ninguém desconfiar.
      const de = somarDias(ancora, -diaSemanaDe(ancora));
      return { de, ate: somarDias(de, 6) };
    }
    case 'mes': {
      const { ano, mes } = partes(ancora);
      // O último dia sai de "primeiro do mês seguinte, menos um". Fevereiro e
      // ano bissexto saem certos de graça, sem tabela nenhuma.
      return { de: primeiroDoMes(ano, mes), ate: somarDias(primeiroDoMes(ano, mes + 1), -1) };
    }
  }
}

/// Move a âncora um período inteiro para trás (`n` negativo) ou para frente.
export function andar(modo: Modo, ancora: string, n: number): string {
  switch (modo) {
    case 'dia':
      return somarDias(ancora, n);
    case 'semana':
      return somarDias(ancora, n * 7);
    case 'mes':
      // Normaliza para o dia 1 de propósito: andando a partir de 31/01, um
      // "mais um mês" que preservasse o dia 31 cairia em 31/02, que não
      // existe.
      return primeiroDoMes(partes(ancora).ano, partes(ancora).mes + n);
  }
}

/// O texto que fica entre as setas. Curto: ele é lido de relance, no meio do
/// expediente, e disputa espaço com os controles no celular.
export function rotuloDe(modo: Modo, ancora: string, hoje: string): string {
  const p = periodoDe(modo, ancora);
  const a = partes(p.de);
  const b = partes(p.ate);
  // O ano só aparece quando não é o corrente — sem isso, "setembro" de 2025 e
  // de 2026 se leem exatamente iguais na tela, e o dono compara o mês errado.
  const ano = a.ano !== partes(hoje).ano ? ` ${a.ano}` : '';

  if (modo === 'dia') {
    if (p.de === hoje) return 'hoje';
    if (p.de === somarDias(hoje, -1)) return 'ontem';
    return `${a.dia} ${MESES_CURTOS[a.mes - 1]}${ano}`;
  }

  if (modo === 'mes') return `${MESES[a.mes - 1]}${ano}`;

  // Semana: o mês só se repete na primeira ponta quando as duas pontas caem
  // em meses diferentes. "6 – 12 set" em vez de "6 set – 12 set".
  const inicio = a.mes === b.mes ? `${a.dia}` : `${a.dia} ${MESES_CURTOS[a.mes - 1]}`;
  return `${inicio} – ${b.dia} ${MESES_CURTOS[b.mes - 1]}${ano}`;
}

/// Qual botão deve estar aceso para o intervalo atual — `null` quando o dono
/// digitou um intervalo próprio nos campos de data. Sem isso, mexer nas datas
/// deixaria um modo aceso apontando para um período que não é mais o dele.
///
/// Note que sete dias começando numa terça devolve `null`, e é o ponto:
/// aquilo não é uma semana, é um intervalo de sete dias.
/// Porcentagens inteiras que somam EXATAMENTE 100.
///
/// Arredondar cada fatia por conta própria não fecha: 14, 11 e 6 de 31 dão
/// 45,16% / 35,48% / 19,35%, que arredondados viram 45+35+19 = 99. Três
/// números que não somam cem, num desenho cuja única promessa é ser o todo
/// repartido, é exatamente o tipo de detalhe que faz o dono desconfiar do
/// resto da tela — o mesmo problema que a frase sobre "clientes distintos"
/// resolve em outro canto do resumo.
///
/// Método do maior resto: dá o piso a todos e distribui os pontos que
/// sobraram para quem tem a maior parte fracionária. Empate cai na ordem de
/// entrada, que é a ordem das fatias (maior primeiro) — assim o resultado é
/// determinístico e a mesma entrada sempre pinta a mesma tela.
export function porcentagens(valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return valores.map(() => 0);

  const exatos = valores.map((v) => (v / total) * 100);
  const saida = exatos.map(Math.floor);
  let sobra = 100 - saida.reduce((s, v) => s + v, 0);

  const porResto = exatos
    .map((e, i) => ({ i, resto: e - Math.floor(e) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  for (const { i } of porResto) {
    if (sobra <= 0) break;
    saida[i] += 1;
    sobra -= 1;
  }
  return saida;
}

export function modoDoPeriodo(p: Periodo): Modo | null {
  for (const { chave } of MODOS) {
    const alvo = periodoDe(chave, p.de);
    if (alvo.de === p.de && alvo.ate === p.ate) return chave;
  }
  return null;
}

/// ## A cor de cada serviço
///
/// Quatro cores, e não seis: numa pizza qualquer fatia pode ser comparada com
/// qualquer outra — e a primeira e a última ainda se encostam no anel. Então a
/// paleta precisa passar no teste de TODOS os pares, não só dos vizinhos, e é
/// aí que o tema escuro aperta. Cinco e seis foram medidos e reprovaram;
/// quatro passa nos cinco testes, com pior separação ΔE 9.3 sob deuteranopia
/// e 19.4 em visão normal, contra o fundo do painel nos dois temas. No claro o
/// dourado fica em 2.97:1 de contraste — a legenda escreve nome e número de
/// cada fatia, e é ela que cobre isso.
///
/// Nasceram para a pizza da divisão entre a EQUIPE, que saiu quando o resumo
/// passou a dividir por serviço (12/10): as linhas com barra já respondiam
/// quem fez mais.
export const CORES_DO_RESUMO = ['#b88819', '#4a8ed0', '#c2537f', '#2e7a45'];

/// Cinza de recuo, fora da paleta categórica de propósito: "outros" não é uma
/// identidade, é a ausência de uma.
export const COR_OUTROS = '#6c5e54';

/// Qual cor é de qual serviço — e a resposta **não depende de quem vendeu
/// mais**, nem de qual profissional está escolhido.
///
/// Sai SEMPRE dos serviços do salão inteiro no período, e vale para todos os
/// chips. Calculada por profissional, o "Cabelo" seria dourado no Todos e azul
/// no Nando — e quem aprendeu a cor numa tela leria errado a outra.
///
/// O volume decide só **quem ganha cor** (os maiores, porque a cauda dobra em
/// "outros"); QUAL cor vem da ordem do catálogo, que é a que o back manda e não
/// muda com o movimento do mês. Ordenar por volume aqui faria dois serviços
/// trocarem de cor só por trocarem de posição de um mês para o outro.
export function coresPorServico(
  servicos: readonly { servicoId: string; cortes: number }[],
  maximoDeCores = CORES_DO_RESUMO.length,
): Map<string, string> {
  const comCorte = servicos.filter((s) => s.cortes > 0);
  // Quem aparece nomeado: todos, se couberem; senão os maiores, guardando uma
  // vaga para o "outros" que recolhe a cauda.
  const nomeados =
    comCorte.length <= maximoDeCores
      ? comCorte
      : [...comCorte].sort((a, b) => b.cortes - a.cortes).slice(0, maximoDeCores - 1);

  const ehNomeado = new Set(nomeados.map((s) => s.servicoId));
  const cores = new Map<string, string>();
  let i = 0;
  // Percorre na ordem ORIGINAL (a do catálogo), não na de volume.
  for (const s of servicos) {
    if (ehNomeado.has(s.servicoId)) cores.set(s.servicoId, CORES_DO_RESUMO[i++]);
  }
  return cores;
}

export type LinhaDaLegenda = ServicoDoResumo & { cor: string; pct: number; nomeado: boolean };
export type FatiaDaRosca = { chave: string; nome: string; cortes: number; cor: string };

/// O que a rosca e a legenda desenham, para o salão ou para um profissional.
///
/// A LEGENDA lista todo serviço, cada um com seus números — inclusive os da
/// cauda: o dono quer saber quanto entrou de pigmentação mesmo quando ela não
/// ganhou cor. A ROSCA junta a cauda numa fatia cinza só, porque duas fatias
/// cinzas encostadas se leem como uma.
///
/// A ordem é por volume, maior primeiro (é o que faz a maior fatia começar no
/// topo e a leitura girar do maior para o menor), e a cauda vem por último —
/// na legenda e na rosca, para as duas lerem na mesma ordem.
export function montarPizza(
  servicos: readonly ServicoDoResumo[],
  cores: Map<string, string>,
): { linhas: LinhaDaLegenda[]; fatias: FatiaDaRosca[]; cortes: number; centavos: number | null } {
  const comCorte = servicos.filter((s) => s.cortes > 0);
  const porVolume = (a: ServicoDoResumo, b: ServicoDoResumo) => b.cortes - a.cortes;
  const nomeados = comCorte.filter((s) => cores.has(s.servicoId)).sort(porVolume);
  const cauda = comCorte.filter((s) => !cores.has(s.servicoId)).sort(porVolume);
  const emOrdem = [...nomeados, ...cauda];

  const pct = porcentagens(emOrdem.map((s) => s.cortes));
  const linhas = emOrdem.map((s, i) => ({
    ...s,
    cor: cores.get(s.servicoId) ?? COR_OUTROS,
    pct: pct[i],
    nomeado: cores.has(s.servicoId),
  }));

  const fatias: FatiaDaRosca[] = nomeados.map((s) => ({
    chave: s.servicoId, nome: s.nome, cortes: s.cortes, cor: cores.get(s.servicoId)!,
  }));
  if (cauda.length > 0) {
    fatias.push({
      chave: 'outros',
      nome: cauda.length === 1 ? cauda[0].nome : `outros (${cauda.length})`,
      cortes: cauda.reduce((soma, s) => soma + s.cortes, 0),
      cor: COR_OUTROS,
    });
  }

  // Mesma regra da rota: sem preço nenhum é `null`, com parte sem preço soma
  // o que tem.
  const comPreco = emOrdem.filter((s) => s.centavos !== null);
  return {
    linhas,
    fatias,
    cortes: emOrdem.reduce((soma, s) => soma + s.cortes, 0),
    centavos: comPreco.length > 0 ? comPreco.reduce((soma, s) => soma + s.centavos!, 0) : null,
  };
}

/// ## O calendário do seletor
///
/// As setas sozinhas resolvem "a semana passada" e não resolvem "o domingo
/// retrasado": chegar lá custa dez cliques. Por isso o rótulo entre elas vira
/// botão, e clicar abre a grade — o salto passa a ser um clique.
///
/// Estas funções são puras e ficam aqui, e não dentro do componente, porque a
/// aritmética de calendário é onde o erro de convenção mora (`diaSemanaDe` é
/// `getDay()`: DOMINGO = 0) e porque assim ela tem teste sem montar tela.

/// O domingo que abre a semana de `dia`. Mesma conta que `periodoDe('semana')`
/// faz por dentro — exportada porque a grade precisa dela para acender a
/// LINHA inteira: no modo semana, clicar numa quarta abre a semana da quarta.
export function inicioDaSemana(dia: string): string {
  return somarDias(dia, -diaSemanaDe(dia));
}

/// "2026-09-06" -> "2026-09". O mês como o `<input type="month">` o escreve.
export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

export function somarMeses(mesISO: string, n: number): string {
  const [ano, mes] = mesISO.split('-').map(Number);
  return primeiroDoMes(ano, mes + n).slice(0, 7);
}

/// Os 42 dias que a grade desenha: SEIS linhas, sempre.
///
/// Sempre seis, e não "as que couberem": com cinco, o calendário muda de
/// altura ao virar o mês e o que está embaixo dele pula sob o ponteiro de
/// quem ia clicar. Um mês pode precisar de quatro linhas e meia ou de seis;
/// fixar em seis é o que faz a caixa parar quieta.
///
/// Começa no domingo da semana que contém o dia 1º — inclusive quando esse
/// domingo é do mês anterior, que é o que faz cada linha da grade ser
/// exatamente uma semana e o modo semana poder acender a linha inteira.
export function diasDaGrade(mesISO: string): string[] {
  const primeiro = inicioDaSemana(`${mesISO}-01`);
  return Array.from({ length: 42 }, (_, i) => somarDias(primeiro, i));
}

/// "setembro" — e com o ano quando não é o corrente, pela mesma razão de
/// `rotuloDe`: sem ele, setembro de 2025 e de 2026 se leem exatamente iguais.
export function rotuloDoMes(mesISO: string, hoje: string): string {
  const [ano, mes] = mesISO.split('-').map(Number);
  return `${MESES[mes - 1]}${ano !== Number(hoje.slice(0, 4)) ? ` ${ano}` : ''}`;
}
