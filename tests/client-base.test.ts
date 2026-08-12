import { describe, it, expect, afterEach, vi } from 'vitest';
import { baseDe } from '@/lib/api/client';

/// `NEXT_PUBLIC_API_URL` (via tests/env.ts) e' so a PORTA do Django agora —
/// a origem inteira vem do `location` da pagina em tempo de chamada. Por
/// isso todo teste aqui precisa simular um host, e nao pode mais comparar
/// contra uma origem fixa importada do ambiente.
function comHost(hostname: string): void {
  vi.stubGlobal('window', { location: { protocol: 'http:', hostname } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('baseDe', () => {
  it('com a lista vazia, tudo continua no Next', () => {
    comHost('brutus.localhost');
    expect(baseDe('/painel/agenda', [])).toBe('/api');
    expect(baseDe('/servicos', [])).toBe('/api');
  });

  it('prefixo migrado sai para o Django do MESMO host que serviu a pagina', () => {
    comHost('brutus.localhost');
    expect(baseDe('/painel/agenda', ['/painel'])).toBe('http://brutus.localhost:8000/api');
  });

  it('duas barbearias, duas origens — o host muda, a base muda junto', () => {
    // Esta e' a garantia que a fatia inteira depende: um NEXT_PUBLIC_API_URL
    // fixo so' poderia acertar UM tenant (provado contra o back de verdade:
    // "localhost" leva a 404 pra todo mundo, "brutus.localhost" fixo faz
    // dontony.localhost receber a barbearia errada com 200). baseDe() tem
    // que responder por host, nunca por uma constante gravada no build.
    comHost('brutus.localhost');
    const deBrutus = baseDe('/painel/agenda', ['/painel']);

    comHost('dontony.localhost');
    const deDontony = baseDe('/painel/agenda', ['/painel']);

    expect(deBrutus).not.toBe(deDontony);
    expect(deBrutus).toBe('http://brutus.localhost:8000/api');
    expect(deDontony).toBe('http://dontony.localhost:8000/api');
  });

  it('casa o prefixo exato, e nao por comeco de palavra', () => {
    // Sem esta regra, migrar '/painel' arrastaria junto um '/painelzinho'
    // que ninguem migrou — e o sintoma seria 404 numa rota que existe.
    comHost('brutus.localhost');
    expect(baseDe('/painelzinho', ['/painel'])).toBe('/api');
    expect(baseDe('/painel', ['/painel'])).toBe('http://brutus.localhost:8000/api');
  });

  it('nao casa por prefixo textual quando o segmento nao fecha', () => {
    // Mesma regra do caso acima, com um par que a tarefa pede para conferir
    // explicitamente: '/agendamentos' nao pode ser pego por '/agenda' migrado,
    // e uma rota que esta na lista continua casando os seus proprios
    // sub-caminhos.
    comHost('brutus.localhost');
    expect(baseDe('/agendamentos', ['/agenda'])).toBe('/api');
    expect(baseDe('/agenda/hoje', ['/agenda'])).toBe('http://brutus.localhost:8000/api');
  });

  it('sem window, avisa alto em vez de inventar um tenant', () => {
    // Nenhum chamador de hoje roda fora do navegador — todo consumidor de
    // `pedir` e' Client Component. Mas se algum dia um Server Component ou
    // Route Handler chamar uma rota migrada, o certo e' estourar aqui, nao
    // adivinhar uma barbearia a partir de um host que ele nao tem.
    expect(() => baseDe('/painel/agenda', ['/painel'])).toThrow();
  });
});
