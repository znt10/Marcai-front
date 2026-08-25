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
const segredo = () => new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);

export async function lerSessao(jwt: string | undefined): Promise<boolean> {
  if (!jwt) return false;
  try {
    const { payload } = await jwtVerify(jwt, segredo());
    return payload.sub === 'admin';
  } catch {
    return false;
  }
}
