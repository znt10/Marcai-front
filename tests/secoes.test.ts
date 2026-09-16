import { describe, it, expect } from 'vitest';
import { SECOES, rotuloDaSecao } from '@/components/painel/secoes';

describe('rotuloDaSecao', () => {
  it('na raiz do painel, é a agenda', () => {
    expect(rotuloDaSecao('/painel')).toBe('agenda');
  });

  it('acha a seção de dono pelo caminho', () => {
    expect(rotuloDaSecao('/painel/equipe')).toBe('equipe');
  });

  it('acha as seções de todo mundo pelo caminho', () => {
    expect(rotuloDaSecao('/painel/dia')).toBe('quadro');
    expect(rotuloDaSecao('/painel/horarios')).toBe('horários');
    expect(rotuloDaSecao('/painel/servicos')).toBe('serviços');
    expect(rotuloDaSecao('/painel/resumo')).toBe('resumo');
  });

  // `/painel/novo` existe e não é uma seção da lista: o botão é a única coisa
  // que diz onde você está no celular, e vazio ele viraria uma seta sozinha.
  it('numa rota fora da lista, dá um rótulo neutro em vez de vazio', () => {
    expect(rotuloDaSecao('/painel/novo')).toBe('painel');
  });

  // Um prefixo não basta: `/painel` é prefixo de tudo, e casar por prefixo
  // faria `/painel/novo` responder "agenda".
  it('não confunde uma subrota de seção com outra seção', () => {
    expect(rotuloDaSecao('/painel/equipe/123')).toBe('painel');
  });
});

describe('SECOES', () => {
  it('marca como de dono só equipe e resumo', () => {
    expect(SECOES.filter((s) => s.soDono).map((s) => s.href))
      .toEqual(['/painel/equipe', '/painel/resumo']);
  });
});
