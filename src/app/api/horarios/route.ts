import { NextResponse, type NextRequest } from 'next/server';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { formatarHora, formatarDiaLongo, diaDeHoje, somarDias, localParaUtc } from '@/lib/datas';
import { JANELA_MAXIMA_DIAS, DIAS_NA_HOME } from '@/lib/config';

export async function GET(req: NextRequest) {
  const barbearia = await barbeariaDaRequisicao(req);
  const p = req.nextUrl.searchParams;
  const barbeiroId = p.get('barbeiroId') ?? 'qualquer';
  const servicoId = p.get('servicoId');
  if (!servicoId) {
    return NextResponse.json({ erro: 'Escolhe o serviço primeiro.' }, { status: 400 });
  }

  const agora = new Date();
  const hoje = diaDeHoje(agora);
  const de = p.get('de') ?? hoje;
  const quantos = Math.min(Number(p.get('dias') ?? DIAS_NA_HOME), JANELA_MAXIMA_DIAS);

  const dias = await comBarbearia(barbearia.id, async (tx) => {
    const saida = [];
    for (let i = 0; i < quantos; i++) {
      const data = somarDias(de, i);
      const slots = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, data, agora);
      const nomes = new Map(
        (await tx.barbeiro.findMany({
          where: { id: { in: [...new Set(slots.map((s) => s.barbeiroId))] } },
          select: { id: true, nome: true },
        })).map((b) => [b.id, b.nome]),
      );
      saida.push({
        data,
        rotulo: rotuloDe(data, hoje),
        // Só o que está LIVRE. Nenhum nome de cliente, nenhum ocupado (§9.1).
        slots: slots.map((s) => ({
          hora: formatarHora(s.inicio),
          inicio: s.inicio.toISOString(),
          fim: s.fim.toISOString(),
          barbeiroId: s.barbeiroId,
          barbeiroNome: nomes.get(s.barbeiroId) ?? '',
          duracaoMin: Math.round((s.fim.getTime() - s.inicio.getTime()) / 60_000),
        })),
      });
    }
    return saida;
  });

  return NextResponse.json({ dias });
}

function rotuloDe(data: string, hoje: string) {
  const longo = formatarDiaLongo(localParaUtc(data, 12 * 60));
  if (data === hoje) return `hoje · ${longo}`;
  if (data === somarDias(hoje, 1)) return `amanhã · ${longo}`;
  return longo;
}
