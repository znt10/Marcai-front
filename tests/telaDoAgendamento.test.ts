import { describe, it, expect } from 'vitest';
import {
  estadoDaTela, formatarRelogio, linkDoZap, precisaConsultar, type DetalheDaTela,
} from '@/lib/telaDoAgendamento';

const AGORA = Date.parse('2026-10-21T15:00:00Z');
const em = (seg: number) => new Date(AGORA + seg * 1000).toISOString();
const pix = { copiaECola: '000201...', qrSvg: '<svg/>', valorCentavos: 3501 };
const base: DetalheDaTela = { status: 'CONFIRMADO', pix: null, expiraEm: null };

describe('estadoDaTela', () => {
  it('confirmado', () => {
    expect(estadoDaTela(base, AGORA).tipo).toBe('confirmado');
  });

  it('aguardando com os segundos que faltam', () => {
    const e = estadoDaTela({ status: 'AGUARDANDO_PAGAMENTO', pix, expiraEm: em(600) }, AGORA);
    expect(e).toMatchObject({ tipo: 'aguardando', segundosRestantes: 600, urgente: false });
  });

  it('fração de segundo conta para cima (não mostra 00:00 com tempo sobrando)', () => {
    const e = estadoDaTela({ status: 'AGUARDANDO_PAGAMENTO', pix, expiraEm: em(10.2) }, AGORA);
    expect(e).toMatchObject({ tipo: 'aguardando', segundosRestantes: 11 });
  });

  it('urgente nos últimos 5 minutos, inclusive os 300 s', () => {
    const d = (s: number): DetalheDaTela => ({ status: 'AGUARDANDO_PAGAMENTO', pix, expiraEm: em(s) });
    expect(estadoDaTela(d(301), AGORA)).toMatchObject({ urgente: false });
    expect(estadoDaTela(d(300), AGORA)).toMatchObject({ urgente: true });
    expect(estadoDaTela(d(1), AGORA)).toMatchObject({ urgente: true });
  });

  it('vence localmente quando o relógio zera, antes de a consulta voltar EXPIRADO', () => {
    const e = estadoDaTela({ status: 'AGUARDANDO_PAGAMENTO', pix, expiraEm: em(0) }, AGORA);
    expect(e).toEqual({ tipo: 'expirado', local: true });
    expect(estadoDaTela({ status: 'AGUARDANDO_PAGAMENTO', pix, expiraEm: em(-30) }, AGORA).tipo).toBe('expirado');
  });

  it('aguardando sem Pix (cobrança ainda não aberta) é "preparando", sem vencer sozinho', () => {
    expect(estadoDaTela({ status: 'AGUARDANDO_PAGAMENTO', pix: null, expiraEm: null }, AGORA).tipo).toBe('preparando');
  });

  it('expirado do servidor', () => {
    expect(estadoDaTela({ status: 'EXPIRADO', pix: null, expiraEm: null }, AGORA))
      .toEqual({ tipo: 'expirado', local: false });
  });

  it('cancelado, de qualquer origem', () => {
    for (const s of ['CANCELADO_CLIENTE', 'CANCELADO_BARBEIRO', 'CANCELADO_DONO'])
      expect(estadoDaTela({ status: s, pix: null, expiraEm: null }, AGORA).tipo).toBe('cancelado');
  });
});

describe('precisaConsultar', () => {
  it('só enquanto espera: aguardando, preparando e vencido só no relógio local', () => {
    expect(precisaConsultar({ tipo: 'aguardando', segundosRestantes: 5, urgente: true })).toBe(true);
    expect(precisaConsultar({ tipo: 'preparando' })).toBe(true);
    expect(precisaConsultar({ tipo: 'expirado', local: true })).toBe(true);
    expect(precisaConsultar({ tipo: 'expirado', local: false })).toBe(false);
    expect(precisaConsultar({ tipo: 'confirmado' })).toBe(false);
    expect(precisaConsultar({ tipo: 'cancelado' })).toBe(false);
  });
});

describe('formatarRelogio', () => {
  it('mm:ss', () => {
    expect(formatarRelogio(900)).toBe('15:00');
    expect(formatarRelogio(65)).toBe('01:05');
    expect(formatarRelogio(9)).toBe('00:09');
    expect(formatarRelogio(0)).toBe('00:00');
    expect(formatarRelogio(-4)).toBe('00:00');
  });
});

describe('linkDoZap', () => {
  it('põe o 55 e tira o que não é dígito', () => {
    expect(linkDoZap('11999998888')).toBe('https://wa.me/5511999998888');
    expect(linkDoZap('(11) 99999-8888')).toBe('https://wa.me/5511999998888');
  });
  it('sem número, sem link', () => {
    expect(linkDoZap('')).toBeNull();
  });
});
