import { describe, it, expect } from 'vitest';
import { ehDono } from '@/lib/autorizacao';
import { podeDesativar, podeRebaixar } from '@/lib/equipe';

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
