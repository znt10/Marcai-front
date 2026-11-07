import { pedir } from './client';
import type { GrupoDeServico } from '@/lib/grupos';

/// As rotas do fluxo do cliente. Elas devolvem **envelope** — `{ servicos }`,
/// `{ barbeiros }`, `{ dias }` — e é aqui que o envelope é aberto, num lugar
/// só. Foi lendo envelope errado numa tela que o `FormMarcar` quebrou:
/// `fetch` devolve `any`, então nem o teste nem o `tsc` pegam.

export type Barbeiro = { id: string; nome: string; fotoUrl: string | null };
export type Servico = {
  id: string; nome: string; duracaoMin: number;
  /// Nulo quando ninguém que faz o serviço definiu preço ainda. Com
  /// `barbeiroId="qualquer"`, é o MENOR preço entre quem faz — mesma
  /// decisão de produto que já vale pra `duracaoMin`.
  precoCentavos: number | null;
  /// Nulo quando a casa não usa grupos.
  grupoId: string | null;
};
/// Os serviços e os grupos que têm algo para escolher (vazio = lista solta).
export type CardapioPublico = { servicos: Servico[]; grupos: GrupoDeServico[] };
export type Slot = {
  hora: string; inicio: string; fim: string;
  barbeiroId: string; barbeiroNome: string;
};
export type DiaComSlots = { data: string; rotulo: string; slots: Slot[] };

export type NovoAgendamento = {
  barbeiroId: string; servicoId: string; inicio: string;
  nome: string; whatsapp: string;
};

export const publicoApi = {
  barbeiros: (signal?: AbortSignal) =>
    pedir<{ barbeiros: Barbeiro[] }>('/barbeiros', { signal }).then((d) => d.barbeiros),

  servicos: (barbeiroId: string, signal?: AbortSignal) =>
    pedir<{ servicos: Servico[]; grupos?: GrupoDeServico[] }>('/servicos', { busca: { barbeiroId }, signal })
      .then((d): CardapioPublico => ({ servicos: d.servicos, grupos: d.grupos ?? [] })),

  horarios: (
    p: { barbeiroId: string; servicoId: string; de?: string; dias?: number },
    signal?: AbortSignal,
  ) =>
    pedir<{ dias: DiaComSlots[] }>('/horarios', { busca: { ...p }, signal })
      .then((d) => d.dias),

  diasComVaga: (
    p: { barbeiroId: string; servicoId: string; mes: string },
    signal?: AbortSignal,
  ) =>
    pedir<{ dias: number[] }>('/dias-com-vaga', { busca: { ...p }, signal })
      .then((d) => d.dias),

  agendar: (dados: NovoAgendamento) =>
    pedir<{ codigo: string }>('/agendamentos', { metodo: 'POST', corpo: dados }),

  cancelar: (codigo: string) =>
    pedir<{ ok: true }>(`/agendamentos/${codigo}/cancelar`, { metodo: 'POST' }),

  /// O barbeiro convidado define a senha. Pertence ao fluxo público porque
  /// quem abre o link ainda não tem sessão nenhuma.
  definirSenha: (token: string, senha: string) =>
    pedir<{ ok: true }>(`/auth/convite/${token}`, { metodo: 'POST', corpo: { senha } }),
};
