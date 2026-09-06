import { describe, it, expect } from 'vitest';
import { linkDoGoogleAgenda, urlDoIcs } from '@/lib/calendario';

/// O `.ics` cobre iPhone e Android (o aparelho abre o calendario nativo); o
/// link do Google cobre quem usa Google Agenda no navegador. Nenhum dos dois
/// serve os dois casos — dai serem dois botoes.

describe('link do Google Agenda', () => {
  const base = {
    servicoNome: 'Corte', barbeiroNome: 'Nando',
    inicioIso: '2026-09-10T12:00:00.000Z', fimIso: '2026-09-10T12:30:00.000Z',
    endereco: 'Rua Aurora, 88',
  };

  it('leva titulo, intervalo e lugar', () => {
    const link = linkDoGoogleAgenda(base);
    expect(link.startsWith('https://calendar.google.com/calendar/render?')).toBe(true);
    expect(link).toContain('action=TEMPLATE');
    expect(link).toContain('dates=20260910T120000Z%2F20260910T123000Z');
  });

  it('a data sai em UTC com Z, e nao em hora local', () => {
    // Em UTC nao ha fuso para o Google interpretar errado — mesma razao do
    // `.ics`. Se isto virasse hora local sem fuso declarado, o evento cairia
    // tres horas fora para quem estivesse em Sao Paulo.
    expect(linkDoGoogleAgenda(base)).toContain('20260910T120000Z');
  });

  it('espaco e virgula sao escapados, senao a URL quebra', () => {
    const link = linkDoGoogleAgenda(base);
    expect(link).toContain('Rua+Aurora%2C+88');
    expect(link).toContain('Corte+com+Nando');
  });

  it('nome de servico com & nao engole o resto da URL', () => {
    // Sem escape, `details` comeria tudo depois do `&` como parametro novo.
    const link = linkDoGoogleAgenda({ ...base, servicoNome: 'Corte & barba' });
    expect(link).toContain('Corte+%26+barba');
    expect(link).toContain('location=');
  });
});

describe('url do .ics', () => {
  it('aponta para a rota do servidor, nao para um blob', () => {
    // O ponto INTEIRO: a versao anterior montava o arquivo num `Blob` com
    // `a.download`, e o Safari do iOS ignora `download` em URL `blob:` — no
    // iPhone o botao nao fazia nada.
    const url = urlDoIcs("http://brutus.localhost:8000", "abc123");
    expect(url).not.toContain('blob:');
    expect(url.endsWith('/agendamentos/abc123/ics')).toBe(true);
  });

  it('codigo com caractere estranho e escapado', () => {
    expect(urlDoIcs("http://x", "a/b")).toContain('a%2Fb');
  });
});
