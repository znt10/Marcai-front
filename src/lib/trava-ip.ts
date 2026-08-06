import {
  ADMIN_TRAVA_BASE_MS, ADMIN_TRAVA_TETO_MS,
  ADMIN_TRAVA_TENTATIVAS, ADMIN_TRAVA_BLOQUEIO_MS,
} from './config';

/// Espera exponencial por IP para o login do admin (admin §4).
///
/// Por IP, e não por conta, porque a conta é UMA: travá-la deixaria qualquer
/// um trancar o dono do site fora do próprio painel com cinco requisições —
/// negação de serviço trivial. É o oposto da escolha do barbeiro (cliente
/// §9.5), onde a barbearia inteira sai pelo mesmo IP e travar o IP derrubaria
/// a equipe junto. As duas travas são opostas porque o que elas protegem é.
///
/// Em memória: some no restart e cada instância tem a sua. Aceito enquanto o
/// deploy é de instância única — o custo de levar isso para o banco não se
/// paga com uma conta só. Virando multi-instância, migra para tabela.
const falhas = new Map<string, { quantas: number; ultimaEm: number }>();

export function esperaDe(ip: string): number {
  const f = falhas.get(ip);
  if (!f) return 0;

  // Até o limite, a espera só cresce (1s, 2s, 4s, 8s). Passou dele, o IP fica
  // de castigo por 10 minutos — o que transforma força bruta em algo que
  // rende no máximo 5 chutes a cada 10 min, por IP.
  const atraso = f.quantas >= ADMIN_TRAVA_TENTATIVAS
    ? ADMIN_TRAVA_BLOQUEIO_MS
    : Math.min(ADMIN_TRAVA_BASE_MS * 2 ** (f.quantas - 1), ADMIN_TRAVA_TETO_MS);

  const decorrido = Date.now() - f.ultimaEm;
  return Math.max(0, atraso - decorrido);
}

/// Quantas falhas seguidas este IP acumulou. Usada só para a mensagem que a
/// rota devolve: dizer "bloqueado por 10 minutos" é diferente de "espera um
/// segundo", e quem está do outro lado merece saber em qual dos dois está.
export function falhasDe(ip: string): number {
  return falhas.get(ip)?.quantas ?? 0;
}

export function registrarFalha(ip: string): void {
  const f = falhas.get(ip);
  falhas.set(ip, { quantas: (f?.quantas ?? 0) + 1, ultimaEm: Date.now() });
}

export function limparFalhas(ip: string): void {
  falhas.delete(ip);
}

/// Só para teste.
export function _zerarTravas(): void {
  falhas.clear();
}
