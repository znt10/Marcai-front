import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { ehDono } from '@/lib/autorizacao';
import { NAO_ENCONTRADO } from '@/lib/alcance';
import { limitesDoServico } from '../route';

const Corpo = z.object({
  nome: z.string().trim().min(2).max(40).optional(),
  duracaoMinimaMin: z.number().int().optional(),
  duracaoSugeridaMin: z.number().int().optional(),
  ordem: z.number().int().optional(),
  ativo: z.boolean().optional(),
}).refine(
  (c) => Object.values(c).some((v) => v !== undefined),
  { message: 'Nada para mudar.' },
);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) {
    return NextResponse.json({ erro: 'Só o dono mexe no catálogo.' }, { status: 403 });
  }
  const { id } = await params;

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Nada para mudar.' }, { status: 422 });
  }
  const c = parse.data;

  const resultado = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const atual = await tx.servico.findUnique({
      where: { id },
      select: { nome: true, duracaoMinimaMin: true, duracaoSugeridaMin: true },
    });
    if (!atual) return null;

    // Os limites são conferidos com o estado FINAL, não só com o que veio: subir
    // a mínima sem mexer na sugerida pode inverter as duas.
    const recusa = limitesDoServico({
      duracaoMinimaMin: c.duracaoMinimaMin ?? atual.duracaoMinimaMin,
      duracaoSugeridaMin: c.duracaoSugeridaMin ?? atual.duracaoSugeridaMin,
    });
    if (recusa) return { tipo: 'recusado' as const, erro: recusa, status: 422 };

    if (c.nome !== undefined && c.nome !== atual.nome) {
      const jaTem = await tx.servico.findUnique({
        where: { barbeariaId_nome: { barbeariaId: aberta.barbearia.id, nome: c.nome } },
        select: { id: true },
      });
      if (jaTem) {
        return { tipo: 'recusado' as const, erro: 'Já existe um serviço com esse nome.', status: 409 };
      }
    }

    // Desativar NÃO mexe em agendamento: eles guardam `servicoNome` copiado no
    // momento da marcação, justamente para o histórico não depender do catálogo
    // de hoje. O que muda é o que passa a ser oferecido daqui pra frente.
    await tx.servico.update({ where: { id }, data: c });
    return { tipo: 'ok' as const };
  });

  if (resultado === null) return NAO_ENCONTRADO;
  if (resultado.tipo === 'recusado') {
    return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
  }
  return NextResponse.json({ ok: true });
}
