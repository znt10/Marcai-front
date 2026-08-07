import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { GET as agenda } from '@/app/api/painel/agenda/route';
import { POST as marcarNaMao } from '@/app/api/painel/agendamentos/route';
import { POST as cancelar } from '@/app/api/painel/agendamentos/[id]/cancelar/route';
import { localParaUtc, diaDeHoje } from '@/lib/datas';
import { GRANULARIDADE_MIN } from '@/lib/config';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
});

beforeEach(limparBanco);

const pedido = (jwt: string, busca = '') =>
  new Request(`http://brutus.localhost/api/painel/agenda${busca}`, {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

type Ctx = Awaited<ReturnType<typeof montarCenarioBrutus>>;

/// Um agendamento CONFIRMADO hoje às `hora`, para o barbeiro dado.
async function marcar(ctx: Ctx, barbeiroId: string, hora: number, nome: string) {
  const dia = diaDeHoje(new Date());
  const inicio = localParaUtc(dia, hora * 60);
  const cliente = await prismaOwner.cliente.create({
    data: { barbeariaId: ctx.barbearia.id, nome, whatsapp: `1198${String(hora).padStart(2, '0')}00000` },
  });
  return prismaOwner.agendamento.create({
    data: {
      barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
      barbeiroId, clienteId: cliente.id, servicoId: ctx.corte.id,
      servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 40 * 60_000),
      duracaoMin: 40, status: 'CONFIRMADO',
    },
  });
}

/// Cenário com um agendamento do Téo e um do Rael no mesmo dia.
async function comDoisNaAgenda() {
  const ctx = await montarCenarioBrutus();
  await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
  await marcar(ctx, ctx.rael.id, 11, 'Cliente do Rael');
  return ctx;
}

const sessaoDe = (ctx: Ctx, quem: 'teo' | 'rael') =>
  emitirSessao({
    sub: ctx[quem].id, bid: ctx.barbearia.id,
    papel: quem === 'teo' ? 'DONO' : 'BARBEIRO', tv: 0,
  });

describe('GET /api/painel/agenda', () => {
  it('o dono vê a agenda de todos', async () => {
    const ctx = await comDoisNaAgenda();
    const res = await agenda(pedido(await sessaoDe(ctx, 'teo')));
    expect(res.status).toBe(200);
    expect((await res.json()).itens).toHaveLength(2);
  });

  it('o barbeiro vê só a dele', async () => {
    const ctx = await comDoisNaAgenda();
    const { itens } = await (await agenda(pedido(await sessaoDe(ctx, 'rael')))).json();
    expect(itens).toHaveLength(1);
    expect(itens[0].clienteNome).toBe('Cliente do Rael');
  });

  it('barbeiro pedindo a agenda do colega continua vendo a dele', async () => {
    const ctx = await comDoisNaAgenda();
    const jwt = await sessaoDe(ctx, 'rael');
    const { itens } = await (await agenda(pedido(jwt, `?barbeiroId=${ctx.teo.id}`))).json();
    expect(itens).toHaveLength(1);
    expect(itens[0].clienteNome).toBe('Cliente do Rael');
  });

  it('o dono filtrando por um barbeiro vê só aquele', async () => {
    const ctx = await comDoisNaAgenda();
    const jwt = await sessaoDe(ctx, 'teo');
    const { itens } = await (await agenda(pedido(jwt, `?barbeiroId=${ctx.rael.id}`))).json();
    expect(itens).toHaveLength(1);
    expect(itens[0].clienteNome).toBe('Cliente do Rael');
  });

  it('sem cookie é 401', async () => {
    await montarCenarioBrutus();
    const res = await agenda(new Request('http://brutus.localhost/api/painel/agenda', {
      headers: { 'x-barbearia-slug': 'brutus' },
    }));
    expect(res.status).toBe(401);
  });

  it('cancelado não aparece', async () => {
    const ctx = await montarCenarioBrutus();
    const a = await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
    await prismaOwner.agendamento.update({
      where: { id: a.id }, data: { status: 'CANCELADO_BARBEIRO', canceladoEm: new Date() },
    });
    const { itens } = await (await agenda(pedido(await sessaoDe(ctx, 'teo')))).json();
    expect(itens).toHaveLength(0);
  });
});

const pedidoMarcar = (jwt: string, corpo: unknown) =>
  new Request('http://brutus.localhost/api/painel/agendamentos', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus',
      cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

/// Um horário livre daqui a `minutos`, alinhado à granularidade — o motor de
/// slots só oferece horário alinhado, e pedir fora dele daria 409 sempre.
function daquiAlinhado(minutos: number) {
  const d = new Date(Date.now() + minutos * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / GRANULARIDADE_MIN) * GRANULARIDADE_MIN);
  return d;
}

describe('POST /api/painel/agendamentos', () => {
  it('o barbeiro marca para si', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await marcarNaMao(pedidoMarcar(jwt, {
      barbeiroId: ctx.rael.id, servicoId: ctx.corte.id,
      inicio: daquiAlinhado(60).toISOString(),
      nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).codigo).toHaveLength(10);
  });

  it('o barbeiro não marca na agenda do colega', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await marcarNaMao(pedidoMarcar(jwt, {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: daquiAlinhado(60).toISOString(),
      nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));
    expect(res.status).toBe(404);
  });

  it('horário ocupado responde 409 e não duplica', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const inicio = daquiAlinhado(90);
    const corpo = {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: inicio.toISOString(), nome: 'Seu Osvaldo', whatsapp: '11955554444',
    };

    expect((await marcarNaMao(pedidoMarcar(jwt, corpo))).status).toBe(201);
    expect((await marcarNaMao(pedidoMarcar(jwt, corpo))).status).toBe(409);

    const quantos = await prismaOwner.agendamento.count({
      where: { barbeariaId: ctx.barbearia.id, inicio, status: 'CONFIRMADO' },
    });
    expect(quantos).toBe(1);
  });

  it('horário que já passou é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const res = await marcarNaMao(pedidoMarcar(jwt, {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: new Date(Date.now() - 60 * 60_000).toISOString(),
      nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));
    expect(res.status).toBe(422);
  });

  it('cliente que já existe é reaproveitado e o nome é atualizado', async () => {
    const ctx = await montarCenarioBrutus();
    await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'osvaldo', whatsapp: '11955554444' },
    });
    const jwt = await sessaoDe(ctx, 'teo');
    await marcarNaMao(pedidoMarcar(jwt, {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: daquiAlinhado(120).toISOString(),
      nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));

    const clientes = await prismaOwner.cliente.findMany({
      where: { barbeariaId: ctx.barbearia.id, whatsapp: '11955554444' },
    });
    expect(clientes).toHaveLength(1);
    expect(clientes[0].nome).toBe('Seu Osvaldo');
  });
});

