import { describe, it, expect } from 'vitest';
import { beforeAll, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { diaDeHoje, diaSemanaDe, localParaUtc, somarDias } from '@/lib/datas';
import { jornadaValida, bloqueioValido } from '@/lib/horarios';
import { GET as ver, PUT as definir, DELETE as fechar } from '@/app/api/painel/expediente/route';
import { POST as criarBloqueio } from '@/app/api/painel/bloqueios/route';
import { DELETE as apagarBloqueio } from '@/app/api/painel/bloqueios/[id]/route';
import { GET as conflitos } from '@/app/api/painel/conflitos/route';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
});

beforeEach(limparBanco);

type Ctx = Awaited<ReturnType<typeof montarCenarioBrutus>>;

const sessaoDe = (ctx: Ctx, quem: 'teo' | 'rael') =>
  emitirSessao({
    sub: ctx[quem].id, bid: ctx.barbearia.id,
    papel: quem === 'teo' ? 'DONO' : 'BARBEIRO', tv: 0,
  });

describe('jornadaValida', () => {
  it('9h às 20h passa', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540, minutosFim: 1200 })).toBeNull();
  });

  it('fim antes do início é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 1200, minutosFim: 540 })).not.toBeNull();
  });

  it('fim igual ao início é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540, minutosFim: 540 })).not.toBeNull();
  });

  it('além das 24h é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540, minutosFim: 1500 })).not.toBeNull();
  });

  it('dia fora de 0..6 é recusado', () => {
    expect(jornadaValida({ diaSemana: 7, minutosInicio: 540, minutosFim: 1200 })).not.toBeNull();
  });

  it('minuto quebrado é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540.5, minutosFim: 1200 })).not.toBeNull();
  });
});

describe('bloqueioValido', () => {
  const semanal = {
    repeteSemanalmente: true, diaSemana: 3,
    minutosInicio: 720, minutosFim: 780, inicio: null, fim: null,
  };
  const pontual = {
    repeteSemanalmente: false, diaSemana: null,
    minutosInicio: null, minutosFim: null,
    inicio: new Date('2026-08-10T12:00:00Z'),
    fim: new Date('2026-08-10T13:00:00Z'),
  };

  it('semanal completo passa', () => expect(bloqueioValido(semanal)).toBeNull());
  it('pontual completo passa', () => expect(bloqueioValido(pontual)).toBeNull());

  it('semanal sem dia é recusado', () => {
    expect(bloqueioValido({ ...semanal, diaSemana: null })).not.toBeNull();
  });

  it('semanal com fim antes do início é recusado', () => {
    expect(bloqueioValido({ ...semanal, minutosFim: 600 })).not.toBeNull();
  });

  it('pontual sem fim é recusado', () => {
    expect(bloqueioValido({ ...pontual, fim: null })).not.toBeNull();
  });

  it('pontual com fim antes do início é recusado', () => {
    expect(bloqueioValido({ ...pontual, fim: new Date('2026-08-10T11:00:00Z') })).not.toBeNull();
  });

  // Os dois conjuntos juntos criariam uma linha cuja interpretacao depende de
  // qual campo alguem leu primeiro.
  it('os dois formatos juntos é recusado', () => {
    expect(bloqueioValido({ ...semanal, inicio: pontual.inicio, fim: pontual.fim })).not.toBeNull();
  });
});

// ─── Rotas ────────────────────────────────────────────────────────────────

/// Os slots que o MOTOR devolve — é o que prova que a escrita chegou onde
/// interessa. Conferir só a linha no banco deixaria passar o dia em que o
/// motor passasse a ler outra coisa.
async function slotsDoBarbeiro(ctx: Ctx, barbeiroId: string) {
  const dia = diaDeHoje(new Date());
  return comBarbearia(ctx.barbearia.id, (tx) =>
    slotsDoDia(tx, ctx.barbearia.id, barbeiroId, ctx.corte.id, dia, new Date()));
}

