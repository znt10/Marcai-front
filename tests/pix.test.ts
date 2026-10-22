import { describe, it, expect } from 'vitest';
import {
  rotuloDoPix, contaComoMarcado, contarMarcados, primeiroQueFalta, textoDaConfirmacaoRecebi,
  textoDaDevolucao, vaoLivreAntes, validarPixDoBarbeiro, corpoParaSalvar, TIPOS_DE_CHAVE, type BlocoPix,
} from '@/lib/pix';

const sp = (s: string) => s.replace(/ /g, ' ');
const aguardando: BlocoPix = { estado: 'aguardando', valorCentavos: 3501, expiraEm: '2026-10-21T17:32:00Z' };

describe('rotuloDoPix', () => {
  it('aguardando mostra valor e hora de vencer (São Paulo)', () => {
    expect(sp(rotuloDoPix(aguardando)!)).toBe('Esperando Pix · R$ 35,01 · vence 14:32');
  });
  it('aguardando sem cobrança aberta ainda não inventa valor', () => {
    expect(rotuloDoPix({ estado: 'aguardando', valorCentavos: null, expiraEm: null })).toBe('Esperando Pix');
  });
  it('expirado e pago', () => {
    expect(rotuloDoPix({ ...aguardando, estado: 'expirado' })).toBe('Pix vencido');
    expect(rotuloDoPix({ ...aguardando, estado: 'pago' })).toBe('Pago');
  });
  it('sem bloco, sem rótulo', () => {
    expect(rotuloDoPix(null)).toBeNull();
    expect(rotuloDoPix(undefined)).toBeNull();
  });
});

describe('marcados', () => {
  const itens = [
    { id: 'a', pix: null }, { id: 'b' }, { id: 'c', pix: aguardando },
    { id: 'd', pix: { ...aguardando, estado: 'expirado' as const } },
    { id: 'e', pix: { ...aguardando, estado: 'pago' as const } },
  ];
  it('aguardando e expirado não contam; pago e sem Pix contam', () => {
    expect(itens.filter(contaComoMarcado).map((i) => i.id)).toEqual(['a', 'b', 'e']);
    expect(contarMarcados(itens)).toBe(3);
  });
  it('o próximo ignora quem não conta', () => {
    expect(primeiroQueFalta(itens, (i) => i.id !== 'a')?.id).toBe('b');
    expect(primeiroQueFalta([itens[2], itens[3]], () => true)).toBeNull();
  });
});

describe('textos', () => {
  it('confirmação do recebi', () => {
    expect(sp(textoDaConfirmacaoRecebi(3501))).toBe('Confirmar que o Pix de R$ 35,01 caiu na sua conta?');
    expect(textoDaConfirmacaoRecebi(null)).toBe('Confirmar que o Pix caiu na sua conta?');
  });
  it('devolução só quando houve pagamento', () => {
    expect(sp(textoDaDevolucao(3501)!)).toBe(
      'Esse horário estava pago (R$ 35,01) — devolva o Pix pelo app do banco.');
    expect(textoDaDevolucao(null)).toBeNull();
    expect(textoDaDevolucao(undefined)).toBeNull();
    expect(textoDaDevolucao(0)).toBeNull();
  });
});

describe('formulário do Pix', () => {
  it('tem os cinco tipos', () => {
    expect(TIPOS_DE_CHAVE.map((t) => t.valor)).toEqual(['CPF', 'CNPJ', 'CELULAR', 'EMAIL', 'ALEATORIA']);
  });
  it('ligado exige tipo, chave e titular', () => {
    expect(validarPixDoBarbeiro({ cobra: true, tipo: '', chave: '', titular: '' })).toMatch(/tipo/i);
    expect(validarPixDoBarbeiro({ cobra: true, tipo: 'CPF', chave: ' ', titular: 'Ana' })).toMatch(/chave/i);
    expect(validarPixDoBarbeiro({ cobra: true, tipo: 'CPF', chave: '1', titular: ' ' })).toMatch(/titular/i);
    expect(validarPixDoBarbeiro({ cobra: true, tipo: 'CPF', chave: '1', titular: 'Ana' })).toBeNull();
  });
  it('chave sem tipo é sempre erro, mesmo desligado', () => {
    expect(validarPixDoBarbeiro({ cobra: false, tipo: '', chave: '123', titular: '' })).toMatch(/tipo/i);
    expect(validarPixDoBarbeiro({ cobra: false, tipo: '', chave: '', titular: '' })).toBeNull();
  });
  it('titular longo demais', () => {
    expect(validarPixDoBarbeiro({ cobra: false, tipo: 'CPF', chave: '1', titular: 'a'.repeat(61) })).toMatch(/60/);
  });
  it('corpo de salvar leva tudo com trim', () => {
    expect(corpoParaSalvar({ cobra: true, tipo: 'EMAIL', chave: ' a@b.c ', titular: ' Ana ' }))
      .toEqual({ cobraNoAgendamento: true, pixTipo: 'EMAIL', pixChave: 'a@b.c', pixTitular: 'Ana' });
  });
});

describe('vaoLivreAntes', () => {
  const min = (iso: string) => Number(iso.slice(0, 2)) * 60 + Number(iso.slice(3, 5));
  const item = (inicio: string, fim: string, pix?: BlocoPix) => ({ inicio, fim, pix });
  const expirado: BlocoPix = { estado: 'expirado', valorCentavos: 3501, expiraEm: null };

  it('pula o Pix vencido: 09:00 corte, 09:30 vencido, 10:00 corte = livre 30', () => {
    const itens = [item('09:00', '09:30'), item('09:30', '10:00', expirado), item('10:00', '10:30')];
    expect(vaoLivreAntes(itens, 2, min)).toBe(30);
  });
  it('aguardando ainda segura a vaga', () => {
    const itens = [item('09:00', '09:30'), item('09:30', '10:00', aguardando), item('10:00', '10:30')];
    expect(vaoLivreAntes(itens, 2, min)).toBe(0);
  });
  it('primeiro item não tem vão', () => {
    expect(vaoLivreAntes([item('09:00', '09:30')], 0, min)).toBe(0);
  });
});
