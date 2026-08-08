import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { localParaUtc, diaDeHoje, somarDias, diaSemanaDe } from '@/lib/datas';
import { slotsLivres, bloqueiosDoDia } from '@/lib/slots';
import { ocupacaoPct, type Intervalo } from '@/lib/quadro';

/// O quadro do dia (tela 1h): uma coluna por barbeiro, lado a lado.
///
/// Existe como rota própria em vez de três chamadas do navegador por três
/// motivos, em ordem de gravidade: a lista de barbeiros só sai de
/// `/painel/equipe`, que é 403 para barbeiro — a tela quebraria para metade
/// dos usuários; seriam N+1 requisições; e o "próximo horário livre" é
/// cálculo do motor de slots, que reimplementado no cliente viraria uma
/// segunda versão do núcleo do sistema, condenada a divergir da primeira.

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const pedido = url.searchParams.get('dia');
  const dia = pedido && DIA.test(pedido) ? pedido : diaDeHoje(new Date());
  const diaSemana = diaSemanaDe(dia);

  // Como na agenda: o filtro da sessão vence a query. Barbeiro pedindo a
  // coluna do colega recebe a própria — parâmetro ignorado, não erro.
  const doFiltro = filtroDoBarbeiro(aberta.sessao);
  const pedidoBarbeiro = url.searchParams.get('barbeiroId');
  const barbeiroId = doFiltro.barbeiroId ?? pedidoBarbeiro ?? undefined;

  const abreDoDia = localParaUtc(dia, 0);
  const fechaDoDia = localParaUtc(somarDias(dia, 1), 0);
  const agora = new Date();

  const colunas = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const barbeiros = await tx.barbeiro.findMany({
      where: {
        ...(barbeiroId ? { id: barbeiroId } : {}),
        // Ativo, ou inativo com agendamento nesse dia. A segunda metade não é
        // enfeite: desativar exige agenda futura vazia, mas o passado continua
        // lá — sem ela, o quadro de um dia antigo mostraria menos clientes do
        // que o dia realmente teve.
        OR: [
          { ativo: true },
          {
            agendamentos: {
              some: {
                status: 'CONFIRMADO',
                inicio: { lt: fechaDoDia }, fim: { gt: abreDoDia },
              },
            },
          },
        ],
      },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
      select: { id: true, nome: true, papel: true, ativo: true },
    });
    if (barbeiros.length === 0) return [];

    const ids = barbeiros.map((b) => b.id);
    const [expedientes, bloqueios, agendamentos, vinculos] = await Promise.all([
      tx.horarioTrabalho.findMany({
        where: { barbeiroId: { in: ids }, diaSemana },
        select: { barbeiroId: true, minutosInicio: true, minutosFim: true },
      }),
      tx.bloqueio.findMany({ where: { barbeiroId: { in: ids } } }),
      tx.agendamento.findMany({
        where: {
          barbeiroId: { in: ids }, status: 'CONFIRMADO',
          // Cruzar a janela, e não começar dentro dela: um corte que atravessa
          // a meia-noite pertence aos dois dias.
          inicio: { lt: fechaDoDia }, fim: { gt: abreDoDia },
        },
        orderBy: { inicio: 'asc' },
        select: {
          id: true, barbeiroId: true, inicio: true, fim: true, servicoNome: true,
          cliente: { select: { nome: true, whatsapp: true } },
        },
      }),
      tx.barbeiroServico.findMany({
        where: { barbeiroId: { in: ids }, ativo: true, servico: { ativo: true } },
        select: {
          barbeiroId: true, duracaoMin: true,
          servico: { select: { nome: true, ordem: true } },
        },
      }),
    ]);

    return barbeiros.map((b) => {
      const meusAgendamentos = agendamentos.filter((a) => a.barbeiroId === b.id);
      const meusBloqueios = bloqueios.filter((x) => x.barbeiroId === b.id);
      const doDia = bloqueiosDoDia(meusBloqueios, dia, diaSemana);
      const jornada = expedientes.find((h) => h.barbeiroId === b.id);

      const itens = [
        ...meusAgendamentos.map((a) => ({
          tipo: 'AGENDAMENTO' as const,
          id: a.id, inicio: a.inicio, fim: a.fim, servicoNome: a.servicoNome,
          clienteNome: a.cliente.nome, clienteWhatsapp: a.cliente.whatsapp,
        })),
        // O semanal chega traduzido em instante: a tela não vê `minutosInicio`
        // nem `repeteSemanalmente`. Traduzir recorrência é do servidor.
        ...meusBloqueios.flatMap((x) => {
          const [quando] = bloqueiosDoDia([x], dia, diaSemana);
          return quando ? [{
            tipo: 'BLOQUEIO' as const,
            id: x.id, inicio: quando.inicio, fim: quando.fim,
            motivo: x.motivo, observacao: x.observacao,
          }] : [];
        }),
      ].sort((x, y) => x.inicio.getTime() - y.inicio.getTime());

      // O serviço mais curto que ele pratica: é a resposta a "cabe alguma
      // coisa?", que é a pergunta do balcão. Otimista de propósito — por isso
      // o horário nunca sai sozinho, sempre com o serviço que o justifica.
      const meusServicos = vinculos
        .filter((v) => v.barbeiroId === b.id)
        .sort((x, y) => x.duracaoMin - y.duracaoMin || x.servico.ordem - y.servico.ordem);
      const maisCurto = meusServicos[0];

      const livres = maisCurto && jornada
        ? slotsLivres({
            barbeiroId: b.id,
            duracaoMin: maisCurto.duracaoMin,
            expediente: [{ diaSemana, ...jornada }],
            bloqueios: meusBloqueios,
            agendamentos: meusAgendamentos,
            dia, agora,
          })
        : [];

      const janela: Intervalo | null = jornada
        ? { inicio: localParaUtc(dia, jornada.minutosInicio),
            fim:    localParaUtc(dia, jornada.minutosFim) }
        : null;

      return {
        barbeiroId: b.id, barbeiroNome: b.nome, papel: b.papel, ativo: b.ativo,
        abre: jornada?.minutosInicio ?? null,
        fecha: jornada?.minutosFim ?? null,
        ocupacaoPct: janela ? ocupacaoPct(meusAgendamentos, doDia, janela) : null,
        proximoLivre: livres[0]?.inicio ?? null,
        // Vem mesmo sem horário livre, e é o que separa dois estados que a
        // tela precisa distinguir porque pedem ações opostas: nulo é "não
        // marcou serviço nenhum" (o mesmo aviso da tela de equipe), presente
        // com `proximoLivre` nulo é "está cheio".
        servicoMaisCurto: maisCurto?.servico.nome ?? null,
        itens,
      };
    });
  });

  return NextResponse.json({ dia, colunas });
}
