import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from '@/lib/config';

async function cenario() {
  const barbearia = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const barbeiro = await prismaOwner.barbeiro.create({
    data: { barbeariaId: barbearia.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  const servico = await prismaOwner.servico.create({
    data: { barbeariaId: barbearia.id, nome: 'Corte',
            duracaoMinimaMin: 20, duracaoSugeridaMin: 40 },
  });
  const cliente = await prismaOwner.cliente.create({
    data: { barbeariaId: barbearia.id, nome: 'Marcos', whatsapp: '11977771234' },
  });
  return { barbearia, barbeiro, servico, cliente };
}

function dadosAgendamento(c: Awaited<ReturnType<typeof cenario>>, inicio: Date, duracaoMin: number) {
  return {
    barbeariaId: c.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
    barbeiroId: c.barbeiro.id, clienteId: c.cliente.id, servicoId: c.servico.id,
    servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + duracaoMin * 60_000),
    duracaoMin, status: 'CONFIRMADO' as const,
  };
}

beforeEach(limparBanco);

describe('CHECK de duração', () => {
  it('recusa duração abaixo do mínimo global', async () => {
    const c = await cenario();
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: c.servico.id, duracaoMin: DURACAO_MINIMA_MIN - 1 },
    })).rejects.toThrow();
  });

  it('recusa duração acima do máximo global', async () => {
    const c = await cenario();
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: c.servico.id, duracaoMin: DURACAO_MAXIMA_MIN + 1 },
    })).rejects.toThrow();
  });

  it('aceita exatamente o máximo', async () => {
    const c = await cenario();
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: c.servico.id, duracaoMin: DURACAO_MAXIMA_MIN },
    })).resolves.toBeTruthy();
  });

  it('aceita exatamente o mínimo', async () => {
    const c = await cenario();
    // Serviço diferente do de `cenario()`: @@id([barbeiroId, servicoId]) não
    // permite duas linhas de BarbeiroServico para o mesmo par.
    const servico2 = await prismaOwner.servico.create({
      data: { barbeariaId: c.barbearia.id, nome: 'Barba',
              duracaoMinimaMin: 10, duracaoSugeridaMin: 20 },
    });
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: servico2.id, duracaoMin: DURACAO_MINIMA_MIN },
    })).resolves.toBeTruthy();
  });
});

describe('CHECK de duração e coerência — Agendamento', () => {
  it('recusa fim incoerente com duracaoMin', async () => {
    const c = await cenario();
    const inicio = new Date('2026-08-05T19:00:00Z');
    await expect(prismaOwner.agendamento.create({
      data: {
        ...dadosAgendamento(c, inicio, 40),
        // duracaoMin diz 40, mas fim só reflete 20 — não deve ser aceito.
        fim: new Date(inicio.getTime() + 20 * 60_000),
      },
    })).rejects.toThrow();
  });

  it('recusa fim igual a inicio (duração zero)', async () => {
    const c = await cenario();
    const inicio = new Date('2026-08-05T19:00:00Z');
    await expect(prismaOwner.agendamento.create({
      data: {
        ...dadosAgendamento(c, inicio, DURACAO_MINIMA_MIN),
        fim: inicio,
      },
    })).rejects.toThrow();
  });

  it('recusa duracaoMin fora de 10..60 em Agendamento', async () => {
    const c = await cenario();
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), DURACAO_MINIMA_MIN - 1),
    })).rejects.toThrow();
  });

  it('aceita quando fim = inicio + duracaoMin dentro do intervalo (caminho feliz)', async () => {
    const c = await cenario();
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), DURACAO_MAXIMA_MIN),
    })).resolves.toBeTruthy();
  });
});

describe('CHECK de expediente', () => {
  it('recusa expediente que termina antes de começar', async () => {
    const c = await cenario();
    await expect(prismaOwner.horarioTrabalho.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              diaSemana: 3, minutosInicio: 1200, minutosFim: 540 },
    })).rejects.toThrow();
  });
});

describe('restrição de exclusão — sobreposição', () => {
  it('recusa sobreposição parcial: 16:00+40min colide com 16:30+30min', async () => {
    const c = await cenario();
    await prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    });
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:30:00Z'), 30),
    })).rejects.toThrow();
  });

  it('aceita encosto exato: 16:00+40min e 16:40+40min convivem', async () => {
    const c = await cenario();
    await prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    });
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:40:00Z'), 40),
    })).resolves.toBeTruthy();
  });

  it('libera o horário quando o agendamento é cancelado', async () => {
    const c = await cenario();
    const primeiro = await prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    });
    await prismaOwner.agendamento.update({
      where: { id: primeiro.id },
      data: { status: 'CANCELADO_CLIENTE', canceladoEm: new Date() },
    });
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    })).resolves.toBeTruthy();
  });
});

describe('CHECK de forma — Bloqueio', () => {
  it('aceita forma semanal válida', async () => {
    const c = await cenario();
    await expect(prismaOwner.bloqueio.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              motivo: 'ALMOCO', repeteSemanalmente: true,
              diaSemana: 2, minutosInicio: 720, minutosFim: 780 },
    })).resolves.toBeTruthy();
  });

  it('aceita forma pontual válida', async () => {
    const c = await cenario();
    await expect(prismaOwner.bloqueio.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              motivo: 'FOLGA', repeteSemanalmente: false,
              inicio: new Date('2026-08-10T12:00:00Z'),
              fim: new Date('2026-08-11T12:00:00Z') },
    })).resolves.toBeTruthy();
  });

  it('recusa estado misto: semanal com inicio preenchido', async () => {
    const c = await cenario();
    await expect(prismaOwner.bloqueio.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              motivo: 'OUTRO', repeteSemanalmente: true,
              diaSemana: 2, minutosInicio: 720, minutosFim: 780,
              inicio: new Date('2026-08-10T12:00:00Z') },
    })).rejects.toThrow();
  });

  it('recusa semanal invertido: minutosFim antes de minutosInicio', async () => {
    const c = await cenario();
    await expect(prismaOwner.bloqueio.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              motivo: 'PESSOAL', repeteSemanalmente: true,
              diaSemana: 2, minutosInicio: 1200, minutosFim: 540 },
    })).rejects.toThrow();
  });
});
