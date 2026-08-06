import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { POST } from '@/app/api/agendamentos/route';
import { localParaUtc, diaDeHoje, somarDias } from '@/lib/datas';

// Um dia futuro fixo (quarta ou não, tanto faz: o cenário abre todos os
// dias). Amarrar num '2026-08-05' literal faria a suíte apodrecer quando o
// relógio real passasse dessa data.
const DIA = somarDias(diaDeHoje(new Date()), 7);
let ctx: Awaited<ReturnType<typeof montarCenarioBrutus>>;

// A rota lê o tenant do header que o proxy injeta.
function pedido(corpo: unknown) {
  return new Request('http://brutus.localhost:3000/api/agendamentos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-barbearia-slug': 'brutus' },
    body: JSON.stringify(corpo),
  });
}

beforeEach(async () => {
  await limparBanco();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem evolution')));
  ctx = await montarCenarioBrutus();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/agendamentos', () => {
  it('agenda horário livre e devolve código', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos Vinícius', whatsapp: '(11) 9 7777-1234',
    }));
    expect(r.status).toBe(201);
    const { codigo } = await r.json();
    expect(codigo).toHaveLength(10);
  });

  it('dois pedidos no mesmo horário: um 201, um 409', async () => {
    const corpo = {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    };
    const a = await POST(pedido(corpo));
    const b = await POST(pedido({ ...corpo, whatsapp: '11966665555' }));
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const total = await prismaOwner.agendamento.count({ where: { status: 'CONFIRMADO' } });
    expect(total).toBe(1);
  });

  // O caso acima é sequencial: quem chega depois é barrado pela revalidação
  // de slot, sem chegar no banco. Este exercita o outro caminho — as duas
  // transações leem antes de qualquer uma gravar, e só a restrição de
  // exclusão separa as duas. É o teste que pega o 409 virar 500 se o formato
  // do erro do Prisma mudar.
  it('corrida real cai na restrição de exclusão, não em 500', async () => {
    const corpo = {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 17 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    };
    const [a, b] = await Promise.all([
      POST(pedido(corpo)),
      POST(pedido({ ...corpo, whatsapp: '11966665555' })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prismaOwner.agendamento.count({ where: { status: 'CONFIRMADO' } })).toBe(1);
  });

  it('sobreposição parcial é recusada', async () => {
    await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.barba.id, // 30min
      inicio: localParaUtc(DIA, 16 * 60 + 30).toISOString(),
      nome: 'Ana', whatsapp: '11966665555',
    }));
    expect(r.status).toBe(409);
  });

  it('WhatsApp inválido → 422', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '119777',
    }));
    expect(r.status).toBe(422);
  });

  it('duração forjada no corpo é ignorada', async () => {
    await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234', duracaoMin: 5,
    }));
    const ag = await prismaOwner.agendamento.findFirst();
    expect(ag!.duracaoMin).toBe(40);
  });

  it('barbeiro que não faz o serviço → 422', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.rael.id, servicoId: ctx.pezinho.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    expect(r.status).toBe(422);
  });

  it('horário no passado → 422', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc('2020-01-02', 10 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    expect(r.status).toBe(422);
  });

  it('Evolution respondendo exists:false → 422, nada gravado', async () => {
    process.env.EVOLUTION_API_URL = 'http://evolution.teste';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: false }],
    }));
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    expect(r.status).toBe(422);
    expect(await prismaOwner.agendamento.count()).toBe(0);
    process.env.EVOLUTION_API_URL = '';
  });
});
