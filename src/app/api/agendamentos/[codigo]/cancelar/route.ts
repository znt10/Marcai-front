import { NextResponse } from 'next/server';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';
import { formatar } from '@/lib/telefone';
import { enviarTexto } from '@/lib/whatsapp';
import { msgCancelamento } from '@/lib/mensagens';

export async function POST(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const barbearia = await barbeariaDaRequisicao(req);

  const resultado = await comBarbearia(barbearia.id, async (tx) => {
    const ag = await tx.agendamento.findFirst({
      where: { codigo },
      include: { barbeiro: { select: { nome: true } }, cliente: true },
    });
    if (!ag) return { tipo: 'nao_encontrado' as const };
    // Cancelar o que já está cancelado responde 200: quem apertou o botão
    // duas vezes queria o mesmo desfecho, e ele já vale.
    if (ag.status !== 'CONFIRMADO') return { tipo: 'ja_cancelado' as const };

    // Reconferido no servidor mesmo com podeCancelar:false na tela.
    // Botão desabilitado não é controle de acesso.
    const minutosAte = (ag.inicio.getTime() - Date.now()) / 60_000;
    if (minutosAte <= PRAZO_CANCELAMENTO_MIN) return { tipo: 'fora_do_prazo' as const };

    await tx.agendamento.update({
      where: { id: ag.id },
      data: { status: 'CANCELADO_CLIENTE', canceladoEm: new Date() },
    });
    return { tipo: 'ok' as const, ag };
  });

  if (resultado.tipo === 'nao_encontrado') {
    return NextResponse.json({ erro: 'Agendamento não encontrado.' }, { status: 404 });
  }
  if (resultado.tipo === 'fora_do_prazo') {
    return NextResponse.json({
      erro: `Passou do prazo de 1h. Chama a barbearia no zap: ${formatar(barbearia.whatsappContato)}`,
    }, { status: 422 });
  }
  if (resultado.tipo === 'ok') {
    void enviarTexto(resultado.ag.cliente.whatsapp, msgCancelamento({
      clienteNome: resultado.ag.cliente.nome,
      barbeiroNome: resultado.ag.barbeiro.nome,
      servicoNome: resultado.ag.servicoNome,
      inicio: resultado.ag.inicio,
      endereco: barbearia.endereco,
    }));
  }
  return NextResponse.json({ ok: true });
}
