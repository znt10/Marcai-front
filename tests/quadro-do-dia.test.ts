import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { diaDeHoje, diaSemanaDe, localParaUtc, somarDias } from '@/lib/datas';
import { minutosCobertos, ocupacaoPct } from '@/lib/quadro';
import { GET as quadro } from '@/app/api/painel/dia/route';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
});

beforeEach(limparBanco);

type Ctx = Awaited<ReturnType<typeof montarCenarioBrutus>>;
type Coluna = {
  barbeiroId: string; barbeiroNome: string; papel: string; ativo: boolean;
  abre: number | null; fecha: number | null;
  ocupacaoPct: number | null;
  proximoLivre: string | null; servicoMaisCurto: string | null;
  itens: {
    tipo: 'AGENDAMENTO' | 'BLOQUEIO';
    id: string; inicio: string; fim: string;
    servicoNome?: string; clienteNome?: string; motivo?: string;
  }[];
};

const sessaoDe = (ctx: Ctx, quem: 'teo' | 'rael') =>
  emitirSessao({
    sub: ctx[quem].id, bid: ctx.barbearia.id,
    papel: quem === 'teo' ? 'DONO' : 'BARBEIRO', tv: 0,
  });

const pedido = (jwt: string, busca = '') =>
  new Request(`http://brutus.localhost/api/painel/dia${busca}`, {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

async function verQuadro(jwt: string, busca = '') {
  const res = await quadro(pedido(jwt, busca));
  expect(res.status).toBe(200);
  return (await res.json()) as { dia: string; colunas: Coluna[] };
}

/// Amanhã, e não hoje: o motor corta o que já passou, então um caso ancorado
/// em "hoje" passa de manhã e falha à noite.
const amanha = () => somarDias(diaDeHoje(new Date()), 1);

const coluna = (colunas: Coluna[], id: string) =>
  colunas.find((c) => c.barbeiroId === id)!;

/// Jornada só do dia pedido — o cenário abre os sete de 0h a 24h, o que é
/// ótimo para o motor e péssimo para conferir número de ocupação.
async function jornada(barbeiroId: string, dia: string, inicio: number, fim: number) {
  await prismaOwner.horarioTrabalho.updateMany({
    where: { barbeiroId, diaSemana: diaSemanaDe(dia) },
    data: { minutosInicio: inicio, minutosFim: fim },
  });
}

async function marcar(
  ctx: Ctx, barbeiroId: string, dia: string, minutos: number, duracaoMin: number,
) {
  const cliente = await prismaOwner.cliente.upsert({
    where: { barbeariaId_whatsapp: { barbeariaId: ctx.barbearia.id, whatsapp: '11977771234' } },
    create: { barbeariaId: ctx.barbearia.id, nome: 'Marcos', whatsapp: '11977771234' },
    update: {},
  });
  const inicio = localParaUtc(dia, minutos);
  return prismaOwner.agendamento.create({
    data: {
      barbeariaId: ctx.barbearia.id,
      codigo: Math.random().toString(36).slice(2, 12),
      barbeiroId, clienteId: cliente.id, servicoId: ctx.corte.id,
      servicoNome: 'Corte', inicio,
      fim: new Date(inicio.getTime() + duracaoMin * 60_000),
      duracaoMin, status: 'CONFIRMADO',
    },
  });
}

// ─── A aritmética, sem banco ──────────────────────────────────────────────

describe('minutosCobertos', () => {
  const emMinutos = (a: number, b: number) => ({
    inicio: new Date(a * 60_000), fim: new Date(b * 60_000),
  });
  const janela = emMinutos(0, 600);

  it('soma intervalos separados', () => {
    expect(minutosCobertos([emMinutos(0, 30), emMinutos(60, 90)], janela)).toBe(60);
  });

  it('não conta duas vezes o que se sobrepõe', () => {
    // Dois bloqueios encavalados descontariam o mesmo tempo duas vezes do
    // denominador, e a ocupação estouraria 100% sem motivo.
    expect(minutosCobertos([emMinutos(0, 60), emMinutos(30, 90)], janela)).toBe(90);
  });

  it('engole o intervalo contido em outro', () => {
    expect(minutosCobertos([emMinutos(0, 120), emMinutos(30, 60)], janela)).toBe(120);
  });

  it('recorta o que passa da janela', () => {
    expect(minutosCobertos([emMinutos(-60, 60)], janela)).toBe(60);
    expect(minutosCobertos([emMinutos(570, 900)], janela)).toBe(30);
  });

  it('ignora o que está inteiro fora', () => {
    expect(minutosCobertos([emMinutos(700, 800)], janela)).toBe(0);
  });
});

describe('ocupacaoPct', () => {
  const emMinutos = (a: number, b: number) => ({
    inicio: new Date(a * 60_000), fim: new Date(b * 60_000),
  });
  const janela = emMinutos(0, 240);

  it('jornada inteira bloqueada é 100% — não cabe mais ninguém', () => {
    expect(ocupacaoPct([], [emMinutos(0, 240)], janela)).toBe(100);
  });

  it('agendamento fora da jornada não estoura a conta', () => {
    // Acontece de verdade: encurtar o expediente deixa agendamento pendurado
    // do lado de fora (é o que a tela de conflitos lista).
    expect(ocupacaoPct([emMinutos(300, 400)], [], janela)).toBe(0);
  });
});

// ─── Quem vê quais colunas ────────────────────────────────────────────────

describe('alcance do quadro', () => {
  it('o dono recebe uma coluna por barbeiro, na ordem da equipe', async () => {
    const ctx = await montarCenarioBrutus();
    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${amanha()}`);

    expect(colunas.map((c) => c.barbeiroNome)).toEqual(['Téo', 'Rael']);
    expect(coluna(colunas, ctx.teo.id).papel).toBe('DONO');
  });

  it('o barbeiro recebe uma coluna — a dele — mesmo pedindo a do colega', async () => {
    const ctx = await montarCenarioBrutus();
    const { colunas } = await verQuadro(
      await sessaoDe(ctx, 'rael'), `?dia=${amanha()}&barbeiroId=${ctx.teo.id}`,
    );

    // Nem 404 nem a coluna do Téo: o filtro da sessão vence a query, como na
    // agenda. Pedir a do colega não é erro, é um parâmetro ignorado.
    expect(colunas).toHaveLength(1);
    expect(colunas[0].barbeiroId).toBe(ctx.rael.id);
  });

  it('sem sessão é 401', async () => {
    await montarCenarioBrutus();
    const res = await quadro(new Request('http://brutus.localhost/api/painel/dia', {
      headers: { 'x-barbearia-slug': 'brutus' },
    }));
    expect(res.status).toBe(401);
  });

  it('a barbearia vizinha não aparece no quadro', async () => {
    const ctx = await montarCenarioBrutus();
    const outra = await prismaOwner.barbearia.create({
      data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
              horarioResumo: 'ter a dom', whatsappContato: '11955554444' },
    });
    await prismaOwner.barbeiro.create({
      data: { barbeariaId: outra.id, nome: 'Tony', whatsapp: '11977778888', papel: 'DONO' },
    });

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${amanha()}`);
    expect(colunas.map((c) => c.barbeiroNome)).toEqual(['Téo', 'Rael']);
  });

  it('barbeiro inativo entra se tem agendamento no dia, e some se não tem', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    const igor = await prismaOwner.barbeiro.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Igor', whatsapp: '11966665555',
              ativo: false, desativadoEm: new Date(), ordem: 2 },
    });

    const semNada = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    expect(semNada.colunas.map((c) => c.barbeiroNome)).not.toContain('Igor');

    // Desativar exige agenda futura vazia, mas o passado continua lá: sem esta
    // coluna, o quadro de um dia antigo mostraria menos clientes do que o dia
    // realmente teve.
    await marcar(ctx, igor.id, dia, 600, 40);

    const comAgenda = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    const dele = coluna(comAgenda.colunas, igor.id);
    expect(dele.ativo).toBe(false);
    expect(dele.itens).toHaveLength(1);
  });
});

