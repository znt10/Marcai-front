import { NextResponse, type NextRequest } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';

/// Alimenta o mini-calendário: quais dias do mês têm ao menos um horário.
export async function GET(req: NextRequest) {
  const barbearia = await barbeariaAtual();
  const p = req.nextUrl.searchParams;
  const barbeiroId = p.get('barbeiroId') ?? 'qualquer';
  const servicoId = p.get('servicoId');
  const mes = p.get('mes'); // 'YYYY-MM'
  if (!servicoId || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ erro: 'Parâmetros inválidos.' }, { status: 400 });
  }

  const agora = new Date();
  const [ano, m] = mes.split('-').map(Number);
  // Dia 0 do mês seguinte é o último do mês pedido.
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate();

  const dias = await comBarbearia(barbearia.id, async (tx) => {
    const comVaga: number[] = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const data = `${mes}-${String(d).padStart(2, '0')}`;
      const slots = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, data, agora);
      if (slots.length > 0) comVaga.push(d);
    }
    return comVaga;
  });

  return NextResponse.json({ dias });
}
