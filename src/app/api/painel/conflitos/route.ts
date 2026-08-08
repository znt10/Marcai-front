import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { alvoDoBarbeiro, NAO_ENCONTRADO } from '@/lib/alcance';
import { utcParaLocal, localParaUtc, diaSemanaDe } from '@/lib/datas';

/// O que ficou pendurado depois de encurtar o expediente ou marcar folga.
///
/// Encurtar é PERMITIDO (spec §5): fechar a agenda é o que se faz agora, com o
/// braço quebrado, e recusar deixaria o cliente batendo numa porta fechada. Em
/// troca, o sistema mostra o que sobrou — e quem cancela é gente, pela rota de
/// cancelamento que já existe e avisa o cliente.

/// Mesma regra de intervalo semiaberto do motor (`slots.ts`): quem termina
/// 16:40 não colide com quem começa 16:40. Repetida aqui em vez de exportada
/// para não abrir a superfície do motor por causa de três linhas — e um teste
/// atravessa até `slotsDoDia` para garantir que as duas não divirjam.
const colide = (aIni: Date, aFim: Date, bIni: Date, bFim: Date) =>
  aIni < bFim && aFim > bIni;

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const barbeiroId = alvoDoBarbeiro(aberta.sessao, url.searchParams.get('barbeiroId'));
  if (!barbeiroId) return NAO_ENCONTRADO;

  const agora = new Date();

  const conflitos = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const [agendamentos, expediente, bloqueios] = await Promise.all([
      tx.agendamento.findMany({
        where: { barbeiroId, status: 'CONFIRMADO', inicio: { gt: agora } },
        orderBy: { inicio: 'asc' },
        select: {
          id: true, inicio: true, fim: true, servicoNome: true,
          cliente: { select: { nome: true, whatsapp: true } },
        },
      }),
      tx.horarioTrabalho.findMany({
        where: { barbeiroId },
        select: { diaSemana: true, minutosInicio: true, minutosFim: true },
      }),
      tx.bloqueio.findMany({ where: { barbeiroId } }),
    ]);

    return agendamentos.filter((a) => {
      const { dia } = utcParaLocal(a.inicio);
      const diaSemana = diaSemanaDe(dia);

      // Fora da jornada — inclusive quando o dia foi fechado e não há jornada.
      const jornada = expediente.find((h) => h.diaSemana === diaSemana);
      if (!jornada) return true;
      const abre = localParaUtc(dia, jornada.minutosInicio);
      const fecha = localParaUtc(dia, jornada.minutosFim);
      if (a.inicio < abre || a.fim > fecha) return true;

      // Ou dentro de um bloqueio.
      return bloqueios.some((b) => {
        if (b.repeteSemanalmente) {
          if (b.diaSemana !== diaSemana) return false;
          return colide(a.inicio, a.fim,
                        localParaUtc(dia, b.minutosInicio!), localParaUtc(dia, b.minutosFim!));
        }
        return colide(a.inicio, a.fim, b.inicio!, b.fim!);
      });
    }).map((a) => ({
      id: a.id, inicio: a.inicio, fim: a.fim, servicoNome: a.servicoNome,
      clienteNome: a.cliente.nome, clienteWhatsapp: a.cliente.whatsapp,
    }));
  });

  return NextResponse.json({ conflitos });
}
