import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comBarbearia } from '@/lib/tenant';
import { enviarTexto } from '@/lib/whatsapp';
import { msgLembrete } from '@/lib/mensagens';
import { LEMBRETE_ANTECEDENCIA_MIN } from '@/lib/config';

export async function POST(req: Request) {
  const esperado = `Bearer ${process.env.CRON_SECRET}`;
  // CRON_SECRET vazio nega tudo: sem segredo configurado, a rota fica
  // fechada em vez de virar um disparador público de mensagens.
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== esperado) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const limite = new Date(Date.now() + LEMBRETE_ANTECEDENCIA_MIN * 60_000);
  const barbearias = await prisma.barbearia.findMany({ where: { ativo: true } });

  let enviados = 0;
  for (const b of barbearias) {
    const pendentes = await comBarbearia(b.id, (tx) =>
      tx.agendamento.findMany({
        where: {
          status: 'CONFIRMADO', lembreteEnviadoEm: null,
          inicio: { gt: new Date(), lte: limite },
        },
        include: { barbeiro: { select: { nome: true } }, cliente: true },
      }),
    );

    for (const ag of pendentes) {
      // Marca ANTES de enviar: cron que dispara duas vezes não manda
      // dois lembretes. Perder um lembrete é melhor que duplicar.
      await comBarbearia(b.id, (tx) =>
        tx.agendamento.update({
          where: { id: ag.id }, data: { lembreteEnviadoEm: new Date() },
        }),
      );
      void enviarTexto(ag.cliente.whatsapp, msgLembrete({
        clienteNome: ag.cliente.nome, barbeiroNome: ag.barbeiro.nome,
        servicoNome: ag.servicoNome, inicio: ag.inicio, endereco: b.endereco,
      }));
      enviados += 1;
    }
  }

  return NextResponse.json({ enviados });
}
