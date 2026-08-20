import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

/// O Host que o Django REALMENTE recebeu na última chamada.
let hostRecebido: string | undefined;
let servidor: Server;

const hostDaRequisicao = vi.fn(() => 'brutus.localhost');

// `barbeariaAtual` lê o Host do contexto assíncrono do Next, que não existe
// fora de uma requisição. Aqui ele é só o valor que queremos ver chegar do
// outro lado.
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'host' ? hostDaRequisicao() : null) }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

beforeAll(async () => {
  servidor = createServer((req, res) => {
    hostRecebido = req.headers.host;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        nome: 'Brutus',
        endereco: 'Rua Aurora, 88',
        horarioResumo: null,
        whatsappContato: '11999998888',
      }),
    );
  });
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  process.env.API_URL_INTERNA = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

/// O Host é a ÚNICA coisa que diz ao Django qual barbearia é. Se ele não
/// chegar, o Django responde 400 por ALLOWED_HOSTS e o front, que só olha se
/// a resposta foi ok, mostra 404 — sem erro, sem log, sem pista. Foi
/// exatamente isso que aconteceu: `fetch` descarta `host` em silêncio, porque
/// é cabeçalho proibido pelo spec, e a home inteira ficou 404.
///
/// O teste é este e não outro de propósito: não adianta afirmar que o código
/// PASSA `host` no objeto de headers — a versão quebrada passava. O que
/// importa é o que sai no fio, então quem responde aqui é um servidor HTTP de
/// verdade, que lê o cabeçalho como o Django leria.
describe('o Host viaja até o Django', () => {
  it('chega o host da requisição, não o da URL interna', async () => {
    const { barbeariaAtual } = await import('@/lib/tenant');
    const b = await barbeariaAtual();

    expect(hostRecebido).toBe('brutus.localhost');
    expect(hostRecebido).not.toMatch(/^127\.0\.0\.1/);
    expect(b.nome).toBe('Brutus');
  });
});