const pedidoExpediente = (jwt: string, busca = '') =>
  new Request(`http://brutus.localhost/api/painel/expediente${busca}`, {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

const pedidoPut = (jwt: string, corpo: unknown) =>
  new Request('http://brutus.localhost/api/painel/expediente', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

const pedidoDelete = (jwt: string, busca: string) =>
  new Request(`http://brutus.localhost/api/painel/expediente${busca}`, {
    method: 'DELETE',
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

describe('expediente', () => {
  it('definir a jornada faz o motor oferecer horário', async () => {
    const ctx = await montarCenarioBrutus();
    // O cenário abre os sete dias; fecha-se tudo para provar o efeito de criar.
    await prismaOwner.horarioTrabalho.deleteMany({ where: { barbeiroId: ctx.rael.id } });
    expect(await slotsDoBarbeiro(ctx, ctx.rael.id)).toHaveLength(0);

    const jwt = await sessaoDe(ctx, 'rael');
    const res = await definir(pedidoPut(jwt, {
      diaSemana: diaSemanaDe(diaDeHoje(new Date())),
      minutosInicio: 0, minutosFim: 24 * 60,
    }));
    expect(res.status).toBe(200);

    expect((await slotsDoBarbeiro(ctx, ctx.rael.id)).length).toBeGreaterThan(0);
  });

  it('fechar o dia zera a agenda daquele dia', async () => {
    const ctx = await montarCenarioBrutus();
    expect((await slotsDoBarbeiro(ctx, ctx.rael.id)).length).toBeGreaterThan(0);

    const jwt = await sessaoDe(ctx, 'rael');
    const hoje = diaSemanaDe(diaDeHoje(new Date()));
    const res = await fechar(pedidoDelete(jwt, `?diaSemana=${hoje}`));
    expect(res.status).toBe(200);

    expect(await slotsDoBarbeiro(ctx, ctx.rael.id)).toHaveLength(0);
  });

  it('o barbeiro não mexe no expediente do colega', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await definir(pedidoPut(jwt, {
      barbeiroId: ctx.teo.id, diaSemana: 3, minutosInicio: 0, minutosFim: 60,
    }));
    expect(res.status).toBe(404);

    // E o expediente do Téo continua o que era.
    const doTeo = await prismaOwner.horarioTrabalho.findFirst({
      where: { barbeiroId: ctx.teo.id, diaSemana: 3 },
    });
    expect(doTeo?.minutosFim).toBe(24 * 60);
  });

  it('o dono define o de qualquer um', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const res = await definir(pedidoPut(jwt, {
      barbeiroId: ctx.rael.id, diaSemana: 3, minutosInicio: 600, minutosFim: 1080,
    }));
    expect(res.status).toBe(200);

    const doRael = await prismaOwner.horarioTrabalho.findFirst({
      where: { barbeiroId: ctx.rael.id, diaSemana: 3 },
    });
    expect(doRael?.minutosInicio).toBe(600);
  });

  it('jornada invertida é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await definir(pedidoPut(jwt, {
      diaSemana: 3, minutosInicio: 1200, minutosFim: 540,
    }));
    expect(res.status).toBe(422);
  });

  it('o GET traz os dias e os bloqueios', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const corpo = await (await ver(pedidoExpediente(jwt))).json();
    expect(corpo.expediente).toHaveLength(7);
    expect(Array.isArray(corpo.bloqueios)).toBe(true);
  });
});

