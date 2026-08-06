import { NextResponse } from 'next/server';
import { hash } from '@node-rs/argon2';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { hashDe } from '@/lib/convite';
import { SENHA_MINIMA } from '@/lib/config';

/// Esta rota pertence ao cliente §9.5 (Etapa 2). Entra aqui porque sem ela o
/// painel de admin entrega contas que ninguém consegue usar: o dono nasce com
/// senhaHash nulo, e nulo não loga.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { senha } = await req.json().catch(() => ({ senha: '' }));

  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    return NextResponse.json(
      { erro: `A senha precisa de ao menos ${SENHA_MINIMA} caracteres.` },
      { status: 422 },
    );
  }

  const barbearia = await barbeariaDaRequisicao(req);

  // Busca pelo HASH, nunca pelo token: é o hash que está no banco. O token em
  // claro só existiu no link que foi pelo WhatsApp.
  const ok = await comBarbearia(barbearia.id, async (tx) => {
    const barbeiro = await tx.barbeiro.findFirst({
      where: { conviteTokenHash: hashDe(token), conviteExpiraEm: { gt: new Date() } },
    });
    if (!barbeiro) return false;
    await tx.barbeiro.update({
      where: { id: barbeiro.id },
      data: { senhaHash: await hash(senha), conviteTokenHash: null, conviteExpiraEm: null },
    });
    return true;
  });

  // 404 e não 403: um token inválido não pode revelar se existe convite algum
  // naquela barbearia.
  if (!ok) return NextResponse.json({ erro: 'Convite inválido ou vencido.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
