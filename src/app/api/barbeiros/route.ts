import { NextResponse } from 'next/server';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';

export async function GET(req: Request) {
  const barbearia = await barbeariaDaRequisicao(req);
  const barbeiros = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiro.findMany({
      // `servicos: { some: ... }` esconde quem ainda não tem serviço nenhum
      // ligado: aparecer na lista e não ter o que agendar é um beco sem saída.
      //
      // O `servico: { ativo: true }` de dentro é a outra metade disso, e
      // faltava: com o serviço desativado na barbearia inteira, o vínculo
      // continua ativo e o barbeiro continuava aparecendo — com a lista de
      // serviços dele vazia na tela seguinte.
      where: { ativo: true, servicos: { some: { ativo: true, servico: { ativo: true } } } },
      // whatsapp, senhaHash e afins jamais saem daqui (§9.1).
      select: { id: true, nome: true, fotoUrl: true },
      orderBy: { ordem: 'asc' },
    }),
  );
  return NextResponse.json({ barbeiros });
}
