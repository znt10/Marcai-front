/// As palavras de cada ramo (spec 2026-10-08, `Barbearia.tipo` no back).
///
/// O Marcaí nasceu para barbearia; a sobrancelha (e o "outro") usam o mesmo
/// sistema com outras palavras. Tabela, e não `.replace('barbearia', …)`: o
/// português muda o artigo e o gênero junto — "na barbearia", "no estúdio";
/// "nenhum barbeiro", "nenhuma profissional"; "o tempo dele", "o dela".
///
/// A barbearia é exatamente o texto de antes: é o que a Brutus já lê. O back
/// tem a sua tabela, menor, em `tenant/tipos.py` — as duas têm de concordar
/// no que repetem. Tipo novo entra pelos dois lados.

export type Tipo = 'BARBEARIA' | 'SOBRANCELHA' | 'OUTRO';

export const TIPOS: Tipo[] = ['BARBEARIA', 'SOBRANCELHA', 'OUTRO'];

/// O nome do ramo para quem ESCOLHE (o admin), e não a palavra do lugar:
/// a sobrancelha é um "estúdio", mas o ramo é "Sobrancelha".
export const NOME_DO_TIPO: Record<Tipo, string> = {
  BARBEARIA: 'Barbearia', SOBRANCELHA: 'Sobrancelha', OUTRO: 'Outro',
};

export type Vocabulario = {
  /// "barbearia", "estúdio" — no meio da frase.
  lugar: string;
  /// O mesmo, com maiúscula, para rótulo solto.
  Lugar: string;
  oLugar: string;
  doLugar: string;
  /// Antes do NOME do estabelecimento. Na barbearia continua "na Brutus";
  /// nos outros o nome não diz o gênero ("na Ana Sobrancelhas"? "no"?), então
  /// a palavra do lugar vai junto: "no estúdio Ana Sobrancelhas".
  noNome: (nome: string) => string;
  prof: string;
  Prof: string;
  profs: string;
  oProf: string;
  noProf: string;
  nenhumProf: string;
  /// O possessivo de quem atende: "o tempo, cada barbeiro coloca o DELE".
  dele: string;
  /// O que se conta no Resumo: "cortes" na barbearia.
  atendimento: string;
  atendimentos: string;
  /// O Resumo explica por que a soma das linhas passa do total de pessoas.
  quemPassouPorDois: string;
  /// As duas linhas grandes da vitrine.
  slogan: [string, string];
  /// O exemplo no campo de serviço novo. Na barbearia é a sobrancelha (o
  /// serviço que o dono costuma esquecer de cadastrar); no estúdio, outro.
  exemploServico: string;
};

export const VOCABULARIO: Record<Tipo, Vocabulario> = {
  BARBEARIA: {
    lugar: 'barbearia', Lugar: 'Barbearia', oLugar: 'a barbearia', doLugar: 'da barbearia',
    noNome: (nome) => `na ${nome}`,
    prof: 'barbeiro', Prof: 'Barbeiro', profs: 'barbeiros',
    oProf: 'o barbeiro', noProf: 'no barbeiro', nenhumProf: 'nenhum barbeiro', dele: 'dele',
    atendimento: 'corte', atendimentos: 'cortes',
    quemPassouPorDois: 'quem cortou com mais de um barbeiro',
    slogan: ['Corte de homem,', 'hora marcada.'],
    exemploServico: 'sobrancelha',
  },
  SOBRANCELHA: {
    lugar: 'estúdio', Lugar: 'Estúdio', oLugar: 'o estúdio', doLugar: 'do estúdio',
    noNome: (nome) => `no estúdio ${nome}`,
    prof: 'profissional', Prof: 'Profissional', profs: 'profissionais',
    oProf: 'a profissional', noProf: 'na profissional', nenhumProf: 'nenhuma profissional',
    dele: 'dela',
    atendimento: 'atendimento', atendimentos: 'atendimentos',
    quemPassouPorDois: 'quem passou por mais de uma profissional',
    slogan: ['Sobrancelha feita,', 'hora marcada.'],
    exemploServico: 'design com henna',
  },
  OUTRO: {
    lugar: 'espaço', Lugar: 'Espaço', oLugar: 'o espaço', doLugar: 'do espaço',
    noNome: (nome) => `no espaço ${nome}`,
    prof: 'profissional', Prof: 'Profissional', profs: 'profissionais',
    oProf: 'o profissional', noProf: 'no profissional', nenhumProf: 'nenhum profissional',
    dele: 'dele',
    atendimento: 'atendimento', atendimentos: 'atendimentos',
    quemPassouPorDois: 'quem passou por mais de um profissional',
    slogan: ['Seu horário,', 'hora marcada.'],
    exemploServico: 'manutenção',
  },
};

/// Tipo vazio ou desconhecido cai na barbearia: é o que o back de antes
/// deste campo devolve (nada), e o que toda barbearia já era.
export function vocabulario(tipo?: string | null): Vocabulario {
  return VOCABULARIO[(tipo ?? '') as Tipo] ?? VOCABULARIO.BARBEARIA;
}