const pedidoCancelar = (jwt: string, id: string) => [
  new Request(`http://brutus.localhost/api/painel/agendamentos/${id}/cancelar`, {
    method: 'POST',
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  }),
  { params: Promise.resolve({ id }) },
] as const;

describe('POST /api/painel/agendamentos/[id]/cancelar', () => {
  it('cancela o próprio e libera o horário', async () => {
    const ctx = await montarCenarioBrutus();
    const a = await marcar(ctx, ctx.rael.id, 15, 'Cliente do Rael');
    const res = await cancelar(...pedidoCancelar(await sessaoDe(ctx, 'rael'), a.id));
    expect(res.status).toBe(200);

    const depois = await prismaOwner.agendamento.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois.status).toBe('CANCELADO_BARBEIRO');
    expect(depois.canceladoEm).not.toBeNull();
  });

  it('o agendamento do colega responde 404, não 403', async () => {
    const ctx = await montarCenarioBrutus();
    const doTeo = await marcar(ctx, ctx.teo.id, 16, 'Cliente do Téo');
    const res = await cancelar(...pedidoCancelar(await sessaoDe(ctx, 'rael'), doTeo.id));
    expect(res.status).toBe(404);

    const intacto = await prismaOwner.agendamento.findUniqueOrThrow({ where: { id: doTeo.id } });
    expect(intacto.status).toBe('CONFIRMADO');
  });

  it('o dono cancela o de qualquer um', async () => {
    const ctx = await montarCenarioBrutus();
    const doRael = await marcar(ctx, ctx.rael.id, 17, 'Cliente do Rael');
    const res = await cancelar(...pedidoCancelar(await sessaoDe(ctx, 'teo'), doRael.id));
    expect(res.status).toBe(200);
  });

  it('id que não existe é 404', async () => {
    const ctx = await montarCenarioBrutus();
    const res = await cancelar(...pedidoCancelar(
      await sessaoDe(ctx, 'teo'), '00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });

  it('cancelar em cima da hora é permitido para o barbeiro', async () => {
    const ctx = await montarCenarioBrutus();
    const cliente = await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Daqui a pouco', whatsapp: '11944443333' },
    });
    // Dentro do PRAZO_CANCELAMENTO_MIN, que vale para o cliente e não para
    // o barbeiro.
    const inicio = new Date(Date.now() + 10 * 60_000);
    const a = await prismaOwner.agendamento.create({
      data: {
        barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
        barbeiroId: ctx.teo.id, clienteId: cliente.id, servicoId: ctx.corte.id,
        servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 40 * 60_000),
        duracaoMin: 40, status: 'CONFIRMADO',
      },
    });
    const res = await cancelar(...pedidoCancelar(await sessaoDe(ctx, 'teo'), a.id));
    expect(res.status).toBe(200);
  });
});
