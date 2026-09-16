import { pedir } from './client';

/// As rotas do admin da plataforma. Elas só existem no host `admin.` — fora
/// dele o proxy responde 404 antes de qualquer rota rodar.

export const LOGIN_DO_ADMIN = '/admin/login';

/// O que a barbearia comprou. `SEM_ZAP`: o cliente não recebe WhatsApp e vê a
/// confirmação na tela; a equipe continua recebendo pelo número do Marcaí.
/// `COM_ZAP`: a barbearia tem número próprio, e é dele que saem as mensagens
/// para os clientes.
export type Plano = 'SEM_ZAP' | 'COM_ZAP';

export type BarbeariaDaLista = {
  id: string; slug: string; nome: string; ativo: boolean; plano: Plano;
  barbeiros: number; agendamentos: number;
};

/// Cinco campos. Sem horário — o admin não sabe o da barbearia, e o dono
/// preenche na tela dele. Sem número do dono — `whatsappContato` vira o login
/// dele, porque no cadastro é a mesma pessoa.
export type NovaBarbearia = {
  slug: string; nome: string; endereco: string;
  whatsappContato: string; donoNome: string;
  /// Ausente = `SEM_ZAP` do lado do servidor. Errar para o plano mais barato
  /// não manda mensagem nenhuma de um número errado; errar para o outro,
  /// manda.
  plano?: Plano;
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

  /// Um campo por chamada, e não os dois juntos, porque o servidor trata cada
  /// um como um gatilho: trocar de plano cria ou apaga a instância da
  /// Evolution, e desativar apaga também. No mesmo pedido, a ordem entre as
  /// duas decidiria o resultado.
  trocarPlano: (id: string, plano: Plano) =>
    pedir<{ ok: true }>(`/admin/barbearias/${id}`, { metodo: 'PATCH', corpo: { plano } }),

  reemitirConvite: (id: string) =>
    pedir<{ linkConvite: string }>(`/admin/barbearias/${id}/convite`, { metodo: 'POST' }),
};