// ─── O que cada coluna carrega ────────────────────────────────────────────

describe('a coluna do dia', () => {
  it('dia sem jornada vem fechado — nulo em tudo, não zero', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await prismaOwner.horarioTrabalho.deleteMany({
      where: { barbeiroId: ctx.rael.id, diaSemana: diaSemanaDe(dia) },
    });

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    const dele = coluna(colunas, ctx.rael.id);

    // Zero por cento e fechado são estados diferentes: um é ruim, o outro é
    // sábado à noite.
    expect(dele.abre).toBeNull();
    expect(dele.fecha).toBeNull();
    expect(dele.ocupacaoPct).toBeNull();
    expect(dele.proximoLivre).toBeNull();
    expect(dele.itens).toHaveLength(0);
  });

  it('agendamento e bloqueio saem na mesma lista, em ordem de hora', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await jornada(ctx.teo.id, dia, 540, 1200);
    await marcar(ctx, ctx.teo.id, dia, 870, 40);          // 14:30
    await prismaOwner.bloqueio.create({
      data: { barbeariaId: ctx.barbearia.id, barbeiroId: ctx.teo.id,
              motivo: 'ALMOCO', repeteSemanalmente: true, diaSemana: diaSemanaDe(dia),
              minutosInicio: 720, minutosFim: 780 },                 // 12:00
    });

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    const dele = coluna(colunas, ctx.teo.id);

    expect(dele.itens.map((i) => i.tipo)).toEqual(['BLOQUEIO', 'AGENDAMENTO']);
    // O semanal chega traduzido em instante do dia pedido: a tela não vê
    // `minutosInicio` nem `repeteSemanalmente`.
    expect(dele.itens[0].inicio).toBe(localParaUtc(dia, 720).toISOString());
    expect(dele.itens[0].motivo).toBe('ALMOCO');
    expect(dele.itens[1].clienteNome).toBe('Marcos');
  });

  it('bloqueio de outro dia da semana não entra', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await prismaOwner.bloqueio.create({
      data: { barbeariaId: ctx.barbearia.id, barbeiroId: ctx.teo.id,
              motivo: 'FOLGA', repeteSemanalmente: true,
              diaSemana: (diaSemanaDe(dia) + 3) % 7,
              minutosInicio: 0, minutosFim: 24 * 60 },
    });

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    expect(coluna(colunas, ctx.teo.id).itens).toHaveLength(0);
  });

  it('bloqueio pontual de outra data não entra', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    const outroDia = somarDias(dia, 5);
    await prismaOwner.bloqueio.create({
      data: { barbeariaId: ctx.barbearia.id, barbeiroId: ctx.teo.id,
              motivo: 'PESSOAL', repeteSemanalmente: false,
              inicio: localParaUtc(outroDia, 600), fim: localParaUtc(outroDia, 720) },
    });

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    expect(coluna(colunas, ctx.teo.id).itens).toHaveLength(0);
  });
});

