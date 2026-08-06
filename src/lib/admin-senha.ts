import { hash, verify } from '@node-rs/argon2';

/// Vive em módulo próprio, separado de `admin-sessao`, porque o `proxy.ts`
/// importa aquele — e o que o proxy toca entra no bundle dele, que roda no
/// runtime Edge. `@node-rs/argon2` é binário nativo e não roda lá. Mesmo
/// motivo pelo qual `slug.ts` não importa o Prisma.
///
/// A divisão é natural: conferir senha acontece uma vez, no login, em rota
/// Node; conferir a sessão acontece em toda requisição, no proxy.

/// Hash descartável, contra o qual o verify roda quando o usuário não bate.
/// Sem ele, responder mais rápido para usuário inexistente denuncia qual é o
/// usuário certo, e a resposta genérica vira teatro (cliente §9.5).
const HASH_FANTASMA = hash('nao-e-a-senha-de-ninguem');

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
