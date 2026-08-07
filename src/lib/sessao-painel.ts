import { NextResponse } from 'next/server';
import type { Barbearia } from '@prisma/client';
import { barbeariaDaRequisicao, comBarbearia } from './tenant';
import { lerSessao, COOKIE_SESSAO, type Sessao } from './auth';

/// Este módulo importa Prisma: NUNCA pode ser importado pelo `proxy.ts`.
/// O proxy é a peneira grossa (assinatura e validade, que rodam em Edge); as
/// três conferências que precisam do banco moram aqui (painel §3).

export function lerCookie(req: Request, nome: string): string | undefined {
  for (const parte of (req.headers.get('cookie') ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return undefined;
}

/// 401 com o cookie APAGADO. Sessão morta que fica no navegador vira 401 em
/// laço na tela seguinte, e o barbeiro liga achando que o sistema caiu.
export function naoAutorizado(): NextResponse {
  const res = NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', maxAge: 0 });
  return res;
}

export async function sessaoDaRequisicao(
  req: Request,
): Promise<{ sessao: Sessao; barbearia: Barbearia } | null> {
  const barbearia = await barbeariaDaRequisicao(req);
  const sessao = await lerSessao(lerCookie(req, COOKIE_SESSAO));
  if (!sessao) return null;

  // A conferência que impede o pior bug do multi-tenant (cliente §9.5): o
  // token é válido, o barbeiro existe — e mesmo assim não vale neste host.
  if (sessao.bid !== barbearia.id) return null;

  const barbeiro = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiro.findUnique({
      where: { id: sessao.sub },
      select: { ativo: true, tokenVersion: true },
    }),
  );
  if (!barbeiro || !barbeiro.ativo) return null;
  if (barbeiro.tokenVersion !== sessao.tv) return null;

  return { sessao, barbearia };
}
