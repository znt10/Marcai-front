import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_SESSAO_HORAS } from './config';

/// Só `jose` aqui, nada de argon2: este módulo é importado pelo `proxy.ts`,
/// que roda no runtime Edge. `jose` funciona lá — foi por isso que ela foi
/// escolhida no lugar de jsonwebtoken (cliente §9.5). A verificação de senha
/// mora em `admin-senha.ts`, que só a rota de login toca.

export const COOKIE_ADMIN = 'sessao_admin';

/// Lido a cada uso, não capturado numa constante de módulo: trocar
/// ADMIN_JWT_SECRET tem que derrubar a sessão na hora — é o botão de pânico.
const segredo = () => new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);

export function emitirSessao(): Promise<string> {
  return new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSAO_HORAS}h`)
    .sign(segredo());
}

export async function lerSessao(jwt: string | undefined): Promise<boolean> {
  if (!jwt) return false;
  try {
    const { payload } = await jwtVerify(jwt, segredo());
    return payload.sub === 'admin';
  } catch {
    return false;
  }
}
