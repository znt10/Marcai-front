import { jwtVerify } from 'jose';

/// Só `jose` aqui, nada de argon2: este módulo é importado pelo `proxy.ts`,
/// que roda no runtime Edge. `jose` funciona lá — foi por isso que ela foi
/// escolhida no lugar de jsonwebtoken (cliente §9.5).
///
/// Desde a fatia 8 este modulo so' LE. A emissao mora no Django
/// (`AdminLoginView`), que e' quem atende `/api/admin/auth/login`. O segredo
/// continua aqui porque o `proxy.ts` guarda as PAGINAS `/admin/*` no Edge,
/// antes de qualquer rota rodar — e isso continua sendo do Next.

export const COOKIE_ADMIN = 'sessao_admin';

/// Lido a cada uso, não capturado numa constante de módulo: trocar
/// ADMIN_JWT_SECRET tem que derrubar a sessão na hora — é o botão de pânico.
///
/// Sem default: um fallback aceitaria cookie assinado com o literal
/// `"undefined"` se alguém esquecesse a variável no deploy — `new
/// TextEncoder().encode(process.env.ADMIN_JWT_SECRET)` com a variável ausente
/// não lança, ele chaveia na STRING `"undefined"`, e um JWT assinado com esse
/// valor público passaria a peneira do Edge sem barulho nenhum. Mesmo
/// raciocínio de `admin_sessao._segredo()` no back.
const segredo = () => {
  const valor = process.env.ADMIN_JWT_SECRET;
  if (!valor) {
    throw new Error(
      'ADMIN_JWT_SECRET não definido. Precisa ser IGUAL ao do .env do back: ' +
        'o Django emite o cookie (AdminLoginView) e este módulo só o lê.',
    );
  }
  return new TextEncoder().encode(valor);
};

export async function lerSessao(jwt: string | undefined): Promise<boolean> {
  if (!jwt) return false;
  // `segredo()` roda FORA do try: se a variável estiver ausente, o erro tem
  // que subir, não virar `false` silencioso — ver o comentário de `segredo()`.
  const chave = segredo();
  try {
    const { payload } = await jwtVerify(jwt, chave);
    return payload.sub === 'admin';
  } catch {
    return false;
  }
}
