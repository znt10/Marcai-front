import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { ehDono } from '@/lib/autorizacao';
import { podeDesativar, podeRebaixar } from '@/lib/equipe';
import { GET as equipe, POST as cadastrar } from '@/app/api/painel/equipe/route';
import { GET as barbeirosPublicos } from '@/app/api/barbeiros/route';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
});

beforeEach(limparBanco);

const dono = { sub: 'a', bid: 'b', papel: 'DONO' as const, tv: 0 };
const barbeiro = { ...dono, papel: 'BARBEIRO' as const };

describe('ehDono', () => {
  it('dono é dono, barbeiro não', () => {
    expect(ehDono(dono)).toBe(true);
    expect(ehDono(barbeiro)).toBe(false);
  });
});

describe('podeDesativar', () => {
  const base = {
    ehEuMesmo: false, papel: 'BARBEIRO' as const,
    donosAtivos: 2, agendamentosFuturos: 0, proximoEm: null as Date | null,
  };

  it('caso limpo passa', () => {
    expect(podeDesativar(base)).toBeNull();
  });

  it('a si mesmo é recusado', () => {
    expect(podeDesativar({ ...base, ehEuMesmo: true })).toMatch(/você/i);
  });

  it('último dono é recusado', () => {
    expect(podeDesativar({ ...base, papel: 'DONO', donosAtivos: 1 })).toMatch(/dono/i);
  });

  it('dono com outro dono na casa passa', () => {
    expect(podeDesativar({ ...base, papel: 'DONO', donosAtivos: 2 })).toBeNull();
  });

  it('agenda futura é recusada, e a mensagem traz a contagem', () => {
    const erro = podeDesativar({ ...base, agendamentosFuturos: 7 });
    expect(erro).toContain('7');
  });

  // A ordem importa: quem tenta se desativar sendo o último dono E com agenda
  // futura tem que ouvir o motivo mais próximo dele, não os três de uma vez.
  it('a recusa mais imediata vem primeiro', () => {
    const erro = podeDesativar({
      ...base, ehEuMesmo: true, papel: 'DONO', donosAtivos: 1, agendamentosFuturos: 7,
    });
    expect(erro).toMatch(/você/i);
  });
});

describe('podeRebaixar', () => {
  it('rebaixar o último dono é recusado', () => {
    expect(podeRebaixar({ donosAtivos: 1 })).toMatch(/dono/i);
  });

  it('havendo outro dono, passa', () => {
    expect(podeRebaixar({ donosAtivos: 2 })).toBeNull();
  });
});

// ─── Rotas ────────────────────────────────────────────────────────────────

