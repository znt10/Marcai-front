import { NextResponse } from 'next/server';
import { comoDono, ehResposta, comBarbeiro, NAO_ENCONTRADO } from '@/lib/equipe-rota';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const aberta = await comoDono(req);
  if (ehResposta(aberta)) return aberta;
  const { id } = await params;

  const feito = await comBarbeiro(aberta.barbearia.id, id, async (tx) => {
    // Não incrementa `tokenVersion`: quem estava desativado não tem sessão
    // para derruba. E o barbeiro volta como estava — inclusive sem senha, se
    // era o caso.
    await tx.barbeiro.update({
      where: { id }, data: { ativo: true, desativadoEm: null },
    });
    return true;
  });

  if (feito === null) return NAO_ENCONTRADO;
  return NextResponse.json({ ok: true });
}
