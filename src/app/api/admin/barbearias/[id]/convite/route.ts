import { NextResponse } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { comBarbeariaAdmin } from '@/lib/tenant';
import { gerarConvite, linkDoConvite } from '@/lib/convite';
import { enviarTexto } from '@/lib/whatsapp';
import { msgConvite } from '@/lib/mensagens';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const barbearia = await prismaAdmin.barbearia.findUnique({ where: { id } });
  if (!barbearia) {
    return NextResponse.json({ erro: 'Barbearia não encontrada.' }, { status: 404 });
  }

  const convite = gerarConvite();

  const dono = await comBarbeariaAdmin(barbearia.id, async (tx) => {
    const atual = await tx.barbeiro.findFirst({
      where: { papel: 'DONO', ativo: true }, orderBy: { criadoEm: 'asc' },
    });
    if (!atual) return null;
    await tx.barbeiro.update({
      where: { id: atual.id },
      data: {
        senhaHash: null,
        conviteTokenHash: convite.hash,
        conviteExpiraEm: convite.expiraEm,
        // Derruba na hora qualquer sessão ativa daquele dono. Sem isto, quem
        // tomou a conta continuaria dentro por até 12h DEPOIS do reset — e o
        // reset existe justamente para os casos em que alguém tomou a conta.
        tokenVersion: { increment: 1 },
      },
    });
    return atual;
  });

  if (!dono) {
    return NextResponse.json({ erro: 'Essa barbearia não tem dono ativo.' }, { status: 404 });
  }

  const link = linkDoConvite(barbearia.slug, convite.token);

  // Duas vias, como o convite de barbeiro: a tela mostra uma vez e o zap
  // guarda. Reemitir já apagou a senha do dono neste ponto — se o link só
  // existisse na tela do admin e ele fechasse a aba, o dono ficaria de fora
  // sem caminho de volta.
  void enviarTexto(dono.whatsapp, msgConvite({
    nome: dono.nome, barbeariaNome: barbearia.nome, link,
  }));

  return NextResponse.json({ linkConvite: link });
}