const pedidoBloqueio = (jwt: string, corpo: unknown) =>
  new Request('http://brutus.localhost/api/painel/bloqueios', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

const pedidoApagar = (jwt: string, id: string) => [
  new Request(`http://brutus.localhost/api/painel/bloqueios/${id}`, {
    method: 'DELETE',
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  }),
  { params: Promise.resolve({ id }) },
] as const;

describe('bloqueios', () => {
  it('bloqueio semanal tira os slots daquela faixa', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const hoje = diaSemanaDe(diaDeHoje(new Date()));

    const antes = await slotsDoBarbeiro(ctx, ctx.rael.id);
    const res = await criarBloqueio(pedidoBloqueio(jwt, {
      motivo: 'ALMOCO', repeteSemanalmente: true,
      diaSemana: hoje, minutosInicio: 0, minutosFim: 24 * 60,
    }));
    expect(res.status).toBe(201);

    // Bloqueou o dia inteiro: não sobra slot nenhum.
    expect(antes.length).toBeGreaterThan(0);
    expect(await slotsDoBarbeiro(ctx, ctx.rael.id)).toHaveLength(0);
  });

  it('bloqueio semanal de OUTRO dia não afeta hoje', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const hoje = diaSemanaDe(diaDeHoje(new Date()));
    const outro = (hoje + 3) % 7;

    const antes = await slotsDoBarbeiro(ctx, ctx.rael.id);
    await criarBloqueio(pedidoBloqueio(jwt, {
      motivo: 'FOLGA', repeteSemanalmente: true,
      diaSemana: outro, minutosInicio: 0, minutosFim: 24 * 60,
    }));
    expect(await slotsDoBarbeiro(ctx, ctx.rael.id)).toHaveLength(antes.length);
  });

  it('bloqueio pontual tira os slots do dia e devolve ao apagar', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const dia = diaDeHoje(new Date());

    const antes = await slotsDoBarbeiro(ctx, ctx.rael.id);
    const res = await criarBloqueio(pedidoBloqueio(jwt, {
      motivo: 'PESSOAL', repeteSemanalmente: false,
      inicio: localParaUtc(dia, 0).toISOString(),
      fim: localParaUtc(somarDias(dia, 1), 0).toISOString(),
    }));
    expect(res.status).toBe(201);
    const { id } = await res.json();

    expect(await slotsDoBarbeiro(ctx, ctx.rael.id)).toHaveLength(0);

    expect((await apagarBloqueio(...pedidoApagar(jwt, id))).status).toBe(200);
    expect(await slotsDoBarbeiro(ctx, ctx.rael.id)).toHaveLength(antes.length);
  });

  it('bloqueio pontual não afeta a semana seguinte', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const dia = diaDeHoje(new Date());
    const daquiUmaSemana = somarDias(dia, 7);

    await criarBloqueio(pedidoBloqueio(jwt, {
      motivo: 'PESSOAL', repeteSemanalmente: false,
      inicio: localParaUtc(dia, 0).toISOString(),
      fim: localParaUtc(somarDias(dia, 1), 0).toISOString(),
    }));

    const naSemanaQueVem = await comBarbearia(ctx.barbearia.id, (tx) =>
      slotsDoDia(tx, ctx.barbearia.id, ctx.rael.id, ctx.corte.id, daquiUmaSemana, new Date()));
    expect(naSemanaQueVem.length).toBeGreaterThan(0);
  });

  it('os dois formatos juntos é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await criarBloqueio(pedidoBloqueio(jwt, {
      motivo: 'OUTRO', repeteSemanalmente: true,
      diaSemana: 3, minutosInicio: 600, minutosFim: 700,
      inicio: new Date().toISOString(), fim: new Date(Date.now() + 3600_000).toISOString(),
    }));
    expect(res.status).toBe(422);
  });

  it('apagar bloqueio de colega é 404', async () => {
    const ctx = await montarCenarioBrutus();
    const doTeo = await prismaOwner.bloqueio.create({
      data: {
        barbeariaId: ctx.barbearia.id, barbeiroId: ctx.teo.id, motivo: 'FOLGA',
        repeteSemanalmente: true, diaSemana: 2, minutosInicio: 600, minutosFim: 700,
      },
    });
    const jwt = await sessaoDe(ctx, 'rael');
    expect((await apagarBloqueio(...pedidoApagar(jwt, doTeo.id))).status).toBe(404);

    const intacto = await prismaOwner.bloqueio.findUnique({ where: { id: doTeo.id } });
    expect(intacto).not.toBeNull();
  });

  it('o dono apaga bloqueio de qualquer um', async () => {
    const ctx = await montarCenarioBrutus();
    const doRael = await prismaOwner.bloqueio.create({
      data: {
        barbeariaId: ctx.barbearia.id, barbeiroId: ctx.rael.id, motivo: 'FOLGA',
        repeteSemanalmente: true, diaSemana: 2, minutosInicio: 600, minutosFim: 700,
      },
    });
    const jwt = await sessaoDe(ctx, 'teo');
    expect((await apagarBloqueio(...pedidoApagar(jwt, doRael.id))).status).toBe(200);
  });
});

