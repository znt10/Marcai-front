import { prismaOwner } from './setup';

/// Cenário compartilhado das Tarefas 14 e 15: a barbearia `brutus` do
/// wireframe, com Téo (Corte 40, Barba 30, Pezinho 15), Rael (Corte 30) e
/// expediente de quarta 9h–20h.
export async function montarCenarioBrutus() {
  const barbearia = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });

  const corte = await prismaOwner.servico.create({
    data: { barbeariaId: barbearia.id, nome: 'Corte',
            duracaoMinimaMin: 20, duracaoSugeridaMin: 40, ordem: 0 },
  });
  const barba = await prismaOwner.servico.create({
    data: { barbeariaId: barbearia.id, nome: 'Barba',
            duracaoMinimaMin: 15, duracaoSugeridaMin: 30, ordem: 1 },
  });
  const pezinho = await prismaOwner.servico.create({
    data: { barbeariaId: barbearia.id, nome: 'Pezinho',
            duracaoMinimaMin: 10, duracaoSugeridaMin: 15, ordem: 2 },
  });

  const teo = await prismaOwner.barbeiro.create({
    data: { barbeariaId: barbearia.id, nome: 'Téo', whatsapp: '11911112222',
            papel: 'DONO', ordem: 0 },
  });
  const rael = await prismaOwner.barbeiro.create({
    data: { barbeariaId: barbearia.id, nome: 'Rael', whatsapp: '11933334444', ordem: 1 },
  });

  // Rael NÃO faz pezinho — é o que sustenta o caso "barbeiro que não faz o
  // serviço" da Tarefa 14.
  for (const [barbeiro, servico, min] of [
    [teo, corte, 40], [teo, barba, 30], [teo, pezinho, 15], [rael, corte, 30],
  ] as const) {
    await prismaOwner.barbeiroServico.create({
      data: { barbeariaId: barbearia.id, barbeiroId: barbeiro.id,
              servicoId: servico.id, duracaoMin: min },
    });
  }

  // Todos os dias da semana: `agendamentoDaqui()` cai num dia qualquer, e um
  // expediente só de quarta faria o teste falhar conforme o dia real.
  for (const barbeiro of [teo, rael]) {
    for (let dia = 0; dia <= 6; dia++) {
      await prismaOwner.horarioTrabalho.create({
        data: { barbeariaId: barbearia.id, barbeiroId: barbeiro.id, diaSemana: dia,
                minutosInicio: 0, minutosFim: 24 * 60 },
      });
    }
  }

  return { barbearia, corte, barba, pezinho, teo, rael };
}

/// Um agendamento CONFIRMADO começando daqui a `minutos`, na barbearia
/// `brutus`. Cria o cenário se ele ainda não existir.
export async function agendamentoDaqui(minutos: number) {
  const existente = await prismaOwner.barbearia.findFirst({ where: { slug: 'brutus' } });
  const ctx = existente
    ? {
        barbearia: existente,
        teo: (await prismaOwner.barbeiro.findFirstOrThrow({
          where: { barbeariaId: existente.id, nome: 'Téo' },
        })),
        corte: (await prismaOwner.servico.findFirstOrThrow({
          where: { barbeariaId: existente.id, nome: 'Corte' },
        })),
      }
    : await montarCenarioBrutus();

  const cliente = await prismaOwner.cliente.upsert({
    where: { barbeariaId_whatsapp: { barbeariaId: ctx.barbearia.id, whatsapp: '11977771234' } },
    create: { barbeariaId: ctx.barbearia.id, nome: 'Marcos Vinícius', whatsapp: '11977771234' },
    update: {},
  });

  const inicio = new Date(Date.now() + minutos * 60_000);
  const duracaoMin = 40;

  return prismaOwner.agendamento.create({
    data: {
      barbeariaId: ctx.barbearia.id,
      codigo: Math.random().toString(36).slice(2, 12),
      barbeiroId: ctx.teo.id, clienteId: cliente.id, servicoId: ctx.corte.id,
      servicoNome: 'Corte', inicio,
      fim: new Date(inicio.getTime() + duracaoMin * 60_000),
      duracaoMin, status: 'CONFIRMADO',
    },
  });
}
