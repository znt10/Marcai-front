import { describe, it, expect } from 'vitest';
import {
  separarHistorico, codigoValido, camposDoAgendar, SENHA_MINIMA_CONTA, type ItemHistorico,
} from '@/lib/conta';

function item(codigo: string, inicio: string, status = 'CONFIRMADO'): ItemHistorico {
  return {
    codigo, servicoNome: 'Corte', barbeiroNome: 'Brutus',
    inicio, status, podeCancelar: false,
  };
}

const agora = new Date('2026-10-20T12:00:00Z');

describe('separarHistorico', () => {
  it('próximos em ordem crescente, passados em ordem decrescente', () => {
    const r = separarHistorico([
      item('f2', '2026-10-25T10:00:00Z'),
      item('p1', '2026-10-01T10:00:00Z'),
      item('f1', '2026-10-21T10:00:00Z'),
      item('p2', '2026-10-10T10:00:00Z'),
    ], agora);
    expect(r.proximos.map((i) => i.codigo)).toEqual(['f1', 'f2']);
    expect(r.passados.map((i) => i.codigo)).toEqual(['p2', 'p1']);
  });

  it('cancelado no futuro vai para os passados', () => {
    const r = separarHistorico([
      item('c', '2026-10-30T10:00:00Z', 'CANCELADO_CLIENTE'),
      item('f', '2026-10-22T10:00:00Z'),
    ], agora);
    expect(r.proximos.map((i) => i.codigo)).toEqual(['f']);
    expect(r.passados.map((i) => i.codigo)).toEqual(['c']);
  });

  it('o instante exato de agora ainda é próximo', () => {
    const r = separarHistorico([item('x', agora.toISOString())], agora);
    expect(r.proximos).toHaveLength(1);
  });

  it('não muda a lista de entrada', () => {
    const entrada = [item('b', '2026-10-25T10:00:00Z'), item('a', '2026-10-22T10:00:00Z')];
    separarHistorico(entrada, agora);
    expect(entrada.map((i) => i.codigo)).toEqual(['b', 'a']);
  });
});

describe('codigoValido', () => {
  it('só seis dígitos', () => {
    expect(codigoValido('123456')).toBe(true);
    expect(codigoValido('12345')).toBe(false);
    expect(codigoValido('1234567')).toBe(false);
    expect(codigoValido('12345a')).toBe(false);
    expect(codigoValido('123 56')).toBe(false);
    expect(codigoValido('')).toBe(false);
    expect(codigoValido('123456\n')).toBe(false);
  });
});

it('senha mínima é 6', () => {
  expect(SENHA_MINIMA_CONTA).toBe(6);
});

describe('inicialDoNome e rotuloDoHorario', () => {
  it('pega a inicial maiúscula e tolera vazio', async () => {
    const { inicialDoNome } = await import('@/lib/conta');
    expect(inicialDoNome('  joão silva')).toBe('J');
    expect(inicialDoNome('')).toBe('?');
  });
  it('formata no fuso do Brasil', async () => {
    const { rotuloDoHorario } = await import('@/lib/conta');
    // 17:30Z = 14:30 em São Paulo; 24/10/2026 é sábado.
    expect(rotuloDoHorario('2026-10-24T17:30:00Z')).toMatch(/^sáb,? 24\/10 às 14:30$/);
  });
});

describe('camposDoAgendar', () => {
  const conta = { nome: 'Ana Souza', whatsapp: '(83) 9 8221-7869' };
  it('deslogada, vale o rascunho e o campo fica livre', () => {
    expect(camposDoAgendar(null, { nome: 'Zé', whats: '8399' }))
      .toEqual({ nome: 'Zé', whats: '8399', travado: false });
  });
  it('logada, o whats é o da conta e ignora o do rascunho', () => {
    const r = camposDoAgendar(conta, { nome: '', whats: '11999990000' });
    expect(r).toEqual({ nome: 'Ana Souza', whats: '(83) 9 8221-7869', travado: true });
  });
  it('logada, o nome editado no rascunho é mantido', () => {
    expect(camposDoAgendar(conta, { nome: 'Aninha', whats: '' }).nome).toBe('Aninha');
  });
});

describe('rotuloDoStatus', () => {
  it('rotula os dois cancelamentos do back como Cancelado', async () => {
    const { rotuloDoStatus } = await import('@/lib/conta');
    expect(rotuloDoStatus('CANCELADO_CLIENTE')).toBe('Cancelado');
    expect(rotuloDoStatus('CANCELADO_BARBEIRO')).toBe('Cancelado');
  });
  it('não diz nada de CONFIRMADO (no passado, simplesmente aconteceu)', async () => {
    const { rotuloDoStatus } = await import('@/lib/conta');
    expect(rotuloDoStatus('CONFIRMADO')).toBeNull();
  });
  it('rotula os dois estados do Pix no agendamento', async () => {
    const { rotuloDoStatus } = await import('@/lib/conta');
    expect(rotuloDoStatus('AGUARDANDO_PAGAMENTO')).toBe('Aguardando o Pix');
    expect(rotuloDoStatus('EXPIRADO')).toBe('Prazo do Pix acabou');
  });
});
