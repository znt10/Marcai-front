import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { ehDono } from '@/lib/autorizacao';

const Corpo = z.object({
  horarioResumo: z.string().trim().min(3).max(120),
});

/// A frase de horário da home. **Não** é derivada das agendas de propósito
/// (cliente §5.1): a união dos expedientes de uma equipe com horários
/// diferentes produz frase ruim — "seg a sáb, 9h–20h, exceto terça de 10h às
/// 19h e quinta…". O dono escreve, e a partir daqui tem onde.
export async function PATCH(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) {
    return NextResponse.json({ erro: 'Só o dono muda isso.' }, { status: 403 });
  }

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Escreve a frase do horário.' }, { status: 422 });
  }

  await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.barbearia.update({
      where: { id: aberta.barbearia.id },
      data: { horarioResumo: parse.data.horarioResumo },
    }));

  return NextResponse.json({ ok: true });
}
