import { pedir } from './client';
import type { NovoAgendamento } from './publicoAPI';

/// As rotas do painel do barbeiro. Todas as de leitura passam `loginEm`:
/// sessão morta manda para a tela de entrada em vez de deixar a tela vazia
/// sem explicação.

export const LOGIN_DO_PAINEL = '/painel/login';

export type Eu = { id: string; nome: string; papel: 'DONO' | 'BARBEIRO' };

export type ItemDaAgenda = {
  id: string; inicio: string; fim: string; servicoNome: string;
  barbeiroId: string; barbeiroNome: string;
  clienteNome: string; clienteWhatsapp: string;
};

export const painelApi = {
  entrar: (whatsapp: string, senha: string) =>
    pedir<{ nome: string; papel: Eu['papel'] }>('/auth/login', {
      metodo: 'POST', corpo: { whatsapp, senha },
    }),

  sair: () => pedir<{ ok: true }>('/auth/logout', { metodo: 'POST' }),

  eu: (signal?: AbortSignal) =>
    pedir<Eu>('/auth/eu', { signal, loginEm: LOGIN_DO_PAINEL }),

  agenda: (dia: string, barbeiroId?: string, signal?: AbortSignal) =>
    pedir<{ dia: string; itens: ItemDaAgenda[] }>('/painel/agenda', {
      busca: { dia, barbeiroId }, signal, loginEm: LOGIN_DO_PAINEL,
    }),

  marcar: (dados: NovoAgendamento) =>
    pedir<{ codigo: string }>('/painel/agendamentos', { metodo: 'POST', corpo: dados }),

  cancelar: (id: string) =>
    pedir<{ ok: true }>(`/painel/agendamentos/${id}/cancelar`, { metodo: 'POST' }),
};

export type DiaDeTrabalho = {
  diaSemana: number;
  /// `null` nos dois = dia fechado. A ausência da linha é a representação de
  /// "não trabalho" (o motor devolve vazio), e o `GET` manda os sete dias
  /// sempre para a tela não confundir "fechado" com "não carregou".
  minutosInicio: number | null;
  minutosFim: number | null;
};

export type Bloqueio = {
  id: string;
  motivo: 'ALMOCO' | 'FOLGA' | 'PESSOAL' | 'OUTRO';
  observacao: string | null;
  repeteSemanalmente: boolean;
  diaSemana: number | null;
  minutosInicio: number | null;
  minutosFim: number | null;
  inicio: string | null;
  fim: string | null;
};

export type Conflito = {
  id: string; inicio: string; fim: string; servicoNome: string;
  clienteNome: string; clienteWhatsapp: string;
};

/// Dono mexe no de todos, barbeiro no seu: `barbeiroId` ausente é "eu", e
/// barbeiro pedindo o de um colega recebe 404.
export const horariosApi = {
  ver: (barbeiroId?: string, signal?: AbortSignal) =>
    pedir<{ barbeiroId: string; expediente: DiaDeTrabalho[]; bloqueios: Bloqueio[] }>(
      '/painel/expediente', { busca: { barbeiroId }, signal, loginEm: LOGIN_DO_PAINEL }),

  definirDia: (p: { barbeiroId?: string; diaSemana: number; minutosInicio: number; minutosFim: number }) =>
    pedir<{ ok: true }>('/painel/expediente', {
      metodo: 'PUT', corpo: p, loginEm: LOGIN_DO_PAINEL,
    }),

  fecharDia: (diaSemana: number, barbeiroId?: string) =>
    pedir<{ ok: true }>('/painel/expediente', {
      metodo: 'DELETE', busca: { diaSemana, barbeiroId }, loginEm: LOGIN_DO_PAINEL,
    }),

  criarBloqueio: (p: Partial<Bloqueio> & { motivo: Bloqueio['motivo']; repeteSemanalmente: boolean; barbeiroId?: string }) =>
    pedir<{ id: string }>('/painel/bloqueios', {
      metodo: 'POST', corpo: p, loginEm: LOGIN_DO_PAINEL,
    }),

  apagarBloqueio: (id: string) =>
    pedir<{ ok: true }>(`/painel/bloqueios/${id}`, {
      metodo: 'DELETE', loginEm: LOGIN_DO_PAINEL,
    }),

  conflitos: (barbeiroId?: string, signal?: AbortSignal) =>
    pedir<{ conflitos: Conflito[] }>('/painel/conflitos', {
      busca: { barbeiroId }, signal, loginEm: LOGIN_DO_PAINEL,
    }).then((d) => d.conflitos),
};

export type MembroDaEquipe = {
  id: string; nome: string; whatsapp: string;
  papel: Eu['papel']; ativo: boolean; desativadoEm: string | null;
  temSenha: boolean; conviteExpirado: boolean;
  /// Zero em `servicos` ou em `expediente` e o barbeiro **não aparece para o
  /// cliente** — é o que a tela avisa em destaque.
  servicos: number; expediente: number;
  /// O que impede desativar.
  agendamentosFuturos: number;
};

export type NovoBarbeiro = { nome: string; whatsapp: string; papel: Eu['papel'] };

/// Só o dono chega aqui: as rotas respondem 403 para `BARBEIRO`.
export const equipeApi = {
  listar: (signal?: AbortSignal) =>
    pedir<{ equipe: MembroDaEquipe[] }>('/painel/equipe', {
      signal, loginEm: LOGIN_DO_PAINEL,
    }).then((d) => d.equipe),

  // As mutações também levam `loginEm`: a de editar pode derrubar a PRÓPRIA
  // sessão (papel e celular incrementam o tokenVersion), e sem isso o 401
  // seguinte pintaria "não autorizado" numa tela morta em vez de levar para a
  // entrada.
  cadastrar: (dados: NovoBarbeiro) =>
    pedir<{ id: string; linkConvite: string }>('/painel/equipe', {
      metodo: 'POST', corpo: dados, loginEm: LOGIN_DO_PAINEL,
    }),

  editar: (id: string, dados: Partial<NovoBarbeiro>) =>
    pedir<{ ok: true }>(`/painel/equipe/${id}`, {
      metodo: 'PATCH', corpo: dados, loginEm: LOGIN_DO_PAINEL,
    }),

  reemitirConvite: (id: string) =>
    pedir<{ linkConvite: string }>(`/painel/equipe/${id}/convite`, {
      metodo: 'POST', loginEm: LOGIN_DO_PAINEL,
    }),

  desativar: (id: string) =>
    pedir<{ ok: true }>(`/painel/equipe/${id}/desativar`, {
      metodo: 'POST', loginEm: LOGIN_DO_PAINEL,
    }),

  reativar: (id: string) =>
    pedir<{ ok: true }>(`/painel/equipe/${id}/reativar`, {
      metodo: 'POST', loginEm: LOGIN_DO_PAINEL,
    }),
};
