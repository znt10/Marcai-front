import { hash, verify } from '@node-rs/argon2';

/// Vive em módulo próprio, separado de `admin-sessao`, porque o `proxy.ts`
/// importa aquele — e o que o proxy toca entra no bundle dele, que roda no
/// runtime Edge. `@node-rs/argon2` é binário nativo e não roda lá. Mesmo
/// motivo pelo qual `slug.ts` não importa o Prisma.

/// O hash vai para o ambiente em BASE64, não em claro.
///
/// Um hash argon2 é `$argon2id$v=19$m=19456,t=2,p=1$...`, e o `@next/env`
/// expande variáveis ao ler o .env: `$argon2id`, `$v` e `$m` viram vazio, e
/// o hash chega truncado — 97 caracteres viram 54, a senha nunca confere, e
/// o sintoma é um "usuário ou senha inválidos" que não explica nada.
///
/// Escapar os `$` resolveria no Next e quebraria no Docker Compose, que
/// interpola com regras próprias. Base64 não tem caractere especial para
/// ninguém, então atravessa os dois intactos.
const hashEsperado = (): string | undefined => {
  const b64 = process.env.ADMIN_SENHA_HASH_B64;
  return b64 ? Buffer.from(b64, 'base64').toString('utf8') : undefined;
};

/// Hash descartável, contra o qual o verify roda quando o usuário não bate.
/// Sem ele, responder mais rápido para usuário inexistente denuncia qual é o
/// usuário certo, e a resposta genérica vira teatro (cliente §9.5).
const HASH_FANTASMA = hash('nao-e-a-senha-de-ninguem');

export async function conferirSenha(usuario: string, senha: string): Promise<boolean> {
  const esperado = hashEsperado();
  const usuarioBate = usuario === process.env.ADMIN_USUARIO;

  // O verify roda SEMPRE, mesmo com usuário errado. É o custo do argon2 que
  // domina o tempo de resposta, então ele precisa acontecer nos dois ramos —
  // senão o relógio denuncia qual usuário existe.
  const hashAlvo = usuarioBate && esperado ? esperado : await HASH_FANTASMA;
  const senhaBate = await verify(hashAlvo, senha).catch(() => false);

  return usuarioBate && senhaBate;
}
