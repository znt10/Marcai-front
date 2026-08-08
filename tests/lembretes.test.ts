import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus, agendamentoDaqui } from './cenarios';
import { POST as cron } from '@/app/api/cron/lembretes/route';
import { POST as agendar } from '@/app/api/agendamentos/route';
import { comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { diaDeHoje, somarDias } from '@/lib/datas';
import { LEMBRETE_ANTECEDENCIA_MIN } from '@/lib/config';
import { lembreteAoCriar } from '@/lib/lembrete';

const SEGREDO = 'segredo-do-cron';

beforeEach(async () => {
  await limparBanco();
  process.env.CRON_SECRET = SEGREDO;
  // Com a URL preenchida, `enviarTexto` chama `fetch` — é assim que os casos
  // conferem a MENSAGEM, e não só a coluna do banco.
  process.env.EVOLUTION_API_URL = 'http://evolution.teste';
  process.env.EVOLUTION_INSTANCE = 'brutus';
});
afterEach(() => vi.restoreAllMocks());

/// As chamadas de envio que o cron disparou, já desembrulhadas.
function espionarEnvios() {
  const espiao = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', espiao);
  return () => espiao.mock.calls
    .filter(([url]) => String(url).includes('/message/sendText/'))
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as
      { number: string; text: string });
}

const pedido = (autorizacao?: string) =>
  new Request('http://brutus.localhost/api/cron/lembretes', {
    method: 'POST',
    headers: autorizacao ? { authorization: autorizacao } : {},
  });

const rodar = async (autorizacao = `Bearer ${SEGREDO}`) => cron(pedido(autorizacao));

// ─── A porta ──────────────────────────────────────────────────────────────

describe('quem pode disparar o cron', () => {
  it('segredo certo passa', async () => {
    espionarEnvios();
    expect((await rodar()).status).toBe(200);
  });

  it('segredo errado é 401', async () => {
    expect((await rodar('Bearer outro')).status).toBe(401);
  });

  it('sem cabeçalho é 401', async () => {
    expect((await cron(pedido())).status).toBe(401);
  });

  it('CRON_SECRET vazio nega TUDO, inclusive o cabeçalho vazio', async () => {
    process.env.CRON_SECRET = '';
    // Sem segredo configurado a rota fica fechada, em vez de virar um
    // disparador público de mensagens para a base inteira de clientes.
    expect((await rodar('Bearer ')).status).toBe(401);
    expect((await cron(pedido())).status).toBe(401);
  });
});

// ─── A janela ─────────────────────────────────────────────────────────────

describe('quem recebe lembrete', () => {
  it('agendamento dentro da janela recebe, e a coluna fica marcada', async () => {
    await montarCenarioBrutus();
    const ag = await agendamentoDaqui(30);
    const envios = espionarEnvios();

    const corpo = await (await rodar()).json();
    expect(corpo.enviados).toBe(1);

    const mensagens = envios();
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0].number).toBe('5511977771234');
    expect(mensagens[0].text).toContain('Lembrete');

    const depois = await prismaOwner.agendamento.findUniqueOrThrow({ where: { id: ag.id } });
    expect(depois.lembreteEnviadoEm).not.toBeNull();
  });

  it('agendamento fora da janela não recebe', async () => {
    await montarCenarioBrutus();
    await agendamentoDaqui(LEMBRETE_ANTECEDENCIA_MIN + 120);
    const envios = espionarEnvios();

    expect((await (await rodar()).json()).enviados).toBe(0);
    expect(envios()).toHaveLength(0);
  });

  it('agendamento que já começou não recebe', async () => {
    await montarCenarioBrutus();
    await agendamentoDaqui(-30);
    const envios = espionarEnvios();

    // Lembrar depois da hora é pior que não lembrar: a mensagem chega para
    // quem já perdeu, ou já está na cadeira.
    expect((await (await rodar()).json()).enviados).toBe(0);
    expect(envios()).toHaveLength(0);
  });

  it('agendamento cancelado não recebe', async () => {
    await montarCenarioBrutus();
    const ag = await agendamentoDaqui(30);
    await prismaOwner.agendamento.update({
      where: { id: ag.id }, data: { status: 'CANCELADO_CLIENTE' },
    });
    const envios = espionarEnvios();

    expect((await (await rodar()).json()).enviados).toBe(0);
    expect(envios()).toHaveLength(0);
  });

  it('rodar duas vezes seguidas manda UMA mensagem', async () => {
    await montarCenarioBrutus();
    await agendamentoDaqui(30);
    const envios = espionarEnvios();

    await rodar();
    await rodar();

    // O cron marca ANTES de enviar justamente para isto: agendador que
    // dispara duas vezes (reinício, tique atrasado) não vira duas mensagens.
    expect(envios()).toHaveLength(1);
  });

  it('barbearia desativada não manda nada', async () => {
    const ctx = await montarCenarioBrutus();
    await agendamentoDaqui(30);
    await prismaOwner.barbearia.update({
      where: { id: ctx.barbearia.id }, data: { ativo: false },
    });
    const envios = espionarEnvios();

    expect((await (await rodar()).json()).enviados).toBe(0);
    expect(envios()).toHaveLength(0);
  });
});

// ─── Mais de um tenant na mesma passada ───────────────────────────────────