const pedido = (jwt: string) =>
  new Request('http://brutus.localhost/api/painel/equipe', {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

const pedidoCadastro = (jwt: string, corpo: unknown) =>
  new Request('http://brutus.localhost/api/painel/equipe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

const sessaoDoDono = (ctx: Awaited<ReturnType<typeof montarCenarioBrutus>>) =>
  emitirSessao({ sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0 });

/// Um agendamento CONFIRMADO daqui a três horas, para o barbeiro dado.
async function agendaFutura(
  ctx: Awaited<ReturnType<typeof montarCenarioBrutus>>, barbeiroId: string,
) {
  const cliente = await prismaOwner.cliente.create({
    data: { barbeariaId: ctx.barbearia.id, nome: 'Zé', whatsapp: '11922221111' },
  });
  const inicio = new Date(Date.now() + 3 * 3600_000);
  return prismaOwner.agendamento.create({
    data: {
      barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
      barbeiroId, clienteId: cliente.id, servicoId: ctx.corte.id,
      servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 1800_000),
      duracaoMin: 30, status: 'CONFIRMADO',
    },
  });
}

describe('GET /api/painel/equipe', () => {
  it('barbeiro recebe 403 — e 403, não 404', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    expect((await equipe(pedido(jwt))).status).toBe(403);
  });

  it('dono vê a equipe com o estado de cada um', async () => {
    const ctx = await montarCenarioBrutus();
    const { equipe: lista } = await (await equipe(pedido(await sessaoDoDono(ctx)))).json();

    const teo = lista.find((m: { nome: string }) => m.nome === 'Téo');
    expect(teo.papel).toBe('DONO');
    expect(teo.temSenha).toBe(false);     // o cenário nasce sem senha
    expect(teo.servicos).toBe(3);         // Corte, Barba, Pezinho
    expect(teo.expediente).toBe(7);       // o cenário abre os sete dias
    expect(teo.agendamentosFuturos).toBe(0);
  });

  it('senhaHash e conviteTokenHash nunca saem na resposta', async () => {
    const ctx = await montarCenarioBrutus();
    const bruto = await (await equipe(pedido(await sessaoDoDono(ctx)))).text();
    expect(bruto).not.toContain('senhaHash');
    expect(bruto).not.toContain('conviteTokenHash');
  });

  it('conta o agendamento futuro que impede desativar', async () => {
    const ctx = await montarCenarioBrutus();
    await agendaFutura(ctx, ctx.rael.id);
    const { equipe: lista } = await (await equipe(pedido(await sessaoDoDono(ctx)))).json();
    expect(lista.find((m: { nome: string }) => m.nome === 'Rael').agendamentosFuturos).toBe(1);
  });
});

describe('POST /api/painel/equipe', () => {
  it('cadastra sem senha, com convite, e devolve o link uma vez', async () => {
    const ctx = await montarCenarioBrutus();
    const res = await cadastrar(pedidoCadastro(await sessaoDoDono(ctx), {
      nome: 'Duda', whatsapp: '11955556666', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(201);

    const { linkConvite } = await res.json();
    expect(linkConvite).toContain('/convite/');

    const criado = await prismaOwner.barbeiro.findFirstOrThrow({
      where: { barbeariaId: ctx.barbearia.id, nome: 'Duda' },
    });
    expect(criado.senhaHash).toBeNull();
    expect(criado.conviteTokenHash).not.toBeNull();
    expect(criado.conviteExpiraEm!.getTime()).toBeGreaterThan(Date.now());
    // O token em claro NÃO fica no banco: só o hash dele.
    expect(linkConvite).not.toContain(criado.conviteTokenHash!);
  });

  it('barbeiro não cadastra ninguém', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    const res = await cadastrar(pedidoCadastro(jwt, {
      nome: 'Duda', whatsapp: '11955556666', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(403);
  });

  it('celular repetido é 409, inclusive de desativado', async () => {
    const ctx = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: ctx.rael.id }, data: { ativo: false, desativadoEm: new Date() },
    });
    const res = await cadastrar(pedidoCadastro(await sessaoDoDono(ctx), {
      nome: 'Outro', whatsapp: '11933334444', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).erro).toMatch(/desativad/i);
  });

  it('celular torto é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const res = await cadastrar(pedidoCadastro(await sessaoDoDono(ctx), {
      nome: 'Duda', whatsapp: '119', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(422);
  });

  it('barbeiro recém-cadastrado não aparece na rota pública', async () => {
    const ctx = await montarCenarioBrutus();
    await cadastrar(pedidoCadastro(await sessaoDoDono(ctx), {
      nome: 'Duda', whatsapp: '11955556666', papel: 'BARBEIRO',
    }));

    const { barbeiros } = await (await barbeirosPublicos(
      new Request('http://brutus.localhost/api/barbeiros',
                  { headers: { 'x-barbearia-slug': 'brutus' } }),
    )).json();
    // Sem serviço vinculado ele não tem o que agendar — é a consequência que a
    // tela de equipe precisa avisar em destaque.
    expect(barbeiros.map((b: { nome: string }) => b.nome)).not.toContain('Duda');
  });
});
