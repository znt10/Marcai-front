import { somarDias, diaSemanaDe } from '@/lib/datas';

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
const MESES_CURTOS = [
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
