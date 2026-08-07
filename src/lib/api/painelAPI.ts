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