describe('o cron atravessa barbearias de propósito', () => {
  it('as duas são atendidas, cada uma com o próprio endereço', async () => {
    const ctx = await montarCenarioBrutus();
    await agendamentoDaqui(30);

    const outra = await prismaOwner.barbearia.create({
      data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
              horarioResumo: 'ter a dom', whatsappContato: '11955554444' },
    });
    const tony = await prismaOwner.barbeiro.create({
      data: { barbeariaId: outra.id, nome: 'Tony', whatsapp: '11977778888', papel: 'DONO' },
    });
    const cliente = await prismaOwner.cliente.create({
      data: { barbeariaId: outra.id, nome: 'Jorge', whatsapp: '11966660000' },
    });
    const servico = await prismaOwner.servico.create({
      data: { barbeariaId: outra.id, nome: 'Corte',
              duracaoMinimaMin: 20, duracaoSugeridaMin: 40, ordem: 0 },
    });
    const inicio = new Date(Date.now() + 20 * 60_000);
    await prismaOwner.agendamento.create({
      data: {
        barbeariaId: outra.id, codigo: 'dontony123',
        barbeiroId: tony.id, clienteId: cliente.id, servicoId: servico.id,
        servicoNome: 'Corte', inicio,
        fim: new Date(inicio.getTime() + 40 * 60_000),
        duracaoMin: 40, status: 'CONFIRMADO',
      },
    });

    const envios = espionarEnvios();
    expect((await (await rodar()).json()).enviados).toBe(2);

    const mensagens = envios();
    // Cada mensagem leva o endereço da SUA barbearia: é o teste que pega o
    // dia em que alguém carregar a barbearia fora do laço.
    expect(mensagens.find((m) => m.number === '5511977771234')!.text)
      .toContain(ctx.barbearia.endereco);
    expect(mensagens.find((m) => m.number === '5511966660000')!.text)
      .toContain('Av. Central, 12');
  });
});

// ─── A confirmação já é o lembrete ────────────────────────────────────────

describe('lembreteAoCriar', () => {
  const agora = new Date('2026-08-08T12:00:00Z');
  const daqui = (min: number) => new Date(agora.getTime() + min * 60_000);

  it('dentro da janela devolve o instante — já avisado', () => {
    expect(lembreteAoCriar(daqui(30), agora)).toEqual(agora);
  });

  it('na borda da janela ainda conta como avisado', () => {
    expect(lembreteAoCriar(daqui(LEMBRETE_ANTECEDENCIA_MIN), agora)).toEqual(agora);
  });

  it('fora da janela devolve null — o cron cuida', () => {
    expect(lembreteAoCriar(daqui(LEMBRETE_ANTECEDENCIA_MIN + 1), agora)).toBeNull();
  });
});

describe('quem acabou de marcar não recebe lembrete', () => {
  type Ctx = Awaited<ReturnType<typeof montarCenarioBrutus>>;

  /// Horários livres de verdade — vindos do motor, não inventados: a rota
  /// recusa o que não está na grade.
  ///
  /// Hoje E amanhã, sempre. Só hoje daria um caso que passa em silêncio: às
  /// 23h20 não sobra slot de 40 min antes da meia-noite, o `find` volta vazio
  /// e o teste não prova nada. Com os dois dias, o slot da janela existe em
  /// qualquer hora do relógio — no pior caso é a meia-noite de amanhã.
  async function livresDe(ctx: Ctx, dias: string[]) {
    const agora = new Date();
    const listas = await Promise.all(dias.map((dia) =>
      comBarbearia(ctx.barbearia.id, (tx) =>
        slotsDoDia(tx, ctx.barbearia.id, ctx.teo.id, ctx.corte.id, dia, agora))));
    return listas.flat().sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  const doisDias = () => {
    const hoje = diaDeHoje(new Date());
    return [hoje, somarDias(hoje, 1)];
  };

  async function marcar(ctx: Ctx, inicio: Date) {
    // Sem a URL da Evolution, criar não faz rede nenhuma: estes casos são
    // sobre a coluna, e o envio da confirmação não interessa.
    process.env.EVOLUTION_API_URL = '';
    const r = await agendar(new Request('http://brutus.localhost/api/agendamentos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-barbearia-slug': 'brutus' },
      body: JSON.stringify({
        barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
        inicio: inicio.toISOString(), nome: 'Marcos', whatsapp: '11977771234',
      }),
    }));
    expect(r.status).toBe(201);
    return prismaOwner.agendamento.findFirstOrThrow({
      where: { codigo: (await r.json()).codigo },
    });
  }

  it('marcar dentro da janela nasce avisado, e o cron seguinte cala', async () => {
    const ctx = await montarCenarioBrutus();
    const teto = Date.now() + LEMBRETE_ANTECEDENCIA_MIN * 60_000;
    const dentro = (await livresDe(ctx, doisDias())).find((s) => s.inicio.getTime() <= teto);
    expect(dentro, 'sempre há slot na próxima hora com expediente de 0h a 24h').toBeDefined();

    const criado = await marcar(ctx, dentro!.inicio);

    // A confirmação que ele acabou de receber É o lembrete. Sem isto, o
    // cliente lê "Fechou, Marcos!" e, minutos depois, um "Lembrete:" do que
    // ele fez agora — e o painel marca a 30 min por padrão, então isso
    // aconteceria com todo encaixe de balcão.
    expect(criado.lembreteEnviadoEm).not.toBeNull();

    process.env.EVOLUTION_API_URL = 'http://evolution.teste';
    const envios = espionarEnvios();
    expect((await (await rodar()).json()).enviados).toBe(0);
    expect(envios()).toHaveLength(0);
  });

  it('marcar fora da janela nasce sem aviso — o cron ainda tem trabalho', async () => {
    const ctx = await montarCenarioBrutus();
    const teto = Date.now() + LEMBRETE_ANTECEDENCIA_MIN * 60_000;
    const longe = (await livresDe(ctx, doisDias())).find((s) => s.inicio.getTime() > teto);
    expect(longe, 'dois dias de expediente aberto sempre passam da janela').toBeDefined();

    const criado = await marcar(ctx, longe!.inicio);
    expect(criado.lembreteEnviadoEm).toBeNull();
  });
});
