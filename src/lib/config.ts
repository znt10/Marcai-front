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
// Quantos dias a tela de marcar oferece nos chips acima da grade de horários
// ("Hoje", "Amanhã"); o resto fica no calendário, que e' o link logo abaixo.
// Foi 1 enquanto os dias vinham EMPILHADOS, cada um com a grade inteira: o
// segundo dia dobrava a altura da seção. Com os chips só uma grade aparece
// por vez, e o segundo dia volta a ser de graça — e é ele que salva o fim de
// tarde com a agenda cheia, quando hoje não tem mais vaga.
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

/// True quando o host não carrega subdomínio nenhum sob o domínio base.
///
/// É a única porta por onde a barbearia padrão de dev entra (ver
/// NEXT_PUBLIC_TENANT_PADRAO no proxy.ts), e o recorte é o que importa: são os
/// dois casos em que não há subdomínio para ler — o domínio nu (`localhost`) e
/// um host de fora dele (`10.0.0.7`, o celular na rede).
///
/// Fica de fora, de propósito, todo host que TEM subdomínio e mesmo assim não
/// vira barbearia: `www.localhost` (reservado), `a.b.localhost`,
/// `naoexiste.localhost`. Esses continuam sem barbearia até em dev — se
/// caíssem no padrão, um erro de digitação no subdomínio abriria a barbearia
/// errada em silêncio.
///
/// Espelha `sem_subdominio` do backend/tenant/config.py. Divergir daqui é um
/// host que um lado manda para a barbearia padrão e o outro trata como 404.
export function semSubdominio(host: string, dominioBase: string): boolean {
  const semPorta = host.split(':')[0].toLowerCase();
  return semPorta === dominioBase || !semPorta.endsWith(`.${dominioBase}`);
}

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

// De quanto em quanto tempo as telas do painel (agenda e quadro do dia)
// buscam de novo, sem recarregar a pagina. O Django roda em gunicorn
// sincrono, sem Channels: nao ha como o servidor AVISAR o navegador, entao a
// tela pergunta. 30s e' invisivel para quem olha e barato para o servidor.
export const PAINEL_ATUALIZACAO_MS = 30_000;

// Padrão da tela de marcar na mão (painel §7)
export const PAINEL_ANTECEDENCIA_PADRAO_MIN = 30;

// Verificação de número no WhatsApp (§10.5)
export const CHECK_NUMERO_TIMEOUT_MS = 3_000;
export const CHECK_NUMERO_TTL_MS = 86_400_000;
export const CHECK_NUMERO_LIMITE_POR_IP_HORA = 10;
