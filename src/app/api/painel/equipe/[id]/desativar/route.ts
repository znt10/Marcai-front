import { NextResponse } from 'next/server';
import { podeDesativar } from '@/lib/equipe';
import {
  comoDono, ehResposta, comBarbeiro, contarDonosAtivos, agendaFuturaDe, NAO_ENCONTRADO,
} from '@/lib/equipe-rota';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const aberta = await comoDono(req);
  if (ehResposta(aberta)) return aberta;
  const { id } = await params;
  const agora = new Date();

  const resultado = await comBarbeiro(aberta.barbearia.id, id, async (tx, barbeiro) => {
    const agenda = await agendaFuturaDe(tx, id, agora);

    const recusa = podeDesativar({
      ehEuMesmo: barbeiro.id === aberta.sessao.sub,
      papel: barbeiro.papel,
      donosAtivos: await contarDonosAtivos(tx, aberta.barbearia.id),
      agendamentosFuturos: agenda.quantos,
      proximoEm: agenda.proximoEm,
    });
    if (recusa) return { tipo: 'recusado' as const, erro: recusa };

    await tx.barbeiro.update({
      where: { id },
      data: {
        ativo: false,
        desativadoEm: agora,
        // Derruba a sessão na hora. Sem isto, quem saiu da equipe continuaria
        // dentro do painel por até 12 horas (cliente §9.5).
        tokenVersion: { increment: 1 },
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
