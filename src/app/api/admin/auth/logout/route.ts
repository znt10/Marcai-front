import { NextResponse } from 'next/server';
import { COOKIE_ADMIN } from '@/lib/admin-sessao';

export async function POST() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.delete(COOKIE_ADMIN);
  return resposta;
}
