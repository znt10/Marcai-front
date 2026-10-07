import { describe, it, expect, beforeEach } from 'vitest';
import {
  proximoPasso, dadosCompletos, guiaJaVisto, marcarGuiaVisto, mostraDicaDoCalendario, digitando,
  type EstadoDoForm,
} from '@/lib/guia';

/// O guia da primeira vez na tela de agendar: um balão em cima do passo que
/// falta. Ele SEGUE o estado do formulário, e não uma ordem fixa — quem volta
/// e troca o barbeiro vê o balão voltar junto.

const VAZIO: EstadoDoForm = {
  barbeiroId: '', servicoId: '', temHorario: false, diaSemVaga: false, algumDiaComVaga: true,
  nome: '', whats: '',
};

describe('proximoPasso', () => {
  it('começa no barbeiro', () => {
    expect(proximoPasso(VAZIO)).toBe('barbeiro');
  });

  it('desce para o serviço, o horário, os dados e o botão', () => {
    const comBarbeiro = { ...VAZIO, barbeiroId: 'b' };
    expect(proximoPasso(comBarbeiro)).toBe('servico');

    const comServico = { ...comBarbeiro, servicoId: 's' };
    expect(proximoPasso(comServico)).toBe('horario');

    const comHorario = { ...comServico, temHorario: true };
    expect(proximoPasso(comHorario)).toBe('dados');

    expect(proximoPasso({ ...comHorario, nome: 'Maria', whats: '(83) 9 8801-0990' }))
      .toBe('confirmar');
  });

  it('dia sem vaga manda tocar em outro dia', () => {
    expect(proximoPasso({ ...VAZIO, barbeiroId: 'b', servicoId: 's', diaSemVaga: true }))
      .toBe('outro-dia');
  });

  it('todos os dias da tela cheios: o balão vai para o calendário', () => {
    // Sábado à noite, domingo fechado: tocar no outro botão só mostra outro
    // dia vazio. A saída é o calendário.
    expect(proximoPasso({
      ...VAZIO, barbeiroId: 'b', servicoId: 's', diaSemVaga: true, algumDiaComVaga: false,
    })).toBe('calendario');
  });

  it('com o horário na mão, o dia cheio que está à vista não importa', () => {
    expect(proximoPasso({
      ...VAZIO, barbeiroId: 'b', servicoId: 's', temHorario: true, diaSemVaga: true,
    })).toBe('dados');
  });

  it('volta para o serviço quando trocar o barbeiro apaga o serviço', () => {
    // O formulário zera serviço e horário ao trocar de barbeiro; nome e
    // telefone ficam. O balão tem que voltar, não ficar no botão.
    expect(proximoPasso({ ...VAZIO, barbeiroId: 'outro', nome: 'Maria', whats: '83988010990' }))
      .toBe('servico');
  });

  it('nome e WhatsApp são UM passo: o balão não pula no meio da digitação', () => {
    const base = { ...VAZIO, barbeiroId: 'b', servicoId: 's', temHorario: true };
    expect(proximoPasso({ ...base, nome: 'M' })).toBe('dados');
    expect(proximoPasso({ ...base, nome: 'Maria' })).toBe('dados');
    expect(proximoPasso({ ...base, nome: 'Maria', whats: '8398801' })).toBe('dados');
  });
});

describe('mostraDicaDoCalendario', () => {
  it('acompanha o balão enquanto falta o horário', () => {
    expect(mostraDicaDoCalendario('horario')).toBe(true);
    expect(mostraDicaDoCalendario('outro-dia')).toBe(true);
  });

  it('some quando o balão já está no calendário, depois do horário, e sem guia', () => {
    for (const p of ['barbeiro', 'servico', 'calendario', 'dados', 'confirmar', null] as const) {
      expect(mostraDicaDoCalendario(p)).toBe(false);
    }
  });
});

describe('digitando', () => {
  it('campo em foco segura a rolagem do balão', () => {
    expect(digitando({ tagName: 'INPUT' })).toBe(true);
    expect(digitando({ tagName: 'TEXTAREA' })).toBe(true);
  });

  it('botão em foco, ou nada em foco, deixa rolar', () => {
    expect(digitando({ tagName: 'BUTTON' })).toBe(false);
    expect(digitando({ tagName: 'BODY' })).toBe(false);
    expect(digitando(null)).toBe(false);
  });
});

describe('dadosCompletos', () => {
  it('é a mesma regra do botão Confirmar', () => {
    expect(dadosCompletos('Maria', '(83) 9 8801-0990')).toBe(true);
    expect(dadosCompletos('M ', '(83) 9 8801-0990')).toBe(false);
    expect(dadosCompletos('Maria', '(83) 9 8801')).toBe(false);
    expect(dadosCompletos('Maria', '8388010990')).toBe(true);
  });
});

/// Mesmo dublê de `rascunho.test.ts`: a suíte roda em `node`, sem DOM.
class Armazem {
  mapa = new Map<string, string>();
  lanca = false;
  private confere() { if (this.lanca) throw new Error('acesso negado ao armazenamento'); }
  getItem(k: string) { this.confere(); return this.mapa.get(k) ?? null; }
  setItem(k: string, v: string) { this.confere(); this.mapa.set(k, v); }
  removeItem(k: string) { this.confere(); this.mapa.delete(k); }
}

let armazem: Armazem;
beforeEach(() => {
  armazem = new Armazem();
  (globalThis as { localStorage?: unknown }).localStorage = armazem;
});

describe('primeira vez', () => {
  it('quem nunca viu, vê', () => {
    expect(guiaJaVisto()).toBe(false);
  });

  it('marcado uma vez, não volta mais naquele aparelho', () => {
    marcarGuiaVisto();
    expect(guiaJaVisto()).toBe(true);
  });

  it('armazenamento bloqueado: o guia aparece, e marcar não quebra a tela', () => {
    armazem.lanca = true;
    expect(guiaJaVisto()).toBe(false);
    expect(() => marcarGuiaVisto()).not.toThrow();
  });
});
