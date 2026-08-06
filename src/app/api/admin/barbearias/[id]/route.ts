import { NextResponse } from 'next/server';
import { prismaAdmin } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ativo } = await req.json().catch(() => ({ ativo: undefined }));

  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ erro: 'Informe ativo: true ou false.' }, { status: 422 });
  }

  // updateMany e não update: `update` num id inexistente lança, e distinguir
  // "não achei" de "falhou" pelo tipo da exceção é pior que contar linhas.
  const alteradas = await prismaAdmin.barbearia.updateMany({ where: { id }, data: { ativo } });
  if (alteradas.count === 0) {
    return NextResponse.json({ erro: 'Barbearia não encontrada.' }, { status: 404 });
  }

  // O cache de slug→Barbearia guarda o tenant por TTL_CACHE_TENANT_MS, então
  // desativar leva até um minuto para tirar a barbearia do ar, e o efeito é
  // por instância. É tolerância aceita (admin §6.3), não bug — está no README
  // para não virar caça ao fantasma depois.
  return NextResponse.json({ ok: true });
}
