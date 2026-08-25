export const FUSO = 'America/Sao_Paulo';

// Duração de serviço — os dois limites globais (§5.1).
// ATENÇÃO: duplicados no CHECK da migração da Tarefa 3. Mudar aqui exige
// mudar lá. O teste `config-bate-com-banco` falha se divergirem.
export const DURACAO_MINIMA_MIN = 10;
export const DURACAO_MAXIMA_MIN = 60;

// Passo da grade — independente da duração do serviço (§6.2.1).
export const GRANULARIDADE_MIN = 30;

export const ANTECEDENCIA_MINIMA_MIN = 0;
export const PRAZO_CANCELAMENTO_MIN = 60;
export const DIAS_NA_HOME = 2;
export const JANELA_MAXIMA_DIAS = 60;
// O lembrete e a cadência do agendador que o dispara, lado a lado porque um
// depende do outro: TIQUE precisa ser MENOR que a antecedência, senão quem
// entra na janela entre dois tiques nunca é visto. Com 60 e 10, a mensagem sai
// entre 50 e 60 minutos antes — dentro do que a tela promete.
// O tique é lido pelo serviço `agendador` do docker-compose, não pelo app.
export const LEMBRETE_ANTECEDENCIA_MIN = 60;
export const LEMBRETE_TIQUE_MIN = 10;

// Multi-tenant (§9.4)
export const SUBDOMINIOS_RESERVADOS = [
  'www', 'api', 'app', 'admin', 'painel', 'static', 'assets', 'cdn', 'mail',
] as const;
export const TTL_CACHE_TENANT_MS = 60_000;
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/;

// Admin da plataforma (admin §4).
// A trava do login do admin é por IP, e não por conta como a do barbeiro:
// a conta é UMA, então travá-la deixaria qualquer um trancar o dono do site
// fora do próprio painel com cinco requisições.
export const ADMIN_TRAVA_BASE_MS = 1_000;
export const ADMIN_TRAVA_TETO_MS = 60_000;
// Passou disso, o IP fica de castigo por 10 minutos. Antes do limite a espera
// só cresce (1s, 2s, 4s, 8s), o que já custa caro a quem chuta em série.
export const ADMIN_TRAVA_TENTATIVAS = 5;
export const ADMIN_TRAVA_BLOQUEIO_MS = 10 * 60_000;

// Convite (admin §6.1)
export const CONVITE_VALIDADE_HORAS = 48;

// Trava do login do barbeiro (cliente §9.5, painel §3)
export const BARBEIRO_TRAVA_TENTATIVAS = 5;
export const BARBEIRO_TRAVA_MIN = 15;

// Padrão da tela de marcar na mão (painel §7)
export const PAINEL_ANTECEDENCIA_PADRAO_MIN = 30;

// Verificação de número no WhatsApp (§10.5)
export const CHECK_NUMERO_TIMEOUT_MS = 3_000;
export const CHECK_NUMERO_TTL_MS = 86_400_000;
export const CHECK_NUMERO_LIMITE_POR_IP_HORA = 10;
