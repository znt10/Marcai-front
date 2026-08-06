import { NextResponse } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';

export async function GET() {
  const barbearia = await barbeariaAtual();
  const barbeiros = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiro.findMany({
      // `servicos: { some: ... }` esconde quem ainda não tem serviço nenhum
      // ligado: aparecer na lista e não ter o que agendar é um beco sem saída.
      where: { ativo: true, servicos: { some: { ativo: true } } },
      // whatsapp, senhaHash e afins jamais saem daqui (§9.1).
      select: { id: true, nome: true, fotoUrl: true },
      orderBy: { ordem: 'asc' },
    }),
  );
  return NextResponse.json({ barbeiros });
}
