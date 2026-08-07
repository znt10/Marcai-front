import { pedir } from './client';

/// As rotas do admin da plataforma. Elas só existem no host `admin.` — fora
/// dele o proxy responde 404 antes de qualquer rota rodar.

export const LOGIN_DO_ADMIN = '/admin/login';

export type BarbeariaDaLista = {
  id: string; slug: string; nome: string; ativo: boolean;
  barbeiros: number; agendamentos: number;
};

export type NovaBarbearia = {
  slug: string; nome: string; endereco: string; horarioResumo: string;
  whatsappContato: string; donoNome: string; donoWhatsapp: string;
};

export const adminApi = {
  entrar: (usuario: string, senha: string) =>
    pedir<{ ok: true }>('/admin/auth/login', {
      metodo: 'POST', corpo: { usuario, senha },
    }),

  sair: () => pedir<{ ok: true }>('/admin/auth/logout', { metodo: 'POST' }),

  barbearias: (signal?: AbortSignal) =>
    pedir<{ barbearias: BarbeariaDaLista[] }>('/admin/barbearias', {
      signal, loginEm: LOGIN_DO_ADMIN,
    }).then((d) => d.barbearias),

  /// O link de convite volta **uma única vez**: o banco guarda só o hash dele.
  criarBarbearia: (dados: NovaBarbearia) =>
    pedir<{ linkConvite: string }>('/admin/barbearias', { metodo: 'POST', corpo: dados }),

  alternarAtivo: (id: string, ativo: boolean) =>
    pedir<{ ok: true }>(`/admin/barbearias/${id}`, { metodo: 'PATCH', corpo: { ativo } }),

  reemitirConvite: (id: string) =>
    pedir<{ linkConvite: string }>(`/admin/barbearias/${id}/convite`, { metodo: 'POST' }),
};