// ─── Os dois números do cabeçalho ─────────────────────────────────────────

describe('ocupação', () => {
  it('o almoço sai do denominador, não entra como ocupação', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await jornada(ctx.teo.id, dia, 540, 780);             // 9h–13h = 240 min
    await prismaOwner.bloqueio.create({
      data: { barbeariaId: ctx.barbearia.id, barbeiroId: ctx.teo.id,
              motivo: 'ALMOCO', repeteSemanalmente: true, diaSemana: diaSemanaDe(dia),
              minutosInicio: 720, minutosFim: 780 },       // 12h–13h = 60 min
    });
    await marcar(ctx, ctx.teo.id, dia, 600, 40);           // 10h, 40 min

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);

    // 40 / (240 − 60) = 22%. Com o almoço no denominador daria 17%, e um dia
    // genuinamente lotado nunca chegaria a 100%.
    expect(coluna(colunas, ctx.teo.id).ocupacaoPct).toBe(22);
  });

  it('jornada tomada inteira dá 100%', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await jornada(ctx.rael.id, dia, 540, 600);             // 9h–10h
    await marcar(ctx, ctx.rael.id, dia, 540, 60);

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'rael'), `?dia=${dia}`);
    expect(colunas[0].ocupacaoPct).toBe(100);

    // Cheio e quebrado são estados diferentes, e pedem ações opostas do dono:
    // aqui o serviço está marcado (manda para outro barbeiro), lá embaixo não
    // está (abre a tela de serviços). Um campo só colapsaria os dois.
    expect(colunas[0].proximoLivre).toBeNull();
    expect(colunas[0].servicoMaisCurto).toBe('Corte');
  });
});

