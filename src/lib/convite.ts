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

/// O link viaja UMA vez — pela tela e pelo WhatsApp —, porque o banco guarda
/// só o hash. Montado aqui e em lugar nenhum mais: eram duas cópias com
/// `http://` e porta `3000` fixos, e a tela de equipe seria a terceira. Em
/// produção aquilo entregaria ao dono um link que não abre.
///
/// Variável PRÓPRIA, separada de `NEXT_PUBLIC_DOMINIO_BASE`: aquela guarda o
/// domínio sem porta e sem esquema, porque é o que `slug.ts` compara com o
/// host da requisição. Juntar as duas quebraria a resolução de tenant.
export function linkDoConvite(slug: string, token: string): string {
  const base = baseValida(process.env.NEXT_PUBLIC_URL_BASE);
  return `${base.protocol}//${slug}.${base.host}/convite/${token}`;
}

/// `new URL('seudominio.com.br')` LANÇA — falta o esquema. E esta função roda
/// **depois** do commit: o barbeiro (ou a barbearia) já está gravado quando o
/// erro subiria, e como o banco guarda só o hash, o link em claro se perderia
/// para sempre. Uma variável mal preenchida no deploy não pode custar isso.
///
/// Sem esquema, assume `https` — quem escreve o domínio nu no `.env` de
/// produção quer o site de produção, não localhost.
function baseValida(bruta: string | undefined): URL {
  const PADRAO = 'http://localhost:3000';
  if (!bruta?.trim()) return new URL(PADRAO);
  const comEsquema = /^https?:\/\//.test(bruta) ? bruta : `https://${bruta}`;
  try {
    return new URL(comEsquema);
  } catch {
    console.error('[convite] NEXT_PUBLIC_URL_BASE inválida:', bruta);
    return new URL(PADRAO);
  }
}

export const hashDe = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/// Não há função de comparação aqui de propósito: a busca é feita pelo hash
/// direto na consulta (`where: { conviteTokenHash: hashDe(token) }`), o que
/// delega a comparação ao índice do Postgres. Comparar em tempo constante no
/// código só faria sentido se o hash já estivesse em mãos — e aí o token
/// também estaria.
