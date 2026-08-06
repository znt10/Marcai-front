import { NextResponse } from 'next/server';
import { conferirSenha, emitirSessao, COOKIE_ADMIN } from '@/lib/admin-sessao';
import { esperaDe, registrarFalha, limparFalhas } from '@/lib/trava-ip';
import { ADMIN_SESSAO_HORAS } from '@/lib/config';

const ipDe = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido';

export async function POST(req: Request) {
  const ip = ipDe(req);

  // A espera é conferida ANTES de olhar a senha: o argon2 é caro de propósito,
  // e deixar o atacante gastá-lo à vontade é o que a trava evita.
  const espera = esperaDe(ip);
  if (espera > 0) {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Espera um pouco.' },
      { status: 429, headers: { 'retry-after': String(Math.ceil(espera / 1000)) } },
    );
  }

  const { usuario, senha } = await req.json().catch(() => ({ usuario: '', senha: '' }));

  if (!(await conferirSenha(String(usuario ?? ''), String(senha ?? '')))) {
    registrarFalha(ip);
    // Mesma resposta para usuário inexistente e senha errada — o formulário
    // não pode servir para descobrir qual é o usuário.
    return NextResponse.json({ erro: 'usuário ou senha inválidos' }, { status: 401 });
  }

  limparFalhas(ip);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_ADMIN, await emitirSessao(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSAO_HORAS * 3600,
  });
  return resposta;
}
