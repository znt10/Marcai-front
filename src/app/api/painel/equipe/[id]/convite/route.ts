import { NextResponse } from 'next/server';
import { gerarConvite, linkDoConvite } from '@/lib/convite';
import { enviarTexto } from '@/lib/whatsapp';
import { msgConvite } from '@/lib/mensagens';
import { comoDono, ehResposta, comBarbeiro, NAO_ENCONTRADO } from '@/lib/equipe-rota';

/// Reemitir convite **é** o reset de senha: `senhaHash` volta a nulo, então
/// quem tinha a senha antiga perde o acesso. É o mesmo desenho da rota do
/// admin, e pelo mesmo motivo — o reset existe justamente para o caso de
/// alguém ter tomado a conta.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const aberta = await comoDono(req);
  if (ehResposta(aberta)) return aberta;
  const { id } = await params;

  const convite = gerarConvite();

  const barbeiro = await comBarbeiro(aberta.barbearia.id, id, async (tx, b) => {
    // Quem saiu não recebe "Você entrou na equipe da X" pelo WhatsApp. O
    // convite ainda deixaria a pessoa criar senha — o login seria recusado
    // depois, na conferência de `ativo` —, então a mensagem seria só engano.
    if (!b.ativo) return 'desativado' as const;

    await tx.barbeiro.update({
      where: { id },
      data: {
        senhaHash: null,
        conviteTokenHash: convite.hash,
        conviteExpiraEm: convite.expiraEm,
        tokenVersion: { increment: 1 },
      },
    });
    return b;
  });

  if (barbeiro === null) return NAO_ENCONTRADO;
  if (barbeiro === 'desativado') {
    return NextResponse.json(
      { erro: 'Esse barbeiro está desativado. Reativa antes de mandar convite.' },
      { status: 409 });
  }

  const link = linkDoConvite(aberta.barbearia.slug, convite.token);

  void enviarTexto(barbeiro.whatsapp, msgConvite({
    nome: barbeiro.nome, barbeariaNome: aberta.barbearia.nome, link,
  }));

  return NextResponse.json({ linkConvite: link });
}
