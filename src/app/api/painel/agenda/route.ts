import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { localParaUtc, diaDeHoje, somarDias } from '@/lib/datas';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const pedido = url.searchParams.get('dia');
  const dia = pedido && DIA.test(pedido) ? pedido : diaDeHoje(new Date());

  // O filtro da sessão vence o da query, SEMPRE: o parâmetro só é honrado
  // quando o filtro da sessão é vazio, que é o caso do dono.
  const doFiltro = filtroDoBarbeiro(aberta.sessao);
  const pedidoBarbeiro = url.searchParams.get('barbeiroId');
  const barbeiroId = doFiltro.barbeiroId ?? pedidoBarbeiro ?? undefined;

  const itens = await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.agendamento.findMany({
      where: {
        status: 'CONFIRMADO',
        // O fim da janela é a meia-noite do DIA SEGUINTE, e não `dia` com
        // 1440 minutos: aquilo montaria a string `T24:00:00`, que é data
        // inválida — o limite não filtraria nada, em silêncio. Assim também
        // atravessa dia de horário de verão sem perder nem repetir hora.
        inicio: { gte: localParaUtc(dia, 0), lt: localParaUtc(somarDias(dia, 1), 0) },
        ...(barbeiroId ? { barbeiroId } : {}),
      },
      orderBy: { inicio: 'asc' },
      select: {
        id: true, inicio: true, fim: true, servicoNome: true, barbeiroId: true,
        cliente:  { select: { nome: true, whatsapp: true } },
        barbeiro: { select: { nome: true } },
      },
    }),
  );

  return NextResponse.json({
    dia,
    itens: itens.map((a) => ({
      id: a.id, inicio: a.inicio, fim: a.fim, servicoNome: a.servicoNome,
      barbeiroId: a.barbeiroId, barbeiroNome: a.barbeiro.nome,
      clienteNome: a.cliente.nome, clienteWhatsapp: a.cliente.whatsapp,
    })),
  });
}
