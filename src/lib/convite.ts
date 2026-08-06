import { randomBytes, createHash } from 'node:crypto';
import { CONVITE_VALIDADE_HORAS } from './config';

/// Guardar só o hash do convite pelo mesmo motivo que se guarda só o hash da
/// senha: quem ler o banco não ganha acesso a conta nenhuma (cliente §9.5).
///
/// SHA-256 aqui, e não argon2: o token tem 32 bytes aleatórios, então não há
/// o que adivinhar por força bruta. O alongamento de chave do argon2 existe
/// para senhas escolhidas por gente, que têm pouca entropia — gastá-lo num
/// token aleatório é custo sem defesa correspondente.
export function gerarConvite(): { token: string; hash: string; expiraEm: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashDe(token),
    expiraEm: new Date(Date.now() + CONVITE_VALIDADE_HORAS * 3600_000),
  };
}

export const hashDe = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/// Não há função de comparação aqui de propósito: a busca é feita pelo hash
/// direto na consulta (`where: { conviteTokenHash: hashDe(token) }`), o que
/// delega a comparação ao índice do Postgres. Comparar em tempo constante no
/// código só faria sentido se o hash já estivesse em mãos — e aí o token
/// também estaria.
