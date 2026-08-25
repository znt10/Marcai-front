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

  it('ignora barra final na entrada do MIGRADAS', () => {
    // Item 1 do card da fatia 1. Uma entrada escrita '/barbeiros/' nao casaria
    // com o caminho '/barbeiros', e a rota cairia em '/api' — o Next. Enquanto
    // a rota ainda existe nos dois lados isso e' invisivel; no dia em que ela
    // sair do Next vira 404 mudo, longe da linha que causou.
    comHost('brutus.localhost');
    expect(baseDe('/barbeiros', ['/barbeiros/'])).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/barbeiros/9', ['/barbeiros/'])).toBe('http://brutus.localhost:8000/api');
    // E a normalizacao nao pode afrouxar o casamento por segmento.
    expect(baseDe('/barbeirosxyz', ['/barbeiros/'])).toBe('/api');
  });

  it('a lista de verdade tem /barbeiros e /auth e nao arrasta vizinho', () => {
    // Blindagem do interruptor: se alguem acrescentar uma entrada com barra,
    // este teste cai junto com o de cima.
    comHost('brutus.localhost');
    expect(baseDe('/barbeiros')).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/servicos')).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/horarios')).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/dias-com-vaga')).toBe('http://brutus.localhost:8000/api');
  });

  it('/servicos publico e /painel/servicos sao prefixos INDEPENDENTES', () => {
    // As duas rotas se chamam igual e fazem coisas diferentes: a publica
    // lista o que da para agendar, a do painel edita o cadastro. Migrar uma
    // nao arrasta a outra — cada linha do MIGRADAS casa por si.
    comHost('brutus.localhost');
    expect(baseDe('/servicos')).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/painel/servicos')).toBe('http://brutus.localhost:8000/api');
  });

  it('fatia 4: as dez entradas de /painel/* estao migradas, e so essas', () => {
    comHost('brutus.localhost');
    for (const rota of [
      '/painel/servicos', '/painel/servicos/abc',
      '/painel/barbeiro-servicos',
      '/painel/expediente',
      '/painel/bloqueios', '/painel/bloqueios/abc',
      '/painel/equipe', '/painel/equipe/abc', '/painel/equipe/abc/desativar',
      '/painel/equipe/abc/reativar', '/painel/equipe/abc/convite',
      '/painel/agenda',
      '/painel/dia',
      '/painel/conflitos',
      '/painel/agendamentos', '/painel/agendamentos/abc/cancelar',
      '/painel/barbearia',
    ]) {
      expect(baseDe(rota)).toBe('http://brutus.localhost:8000/api');
    }
  });

  it('/auth leva as quatro rotas de sessao para o Django', () => {
    // As quatro atravessam juntas porque o casamento e por prefixo. Se alguma
    // ficasse para tras, o cookie seria emitido de um lado e lido do outro —
    // o que so funciona enquanto os dois `.env` concordarem no segredo, e
    // falha calado no dia em que nao concordarem.
    comHost('brutus.localhost');
    for (const rota of ['/auth/login', '/auth/logout', '/auth/eu', '/auth/convite/abc']) {
      expect(baseDe(rota)).toBe('http://brutus.localhost:8000/api');
    }
  });

  it('/auth NAO arrasta o /admin/auth do painel da plataforma', () => {
    // O admin tem o proprio login, o proprio cookie e o proprio segredo. Ele
    // mora sob /admin, entao o prefixo /auth (sozinho, sem /admin na lista)
    // nao o alcanca — as duas rotas se chamam quase igual, e e' por isso que
    // convem um teste dizendo isso por si, isolado do estado real da lista.
    comHost('admin.localhost');
    expect(baseDe('/admin/auth/login', ['/auth'])).toBe('/api');
    expect(baseDe('/admin/auth/logout', ['/auth'])).toBe('/api');
  });

  it('fecha a travessia: /agendamentos publico esta migrado', () => {
    // '/agendamentos' e '/painel/agendamentos' se CHAMAM parecido mas sao
    // prefixos INDEPENDENTES — cada um casa por si, igual ao par
    // /servicos-/painel/servicos acima.
    comHost('brutus.localhost');
    for (const rota of ['/agendamentos', '/agendamentos/abc123', '/agendamentos/abc123/cancelar']) {
      expect(baseDe(rota)).toBe('http://brutus.localhost:8000/api');
    }
    expect(baseDe('/painel/agendamentos')).toBe('http://brutus.localhost:8000/api');
  });

  it('fecha a travessia: /admin esta migrado, as 5 rotas de uma vez', () => {
    // O front sempre fala com este prefixo a partir de admin.<dominio> — uma
    // entrada so cobre login, logout e as quatro de barbearias.
    comHost('admin.localhost');
    for (const rota of [
      '/admin/auth/login', '/admin/auth/logout',
      '/admin/barbearias', '/admin/barbearias/abc',
      '/admin/barbearias/abc/convite',
    ]) {
      expect(baseDe(rota)).toBe('http://admin.localhost:8000/api');
    }
  });

  it('depois da travessia, o Next nao serve mais rota de API nenhuma', () => {
    // cron/lembretes e' a unica excecao que nunca precisou de MIGRADAS: quem
    // chama e' o agendador (docker-compose), direto no Django, sem passar
    // pelo navegador — este teste documenta que nenhuma OUTRA rota ficou
    // para tras.
    comHost('brutus.localhost');
    expect(baseDe('/qualquer-coisa-nao-listada')).toBe('/api');
  });

  it('sem window, avisa alto em vez de inventar um tenant', () => {
    // Nenhum chamador de hoje roda fora do navegador — todo consumidor de
    // `pedir` e' Client Component. Mas se algum dia um Server Component ou
    // Route Handler chamar uma rota migrada, o certo e' estourar aqui, nao
    // adivinhar uma barbearia a partir de um host que ele nao tem.
    expect(() => baseDe('/painel/agenda', ['/painel'])).toThrow();
  });

  it('fatia 8: /barbearia publico e /painel/barbearia sao INDEPENDENTES', () => {
    // O mesmo par que /servicos e /painel/servicos formam: se chamam igual e
    // fazem coisas diferentes (a vitrine que qualquer um ve vs. o cadastro
    // que a equipe edita). O casamento e por segmento, entao cada entrada
    // casa por si — mas o nome parecido e' exatamente o que faz alguem
    // supor que uma cobre a outra.
    comHost('brutus.localhost');
    expect(baseDe('/barbearia')).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/painel/barbearia')).toBe('http://brutus.localhost:8000/api');
  });

  it('fatia 8: /barbearia nao e pego por /barbearias', () => {
    // '/admin/barbearias' (plural, sob /admin) e '/barbearia' (singular) sao
    // rotas distintas. Nenhuma das duas pode arrastar a outra.
    comHost('brutus.localhost');
    expect(baseDe('/barbearias', ['/barbearia'])).toBe('/api');
  });
});
