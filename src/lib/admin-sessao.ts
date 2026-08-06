import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_SESSAO_HORAS } from './config';

export const COOKIE_ADMIN = 'sessao_admin';

/// Hash descartável, contra o qual o verify roda quando o usuário não bate.
/// Sem ele, responder mais rápido para usuário inexistente denuncia qual é o
/// usuário certo, e a resposta genérica vira teatro (cliente §9.5).
///
/// Calculado uma vez, na carga do módulo: é uma promessa guardada, não uma
/// chamada por requisição.
const HASH_FANTASMA = hash('nao-e-a-senha-de-ninguem');

/// Lido a cada uso, não capturado numa constante de módulo: o teste troca
/// ADMIN_JWT_SECRET em tempo de execução para provar que um token assinado
/// com outro segredo é recusado.
const segredo = () => new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);

export async function conferirSenha(usuario: string, senha: string): Promise<boolean> {
  const esperado = process.env.ADMIN_SENHA_HASH;
  const usuarioBate = usuario === process.env.ADMIN_USUARIO;

  // O verify roda SEMPRE, mesmo com usuário errado. É o custo do argon2 que
  // domina o tempo de resposta, então ele precisa acontecer nos dois ramos —
  // senão o relógio denuncia qual usuário existe.
  const hashAlvo = usuarioBate && esperado ? esperado : await HASH_FANTASMA;
  const senhaBate = await verify(hashAlvo, senha).catch(() => false);

  return usuarioBate && senhaBate;
}

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
