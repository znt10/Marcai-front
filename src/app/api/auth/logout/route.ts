import { NextResponse } from 'next/server';
import { COOKIE_SESSAO } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', maxAge: 0 });
  return res;
}
