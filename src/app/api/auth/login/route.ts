import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { normalizar } from '@/lib/telefone';
import { emitirSessao, COOKIE_SESSAO } from '@/lib/auth';
import { estaTravado, aposFalha, LIMPO } from '@/lib/trava-barbeiro';
import { SESSAO_BARBEIRO_HORAS } from '@/lib/config';

const Corpo = z.object({ whatsapp: z.string(), senha: z.string() });

/// Uma resposta só, para celular inexistente, senha errada e barbeiro sem
/// senha. Enumerar a equipe pelo formulário de login não pode ser possível.
const INVALIDO = { erro: 'Celular ou senha inválidos.' };

/// O `verify` roda SEMPRE, mesmo sem barbeiro, contra este hash descartável.
/// Sem isso o tempo de resposta denuncia quais números existem, e a resposta
/// genérica vira teatro: o atacante lê a diferença no relógio.
let descartavel: Promise<string> | null = null;
const hashDescartavel = () => (descartavel ??= hash(randomUUID()));

export async function POST(req: Request) {
  const barbearia = await barbeariaDaRequisicao(req);

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) return NextResponse.json(INVALIDO, { status: 401 });

  const whatsapp = normalizar(parse.data.whatsapp);
  const agora = new Date();

  const resultado = await comBarbearia(barbearia.id, async (tx) => {
    const barbeiro = whatsapp
      ? await tx.barbeiro.findUnique({
          where: { barbeariaId_whatsapp: { barbeariaId: barbearia.id, whatsapp } },
        })
      : null;

    if (barbeiro && estaTravado(barbeiro, agora)) return { tipo: 'travado' as const };

    const confere = barbeiro?.senhaHash
      ? await verify(barbeiro.senhaHash, parse.data.senha).catch(() => false)
      : await verify(await hashDescartavel(), parse.data.senha).catch(() => false);

    if (!barbeiro || !barbeiro.senhaHash || !confere) {
      if (barbeiro) {
        await tx.barbeiro.update({
          where: { id: barbeiro.id },
          data: aposFalha(barbeiro.tentativasLogin, agora),
        });
      }
      return { tipo: 'invalido' as const };
    }

    if (barbeiro.tentativasLogin !== 0 || barbeiro.bloqueadoAte !== null) {
      await tx.barbeiro.update({ where: { id: barbeiro.id }, data: LIMPO });
    }
    return { tipo: 'ok' as const, barbeiro };
  });

  if (resultado.tipo === 'travado') {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Tenta de novo daqui a pouco.' }, { status: 429 });
  }
  if (resultado.tipo === 'invalido') {
    return NextResponse.json(INVALIDO, { status: 401 });
  }

  const { barbeiro } = resultado;
  const jwt = await emitirSessao({
    sub: barbeiro.id, bid: barbearia.id,
    papel: barbeiro.papel, tv: barbeiro.tokenVersion,
  });

  const res = NextResponse.json({ nome: barbeiro.nome, papel: barbeiro.papel });
  res.cookies.set(COOKIE_SESSAO, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSAO_BARBEIRO_HORAS * 3600,
  });
  return res;
}
