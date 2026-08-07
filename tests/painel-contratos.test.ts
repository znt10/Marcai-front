import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { GET as servicos } from '@/app/api/servicos/route';
import { GET as barbeiros } from '@/app/api/barbeiros/route';
import { GET as horarios } from '@/app/api/horarios/route';
import { diaDeHoje } from '@/lib/datas';

/// As telas do painel consomem três rotas públicas em vez de ganharem rotas
/// próprias. O que elas leem é o ENVELOPE da resposta — `d.servicos`,
/// `d.barbeiros`, `d.dias[0].slots` —, e envelope errado não quebra teste
/// nenhum nem typecheck: quebra a tela no navegador, quando o fetch resolve.
///
/// Foi exatamente o que aconteceu: `/api/servicos` devolve `{ servicos: [...] }`
/// e o FormMarcar tratou como array nu. Estes casos existem para que mudar o
/// envelope de qualquer uma das três quebre aqui, e não lá.

beforeEach(limparBanco);

const req = (caminho: string) =>
  new NextRequest(`http://brutus.localhost${caminho}`, {
    headers: { 'x-barbearia-slug': 'brutus' },
  });

describe('contratos que o painel consome', () => {
  it('/api/servicos devolve { servicos: [{ id, nome, duracaoMin }] }', async () => {
    const ctx = await montarCenarioBrutus();
    const corpo = await (await servicos(req(`/api/servicos?barbeiroId=${ctx.rael.id}`))).json();

    expect(Array.isArray(corpo.servicos)).toBe(true);
    expect(corpo.servicos.length).toBeGreaterThan(0);
    expect(Object.keys(corpo.servicos[0]).sort()).toEqual(['duracaoMin', 'id', 'nome']);
  });

  it('/api/barbeiros devolve { barbeiros: [{ id, nome, fotoUrl }] }', async () => {
    await montarCenarioBrutus();
    const corpo = await (await barbeiros(req('/api/barbeiros'))).json();

    expect(Array.isArray(corpo.barbeiros)).toBe(true);
    expect(Object.keys(corpo.barbeiros[0]).sort()).toEqual(['fotoUrl', 'id', 'nome']);
    // O seletor de barbeiro do dono só aparece com mais de um na lista.
    expect(corpo.barbeiros.length).toBeGreaterThan(1);
  });

  it('/api/horarios devolve { dias: [{ data, rotulo, slots }] }', async () => {
    const ctx = await montarCenarioBrutus();
    const hoje = diaDeHoje(new Date());
    const corpo = await (await horarios(
      req(`/api/horarios?barbeiroId=${ctx.teo.id}&servicoId=${ctx.corte.id}&de=${hoje}&dias=1`),
    )).json();

    expect(Array.isArray(corpo.dias)).toBe(true);
    expect(corpo.dias).toHaveLength(1);
    expect(corpo.dias[0].data).toBe(hoje);
    expect(typeof corpo.dias[0].rotulo).toBe('string');
    expect(Array.isArray(corpo.dias[0].slots)).toBe(true);
  });

  it('cada slot traz hora, inicio e barbeiroId — o que o formulário usa', async () => {
    const ctx = await montarCenarioBrutus();
    // Amanhã, não hoje: rodando de madrugada, o dia corrente já passou do
    // expediente e a lista viria vazia — o caso não provaria nada.
    const amanha = diaDeHoje(new Date(Date.now() + 86_400_000));
    const corpo = await (await horarios(
      req(`/api/horarios?barbeiroId=${ctx.teo.id}&servicoId=${ctx.corte.id}&de=${amanha}&dias=1`),
    )).json();

    const slot = corpo.dias[0].slots[0];
    expect(slot).toBeDefined();
    expect(typeof slot.hora).toBe('string');
    expect(typeof slot.inicio).toBe('string');
    expect(slot.barbeiroId).toBe(ctx.teo.id);
  });
});
