import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { GET as agenda } from '@/app/api/painel/agenda/route';
import { localParaUtc, diaDeHoje } from '@/lib/datas';

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
