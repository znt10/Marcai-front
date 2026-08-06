import { NextResponse, type NextRequest } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const barbearia = await barbeariaAtual();
  const barbeiroId = req.nextUrl.searchParams.get('barbeiroId') ?? 'qualquer';

  const vinculos = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiroServico.findMany({
      where: {
        ativo: true, barbeiro: { ativo: true },
        ...(barbeiroId === 'qualquer' ? {} : { barbeiroId }),
        servico: { ativo: true },
      },
      include: { servico: { select: { id: true, nome: true, ordem: true } } },
    }),
  );

  // Com "qualquer", a duração exibida é a MENOR entre os barbeiros —
  // o barbeiro só é resolvido na escolha do horário.
  const porServico = new Map<string, { id: string; nome: string; ordem: number; duracaoMin: number }>();
  for (const v of vinculos) {
    const atual = porServico.get(v.servicoId);
    if (!atual || v.duracaoMin < atual.duracaoMin) {
      porServico.set(v.servicoId, { ...v.servico, duracaoMin: v.duracaoMin });
    }
  }

  const servicos = [...porServico.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ id, nome, duracaoMin }) => ({ id, nome, duracaoMin }));

  return NextResponse.json({ servicos });
}
