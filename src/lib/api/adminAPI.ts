import { pedir } from './client';
import type { Paleta } from '@/lib/paletas';
import type { SituacaoDaMensalidade } from '@/lib/mensalidade';
import type { Tipo } from '@/lib/tipos';

/// As rotas do admin da plataforma. Elas só existem no host `admin.` — fora
/// dele o proxy responde 404 antes de qualquer rota rodar.

export const LOGIN_DO_ADMIN = '/admin/login';

/// O que a barbearia comprou. Desde a etapa 1 do número central toda
/// barbearia é `COM_ZAP` (o cliente recebe pelo número do Marcaí); o tipo
/// fica para os planos futuros.
export type Plano = 'SEM_ZAP' | 'COM_ZAP';

export type BarbeariaDaLista = {
  id: string; slug: string; nome: string; ativo: boolean; plano: Plano;
  /// Ausentes no back de antes deles: barbearia, preto e amarelo.
  tipo?: Tipo; paleta?: Paleta;
  barbeiros: number; agendamentos: number;
};

/// Cinco campos. Sem horário — o admin não sabe o da barbearia, e o dono
/// preenche na tela dele. Sem número do dono — `whatsappContato` vira o login
/// dele, porque no cadastro é a mesma pessoa.
export type NovaBarbearia = {
  slug: string; nome: string; endereco: string;
  whatsappContato: string; donoNome: string;
  /// Ausente = `COM_ZAP` do lado do servidor.
  plano?: Plano;
  /// O ramo e as cores (spec 2026-10-08). Ausentes = barbearia; sem paleta,
  /// a sugerida pelo tipo.
  tipo?: Tipo;
  paleta?: Paleta;
};

/// O número central do Marcaí — desde a etapa 1 ele manda tudo, equipe e
/// cliente. `qrBase64` só vem quando ele não está conectado.
export type WhatsappCentral = {
  configurado: boolean;
  conectado: boolean;
  numero: string | null;
  qrBase64: string | null;
};

/// Uma linha da tela de mensalidades: a barbearia e como ela está com a
/// assinatura. Tudo vem calculado do back (`dias` é de atraso em ATRASADA e
/// BLOQUEADA, e o que falta em EM_DIA e VENCENDO).
export type LinhaDaMensalidade = {
  barbeariaId: string; nome: string; tipo?: Tipo; ativo: boolean;
  situacao: SituacaoDaMensalidade;
  dias: number | null;
  /// "YYYY-MM-DD"
  bloqueiaEm: string | null;
  valorCentavos: number | null;
  pagaAte: string | null;
  isenta: boolean;
  nuncaBloquear: boolean;
  /// O "já paguei" esperando o admin conferir o Pix.
  /// `porNome` é null quando o barbeiro que avisou foi apagado.
  informada: { cobrancaId: string; valorCentavos: number; em: string; porNome: string | null } | null;
  ultimaPaga: { pagaEm: string | null; valorCentavos: number; como: string } | null;
};

export type MensalidadesDoAdmin = {
  barbearias: LinhaDaMensalidade[];
  contadores: { informadas: number; atrasadas: number; bloqueadas: number };
};

/// O que o admin pode mudar numa assinatura: qualquer subconjunto.
export type CamposDaMensalidade = Partial<{
  valorCentavos: number; isenta: boolean; nuncaBloquear: boolean; pagaAte: string;
}>;

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

  whatsappCentral: (signal?: AbortSignal) =>
    pedir<WhatsappCentral>('/admin/whatsapp-central', { signal, loginEm: LOGIN_DO_ADMIN }),

  reemitirConvite: (id: string) =>
    pedir<{ linkConvite: string }>(`/admin/barbearias/${id}/convite`, { metodo: 'POST' }),

  mensalidades: (signal?: AbortSignal) =>
    pedir<MensalidadesDoAdmin>('/admin/mensalidades', { signal, loginEm: LOGIN_DO_ADMIN }),

  ajustarMensalidade: (barbeariaId: string, campos: CamposDaMensalidade) =>
    pedir<LinhaDaMensalidade>(`/admin/mensalidades/${barbeariaId}`, {
      metodo: 'PATCH', corpo: campos,
    }),

  /// Pagamento recebido fora do Pix do Marcaí (dinheiro, transferência).
  registrarPagamento: (
    barbeariaId: string,
    dados: { pagaAte: string; valorCentavos: number; observacao?: string },
  ) =>
    pedir<LinhaDaMensalidade>(`/admin/mensalidades/${barbeariaId}/registrar`, {
      metodo: 'POST', corpo: dados,
    }),

  confirmarCobranca: (cobrancaId: string) =>
    pedir<LinhaDaMensalidade>(`/admin/cobrancas/${cobrancaId}/confirmar`, { metodo: 'POST' }),

  recusarCobranca: (cobrancaId: string) =>
    pedir<LinhaDaMensalidade>(`/admin/cobrancas/${cobrancaId}/recusar`, { metodo: 'POST' }),
};
