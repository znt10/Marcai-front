import { pedir } from './client';

/// A conta global do cliente. Diferente do painel, **nenhuma** chamada passa
/// `loginEm`: aqui 401 é estado normal ("não logado"), e quem chama trata o
/// `ErroApi` com `status === 401`, sem ser expulso para tela nenhuma.

export type ContaEu = { nome: string; whatsapp: string };
export type ItemHistorico = {
  codigo: string; servicoNome: string; barbeiroNome: string;
  inicio: string; status: string; podeCancelar: boolean;
};
export type Lugar = {
  barbeariaId: string; slug: string; nome: string; tipo: string;
  agendamentos: ItemHistorico[];
};

export const contaApi = {
  eu: (signal?: AbortSignal) => pedir<ContaEu>('/conta/eu', { signal }),

  criar: (dados: { nome: string; whatsapp: string; senha: string }) =>
    pedir<{ ok: true }>('/conta/criar', { metodo: 'POST', corpo: dados }),

  reenviar: (whatsapp: string) =>
    pedir<{ ok: true }>('/conta/reenviar', { metodo: 'POST', corpo: { whatsapp } }),

  /// O back pede a senha de novo aqui: a conta só nasce quando o código bate.
  confirmar: (whatsapp: string, codigo: string, senha: string) =>
    pedir<ContaEu>('/conta/confirmar', { metodo: 'POST', corpo: { whatsapp, codigo, senha } }),

  entrar: (whatsapp: string, senha: string) =>
    pedir<ContaEu>('/conta/entrar', { metodo: 'POST', corpo: { whatsapp, senha } }),

  sair: () => pedir<{ ok: true }>('/conta/sair', { metodo: 'POST' }),

  esqueci: (whatsapp: string) =>
    pedir<{ ok: true }>('/conta/esqueci', { metodo: 'POST', corpo: { whatsapp } }),

  novaSenha: (token: string, senha: string) =>
    pedir<ContaEu>(`/conta/nova-senha/${encodeURIComponent(token)}`, {
      metodo: 'POST', corpo: { senha },
    }),

  historico: (signal?: AbortSignal) =>
    pedir<{ estabelecimentos: Lugar[] }>('/conta/historico', { signal })
      .then((d) => d.estabelecimentos),

  cancelar: (barbeariaId: string, codigo: string) =>
    pedir<{ ok: true }>(`/conta/agendamentos/${encodeURIComponent(codigo)}/cancelar`, {
      metodo: 'POST', corpo: { barbeariaId },
    }),
};
