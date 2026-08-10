import { pedir } from './client';

/// As rotas do admin da plataforma. Elas só existem no host `admin.` — fora
/// dele o proxy responde 404 antes de qualquer rota rodar.

export const LOGIN_DO_ADMIN = '/admin/login';

export type BarbeariaDaLista = {
  id: string; slug: string; nome: string; ativo: boolean;
  barbeiros: number; agendamentos: number;
};

/// Cinco campos. Sem horário — o admin não sabe o da barbearia, e o dono
/// preenche na tela dele. Sem número do dono — `whatsappContato` vira o login
/// dele, porque no cadastro é a mesma pessoa.
export type NovaBarbearia = {
  slug: string; nome: string; endereco: string;
  whatsappContato: string; donoNome: string;
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
