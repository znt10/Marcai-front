import { describe, it, expect } from 'vitest';
import { urlAgendar, urlCalendario } from '@/lib/escolha';

describe('urlAgendar', () => {
  it('sem escolha nenhuma, volta a URL limpa', () => {
    expect(urlAgendar({})).toBe('/agendar');
  });

  it('leva barbeiro e serviço', () => {
    expect(urlAgendar({ barbeiroId: 'b1', servicoId: 's1' }))
      .toBe('/agendar?barbeiroId=b1&servicoId=s1');
  });

  it('leva o horário escolhido, escapado', () => {
    expect(urlAgendar({ barbeiroId: 'b1', servicoId: 's1', inicio: '2026-09-02T14:00:00-03:00' }))
      .toBe('/agendar?barbeiroId=b1&servicoId=s1&inicio=2026-09-02T14%3A00%3A00-03%3A00');
  });

  it('descarta o que está vazio ou ausente', () => {
    expect(urlAgendar({ barbeiroId: 'b1', servicoId: '', inicio: undefined }))
      .toBe('/agendar?barbeiroId=b1');
  });

  it('mantém a ordem barbeiro, serviço, horário mesmo fora de ordem', () => {
    expect(urlAgendar({ inicio: 'i', servicoId: 's1', barbeiroId: 'b1' }))
      .toBe('/agendar?barbeiroId=b1&servicoId=s1&inicio=i');
  });
});

describe('urlCalendario', () => {
  it('leva a escolha inteira para o calendário', () => {
    expect(urlCalendario({ barbeiroId: 'b1', servicoId: 's1', inicio: 'i' }))
      .toBe('/calendario?barbeiroId=b1&servicoId=s1&inicio=i');
  });

  it('sem horário escolhido, não inventa parâmetro', () => {
    expect(urlCalendario({ barbeiroId: 'b1', servicoId: 's1' }))
      .toBe('/calendario?barbeiroId=b1&servicoId=s1');
  });
});
