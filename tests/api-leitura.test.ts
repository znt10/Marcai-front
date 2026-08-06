import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { localParaUtc, formatarHora } from '@/lib/datas';

const DIA = '2026-08-05'; // quarta
let ctx: Awaited<ReturnType<typeof montar>>;

async function montar() {
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'x',
            horarioResumo: 'y', whatsappContato: '11988887777' },
  });
  const corte = await prismaOwner.servico.create({
    data: { barbeariaId: b.id, nome: 'Corte', duracaoMinimaMin: 20, duracaoSugeridaMin: 40 },
  });
  const pezinho = await prismaOwner.servico.create({
    data: { barbeariaId: b.id, nome: 'Pezinho', duracaoMinimaMin: 10, duracaoSugeridaMin: 15 },
  });
  const teo = await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO', ordem: 0 },
  });
  const rael = await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Rael', whatsapp: '11933334444', ordem: 1 },
  });
  for (const [barbeiro, servico, min] of [
    [teo, corte, 40], [teo, pezinho, 15], [rael, corte, 30],
  ] as const) {
    await prismaOwner.barbeiroServico.create({
      data: { barbeariaId: b.id, barbeiroId: barbeiro.id, servicoId: servico.id, duracaoMin: min },
    });
  }
  for (const barbeiro of [teo, rael]) {
    await prismaOwner.horarioTrabalho.create({
      data: { barbeariaId: b.id, barbeiroId: barbeiro.id, diaSemana: 3,
              minutosInicio: 9 * 60, minutosFim: 20 * 60 },
    });
  }
  return { b, corte, pezinho, teo, rael };
}

beforeEach(async () => { await limparBanco(); ctx = await montar(); });

describe('slotsDoDia', () => {
  it('usa a duração do barbeiro escolhido', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, ctx.rael.id, ctx.corte.id, DIA, localParaUtc(DIA, 0)));
    expect(s.every((x) => x.fim.getTime() - x.inicio.getTime() === 30 * 60_000)).toBe(true);
  });

  it('"qualquer" ignora quem não faz o serviço', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, 'qualquer', ctx.pezinho.id, DIA, localParaUtc(DIA, 0)));
    expect(new Set(s.map((x) => x.barbeiroId))).toEqual(new Set([ctx.teo.id]));
  });

  it('"qualquer" atribui ao de menor ordem quando os dois têm o horário', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, 'qualquer', ctx.corte.id, DIA, localParaUtc(DIA, 0)));
    expect(s.find((x) => formatarHora(x.inicio) === '09:00')!.barbeiroId).toBe(ctx.teo.id);
  });

  it('barbeiro que não oferece o serviço devolve vazio', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, ctx.rael.id, ctx.pezinho.id, DIA, localParaUtc(DIA, 0)));
    expect(s).toEqual([]);
  });
});
