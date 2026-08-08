import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizar } from '@/lib/telefone';
import { podeRebaixar } from '@/lib/equipe';
import {
  comoDono, ehResposta, comBarbeiro, contarDonosAtivos, NAO_ENCONTRADO,
} from '@/lib/equipe-rota';

const Corpo = z.object({
  nome: z.string().trim().min(2).max(80).optional(),
  whatsapp: z.string().optional(),
  papel: z.enum(['DONO', 'BARBEIRO']).optional(),
}).refine(
  // Sem isto, `{}` passava e a rota respondia `ok: true` depois de um UPDATE
  // sem campo nenhum — e a mensagem "Nada para mudar" só aparecia para JSON
  // quebrado, que é outro problema.
  (c) => c.nome !== undefined || c.whatsapp !== undefined || c.papel !== undefined,
  { message: 'Nada para mudar.' },
);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const aberta = await comoDono(req);
  if (ehResposta(aberta)) return aberta;
  const { id } = await params;

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 422 });
  }
  const { nome, papel } = parse.data;

  let whatsapp: string | undefined;
  if (parse.data.whatsapp !== undefined) {
    const normalizado = normalizar(parse.data.whatsapp);
    if (!normalizado) {
      return NextResponse.json(
        { erro: 'Confere o celular — parece faltar dígito.' }, { status: 422 });
    }
    whatsapp = normalizado;
  }

  const resultado = await comBarbeiro(aberta.barbearia.id, id, async (tx, barbeiro) => {
    // `barbeiro.ativo` na condição: `contarDonosAtivos` conta só os ativos, e
    // rebaixar um dono JÁ DESATIVADO não pode deixar a barbearia órfã. Sem
    // isso, a casa com um dono ativo e um desativado recusava mexer no
    // desativado dizendo "esse é o único dono ativo" — que ele não é.
    if (papel === 'BARBEIRO' && barbeiro.papel === 'DONO' && barbeiro.ativo) {
      const recusa = podeRebaixar({ donosAtivos: await contarDonosAtivos(tx, aberta.barbearia.id) });
      if (recusa) return { tipo: 'recusado' as const, erro: recusa };
    }

    if (whatsapp !== undefined && whatsapp !== barbeiro.whatsapp) {
      // Sem filtrar por `ativo`: o índice único não distingue desativado.
      const jaTem = await tx.barbeiro.findUnique({
        where: { barbeariaId_whatsapp: { barbeariaId: aberta.barbearia.id, whatsapp } },
        select: { nome: true, ativo: true },
      });
      if (jaTem) {
        return {
          tipo: 'recusado' as const,
          erro: jaTem.ativo
            ? `Esse celular já é do ${jaTem.nome}.`
            : `Esse celular é do ${jaTem.nome}, que está desativado.`,
        };
      }
    }

    // O `papel` viaja no token: rebaixar sem invalidar deixaria o sujeito com
    // alcance de dono por até 12 horas. O celular é o login, então mudá-lo
    // também refaz a identidade da conta. Trocar só o NOME não derruba ninguém
    // — seria expulsar o barbeiro do painel por causa de um acento.
    const mudouSessao =
      (papel !== undefined && papel !== barbeiro.papel) ||
      (whatsapp !== undefined && whatsapp !== barbeiro.whatsapp);

    await tx.barbeiro.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome } : {}),
        ...(whatsapp !== undefined ? { whatsapp } : {}),
        ...(papel !== undefined ? { papel } : {}),
        ...(mudouSessao ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    return { tipo: 'ok' as const };
  });

  if (resultado === null) return NAO_ENCONTRADO;
  if (resultado.tipo === 'recusado') {
    return NextResponse.json({ erro: resultado.erro }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