describe('próximo horário livre', () => {
  it('pula o que está ocupado e o que está bloqueado', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await jornada(ctx.rael.id, dia, 540, 720);             // 9h–12h
    await prismaOwner.bloqueio.create({
      data: { barbeariaId: ctx.barbearia.id, barbeiroId: ctx.rael.id,
              motivo: 'OUTRO', repeteSemanalmente: false,
              inicio: localParaUtc(dia, 540), fim: localParaUtc(dia, 600) },
    });
    await marcar(ctx, ctx.rael.id, dia, 600, 30);          // 10h–10h30

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'rael'), `?dia=${dia}`);

    expect(colunas[0].proximoLivre).toBe(localParaUtc(dia, 630).toISOString());
    // O Rael só faz Corte: a menor duração dele é a do Corte.
    expect(colunas[0].servicoMaisCurto).toBe('Corte');
  });

  it('o horário vem com o serviço que o justifica — o mais curto que ele faz', async () => {
    const ctx = await montarCenarioBrutus();
    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${amanha()}`);

    // Téo faz Corte 40, Barba 30 e Pezinho 15. Prometer "livre" sem dizer que
    // só cabe o pezinho seria prometer o corte que não cabe.
    expect(coluna(colunas, ctx.teo.id).servicoMaisCurto).toBe('Pezinho');
  });

  it('barbeiro sem serviço marcado não tem próximo livre', async () => {
    const ctx = await montarCenarioBrutus();
    await prismaOwner.barbeiroServico.updateMany({
      where: { barbeiroId: ctx.rael.id }, data: { ativo: false },
    });

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'rael'), `?dia=${amanha()}`);
    expect(colunas[0].proximoLivre).toBeNull();
    expect(colunas[0].servicoMaisCurto).toBeNull();
  });

  it('não existe buraco ontem', async () => {
    const ctx = await montarCenarioBrutus();
    const ontem = somarDias(diaDeHoje(new Date()), -1);

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${ontem}`);
    expect(colunas.every((c) => c.proximoLivre === null)).toBe(true);
  });
});

// ─── A fronteira ──────────────────────────────────────────────────────────

describe('o quadro concorda com o motor', () => {
  it('o próximo livre do dono é um horário que a home também oferece', async () => {
    const ctx = await montarCenarioBrutus();
    const dia = amanha();
    await jornada(ctx.teo.id, dia, 540, 720);
    await marcar(ctx, ctx.teo.id, dia, 540, 40);

    const { colunas } = await verQuadro(await sessaoDe(ctx, 'teo'), `?dia=${dia}`);
    const dele = coluna(colunas, ctx.teo.id);

    const doCliente = await comBarbearia(ctx.barbearia.id, (tx) =>
      slotsDoDia(tx, ctx.barbearia.id, ctx.teo.id, ctx.pezinho.id, dia, new Date()));

    // Se os dois divergirem, o dono promete no balcão um horário que a tela do
    // cliente recusa — na frente do cliente.
    expect(doCliente.map((s) => s.inicio.toISOString())).toContain(dele.proximoLivre);
    expect(dele.proximoLivre).toBe(doCliente[0].inicio.toISOString());
  });
});
