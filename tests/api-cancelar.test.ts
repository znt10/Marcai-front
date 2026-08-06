import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus, agendamentoDaqui } from './cenarios';
import { GET } from '@/app/api/agendamentos/[codigo]/route';
import { POST as cancelar } from '@/app/api/agendamentos/[codigo]/cancelar/route';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';

function req(slug = 'brutus') {
  return new Request('http://x/api', { headers: { 'x-barbearia-slug': slug } });
}

beforeEach(async () => {
  await limparBanco();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem evolution')));
  await montarCenarioBrutus();
  // A barbearia-controle: sem ela, o caso de código alheio não teria para
  // onde apontar.
  await prismaOwner.barbearia.create({
    data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
            horarioResumo: 'ter a sáb, 10h–19h', whatsappContato: '11955554444' },
  });
});
afterEach(() => vi.restoreAllMocks());

describe('cancelamento', () => {
  it(`${PRAZO_CANCELAMENTO_MIN + 1} min antes: cancela`, async () => {
    const ag = await agendamentoDaqui(PRAZO_CANCELAMENTO_MIN + 1);
    const r = await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(200);
    const depois = await prismaOwner.agendamento.findUnique({ where: { id: ag.id } });
    expect(depois!.status).toBe('CANCELADO_CLIENTE');
  });

  it(`${PRAZO_CANCELAMENTO_MIN - 1} min antes: recusa e mantém intacto`, async () => {
    const ag = await agendamentoDaqui(PRAZO_CANCELAMENTO_MIN - 1);
    const r = await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(422);
    const depois = await prismaOwner.agendamento.findUnique({ where: { id: ag.id } });
    expect(depois!.status).toBe('CONFIRMADO');
  });

  it('cancelar duas vezes é idempotente', async () => {
    const ag = await agendamentoDaqui(120);
    await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    const r = await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(200);
  });

  it('código de outra barbearia dá 404', async () => {
    const ag = await agendamentoDaqui(120); // criado em brutus
    const r = await GET(req('dontony'), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(404);
  });

  it('GET expõe podeCancelar calculado no servidor', async () => {
    const ag = await agendamentoDaqui(PRAZO_CANCELAMENTO_MIN - 1);
    const r = await GET(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect((await r.json()).podeCancelar).toBe(false);
  });

  // Mira no número do cliente inteiro, cru e formatado — e não num pedaço
  // como '7777', que também é o final do WhatsApp DA BARBEARIA, e esse sai
  // no payload de propósito (é o contato do "passou do prazo").
  it('GET não devolve telefone do cliente', async () => {
    const ag = await agendamentoDaqui(120);
    const corpo = await (await GET(req(), { params: Promise.resolve({ codigo: ag.codigo }) })).json();
    const json = JSON.stringify(corpo);
    expect(json).not.toContain('11977771234');
    expect(json).not.toContain('7777-1234');
  });
});
