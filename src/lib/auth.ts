import { SignJWT, jwtVerify } from 'jose';
import { SESSAO_BARBEIRO_HORAS } from './config';

/// Só `jose` aqui. Este módulo é importado pelo `proxy.ts`, que roda no
/// runtime Edge: Prisma e argon2 (binário nativo) não rodam lá. As três
/// conferências que precisam do banco — `bid`, `tokenVersion` e `ativo` —
/// moram em `sessao-painel.ts`, que o proxy não importa.

export const COOKIE_SESSAO = 'sessao';

export type Sessao = {
  sub: string;                        // barbeiroId
  bid: string;                        // barbeariaId — a conferência de §3
  papel: 'DONO' | 'BARBEIRO';
  tv: number;                         // tokenVersion
};

/// Lido a cada uso, não capturado numa constante de módulo: trocar
/// SESSAO_JWT_SECRET tem que derrubar toda sessão na hora.
///
/// É DIFERENTE do ADMIN_JWT_SECRET de propósito. Cookie de admin apresentado
/// aqui falha na assinatura sem que ninguém escreva uma checagem para isso.
const segredo = () => new TextEncoder().encode(process.env.SESSAO_JWT_SECRET);

export function emitirSessao(s: Sessao): Promise<string> {
  return new SignJWT({ bid: s.bid, papel: s.papel, tv: s.tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSAO_BARBEIRO_HORAS}h`)
    .sign(segredo());
}

export async function lerSessao(jwt: string | undefined): Promise<Sessao | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, segredo());
    const { sub, bid, papel, tv } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof bid !== 'string') return null;
    if (papel !== 'DONO' && papel !== 'BARBEIRO') return null;
    if (typeof tv !== 'number') return null;
    return { sub, bid, papel, tv };
  } catch {
    return null;
  }
}
