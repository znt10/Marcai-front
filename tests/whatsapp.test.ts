import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { numeroExiste, enviarTexto, _limparCaches } from '@/lib/whatsapp';

beforeEach(() => {
  _limparCaches();
  process.env.EVOLUTION_API_URL = 'http://evolution.teste';
  process.env.EVOLUTION_INSTANCE = 'brutus';
  process.env.EVOLUTION_API_KEY = 'chave';
});
afterEach(() => vi.restoreAllMocks());

describe('numeroExiste', () => {
  it('exists true → existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: true, jid: 'x' }],
    }));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('existe');
  });

  it('exists false → nao_existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: false }],
    }));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('nao_existe');
  });

  it('API fora do ar → indeterminado (nunca bloqueia)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('indeterminado');
  });

  it('sem EVOLUTION_API_URL → indeterminado, sem chamada de rede', async () => {
    process.env.EVOLUTION_API_URL = '';
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('indeterminado');
    expect(spy).not.toHaveBeenCalled();
  });

  it('segunda consulta do mesmo número usa cache', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ exists: true }] });
    vi.stubGlobal('fetch', spy);
    await numeroExiste('11977771234', '1.1.1.1');
    await numeroExiste('11977771234', '1.1.1.1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('estourado o limite por IP, devolve indeterminado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: true }],
    }));
    for (let i = 0; i < 10; i++) await numeroExiste(`1197777${1000 + i}`, '2.2.2.2');
    expect(await numeroExiste('11999990000', '2.2.2.2')).toBe('indeterminado');
  });
});

describe('enviarTexto', () => {
  it('não lança quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fora do ar')));
    await expect(enviarTexto('11977771234', 'oi')).resolves.toBeUndefined();
  });

  it('resposta recusada VAI para o log de erro', async () => {
    // Aconteceu de verdade: a instância caiu, a Evolution passou a devolver 400
    // com "sendMessage of undefined", e como ninguém conferia `r.ok` os convites
    // sumiram sem UMA linha de log. O único sintoma era o cliente não receber
    // nada — e "não tem erro no log" chegou a ser usado como prova de sucesso.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      text: async () => '{"message":"Cannot read properties of undefined (reading \'sendMessage\')"}',
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await enviarTexto('11977771234', 'oi');

    expect(log).toHaveBeenCalledOnce();
    const escrito = log.mock.calls[0].join(' ');
    expect(escrito).toContain('400');
    expect(escrito).toContain('11977771234');
    // O motivo importa: é o que separa "instância desconectada" de "chave
    // errada", e os consertos são completamente diferentes.
    expect(escrito).toContain('sendMessage');
  });

  it('resposta ok registra o envio com o jid resolvido, e sem o texto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { remoteJid: '558382217869@s.whatsapp.net' } }),
    }));
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await enviarTexto('83982217869', 'texto da conversa do cliente');

    expect(erro).not.toHaveBeenCalled();
    const escrito = info.mock.calls[0].join(' ');
    // Sem esta linha, "a mensagem saiu?" só era respondível por AUSÊNCIA de
    // erro — que é indistinguível de "o código nem rodou". As duas confundiram
    // um diagnóstico inteiro.
    expect(escrito).toContain('83982217869');
    // O jid é o que a Evolution resolveu de fato: aqui o nono dígito caiu, que
    // é o comportamento normal dos números brasileiros e assustou no caminho.
    expect(escrito).toContain('558382217869');
    // Conversa de cliente não vai para log.
    expect(escrito).not.toContain('texto da conversa');
  });

  it('sem a URL, cai no console.info e não faz rede', async () => {
    process.env.EVOLUTION_API_URL = '';
    const espiao = vi.fn();
    vi.stubGlobal('fetch', espiao);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await enviarTexto('11977771234', 'oi');
    expect(espiao).not.toHaveBeenCalled();
  });
});