const pedidoConflitos = (jwt: string, busca = '') =>
  new Request(`http://brutus.localhost/api/painel/conflitos${busca}`, {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

/// Um agendamento CONFIRMADO amanhã, na hora local pedida.
async function agendarAmanha(ctx: Ctx, barbeiroId: string, minutos: number, nome: string) {
  const dia = somarDias(diaDeHoje(new Date()), 1);
  const inicio = localParaUtc(dia, minutos);
  const cliente = await prismaOwner.cliente.create({
    data: { barbeariaId: ctx.barbearia.id, nome, whatsapp: `11955${minutos}0000`.slice(0, 11) },
  });
  return prismaOwner.agendamento.create({
    data: {
      barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
      barbeiroId, clienteId: cliente.id, servicoId: ctx.corte.id,
      servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 30 * 60_000),
      duracaoMin: 30, status: 'CONFIRMADO',
    },
  });
}

describe('conflitos', () => {
  it('lista o agendamento que ficou fora do expediente encurtado', async () => {
    const ctx = await montarCenarioBrutus();
    await agendarAmanha(ctx, ctx.rael.id, 19 * 60, 'Cliente das 19h');
    const jwt = await sessaoDe(ctx, 'rael');

    // Sem conflito enquanto o dia vai até meia-noite.
    expect((await (await conflitos(pedidoConflitos(jwt))).json()).conflitos).toHaveLength(0);

    // Encurta para 9h-18h: as 19h ficam de fora.
    const amanha = diaSemanaDe(somarDias(diaDeHoje(new Date()), 1));
    await definir(pedidoPut(jwt, {
      diaSemana: amanha, minutosInicio: 9 * 60, minutosFim: 18 * 60,
    }));

    const { conflitos: lista } = await (await conflitos(pedidoConflitos(jwt))).json();
    expect(lista).toHaveLength(1);
    expect(lista[0].clienteNome).toBe('Cliente das 19h');
  });

  it('lista o que caiu dentro de bloqueio novo', async () => {
    const ctx = await montarCenarioBrutus();
    await agendarAmanha(ctx, ctx.rael.id, 14 * 60, 'Cliente das 14h');
    const jwt = await sessaoDe(ctx, 'rael');

    const dia = somarDias(diaDeHoje(new Date()), 1);
    await criarBloqueio(pedidoBloqueio(jwt, {
      motivo: 'PESSOAL', repeteSemanalmente: false,
      inicio: localParaUtc(dia, 13 * 60).toISOString(),
      fim: localParaUtc(dia, 15 * 60).toISOString(),
    }));

    const { conflitos: lista } = await (await conflitos(pedidoConflitos(jwt))).json();
    expect(lista).toHaveLength(1);
    expect(lista[0].clienteNome).toBe('Cliente das 14h');
  });

  it('não lista o que já passou nem o cancelado', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');

    // Passado: fora do expediente de ontem, mas já aconteceu.
    const ontem = somarDias(diaDeHoje(new Date()), -1);
    const cliente = await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Antigo', whatsapp: '11933330000' },
    });
    const inicio = localParaUtc(ontem, 19 * 60);
    await prismaOwner.agendamento.create({
      data: {
        barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
        barbeiroId: ctx.rael.id, clienteId: cliente.id, servicoId: ctx.corte.id,
        servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 1800_000),
        duracaoMin: 30, status: 'CONFIRMADO',
      },
    });

    // Cancelado no futuro, fora de qualquer expediente.
    const futuro = await agendarAmanha(ctx, ctx.rael.id, 23 * 60, 'Cancelado');
    await prismaOwner.agendamento.update({
      where: { id: futuro.id },
      data: { status: 'CANCELADO_CLIENTE', canceladoEm: new Date() },
    });

    const amanha = diaSemanaDe(somarDias(diaDeHoje(new Date()), 1));
    await definir(pedidoPut(jwt, {
      diaSemana: amanha, minutosInicio: 9 * 60, minutosFim: 18 * 60,
    }));

    const { conflitos: lista } = await (await conflitos(pedidoConflitos(jwt))).json();
    expect(lista).toHaveLength(0);
  });

  it('o dono vê o conflito de qualquer um', async () => {
    const ctx = await montarCenarioBrutus();
    await agendarAmanha(ctx, ctx.rael.id, 19 * 60, 'Cliente das 19h');
    const doRael = await sessaoDe(ctx, 'rael');
    const amanha = diaSemanaDe(somarDias(diaDeHoje(new Date()), 1));
    await definir(pedidoPut(doRael, {
      diaSemana: amanha, minutosInicio: 9 * 60, minutosFim: 18 * 60,
    }));

    const doTeo = await sessaoDe(ctx, 'teo');
    const { conflitos: lista } = await (await conflitos(
      pedidoConflitos(doTeo, `?barbeiroId=${ctx.rael.id}`))).json();
    expect(lista).toHaveLength(1);
  });
});
