import { agendamentoPorCodigo } from '@/lib/tenant';
import { Frame } from '@/components/wf';
import { Confirmado } from '@/components/Confirmado';

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;

  // Era uma consulta ao Prisma dentro de `comBarbearia(...)`; virou a rota que
  // já existia para isto. O escopo de tenant continua sendo garantido pelo
  // RLS — só que do outro lado: o Host viaja no pedido e o Django resolve a
  // barbearia, então um código de OUTRA barbearia continua não aparecendo.
  //
  // `endereco` e `whatsappBarbearia` vêm no mesmo payload (a view do Django os
  // mistura a partir de `request.barbearia`), então esta página deixou de
  // precisar de `barbeariaAtual()` — uma ida a menos.
  //
  // `podeCancelar` deixou de ser calculado aqui. Ele dependia de comparar
  // `Date.now()` com o início do agendamento, e o relógio que vale para essa
  // decisão é o do servidor que vai receber o cancelamento — não o do
  // processo que desenha a tela.
  const ag = await agendamentoPorCodigo(codigo);

  return (
    <Frame>
      <Confirmado
        codigo={ag.codigo}
        clienteNome={ag.clienteNome}
        barbeiroNome={ag.barbeiroNome}
        servicoNome={ag.servicoNome}
        inicioIso={ag.inicio}
        fimIso={ag.fim}
        status={ag.status}
        podeCancelar={ag.podeCancelar}
        endereco={ag.endereco}
        whatsappBarbearia={ag.whatsappBarbearia}
        precoCentavos={ag.precoCentavos}
      />
    </Frame>
  );
}
