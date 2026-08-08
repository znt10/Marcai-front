import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaOwner, prismaApp, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { diaDeHoje, diaSemanaDe } from '@/lib/datas';
import { GET as verServicos, POST as criarServico } from '@/app/api/painel/servicos/route';
import { PATCH as editarServico } from '@/app/api/painel/servicos/[id]/route';
import { PUT as vincular, GET as verVinculos } from '@/app/api/painel/barbeiro-servicos/route';
import { PATCH as editarBarbearia } from '@/app/api/painel/barbearia/route';
import { GET as barbeirosPublicos } from '@/app/api/barbeiros/route';
import { PUT as definirDia } from '@/app/api/painel/expediente/route';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
});

beforeEach(limparBanco);

type Ctx = Awaited<ReturnType<typeof montarCenarioBrutus>>;

const sessaoDe = (ctx: Ctx, quem: 'teo' | 'rael') =>
  emitirSessao({
    sub: ctx[quem].id, bid: ctx.barbearia.id,
    papel: quem === 'teo' ? 'DONO' : 'BARBEIRO', tv: 0,
  });

const get = (jwt: string, caminho: string) =>
  new Request(`http://brutus.localhost${caminho}`, {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

const comCorpo = (jwt: string, caminho: string, metodo: string, corpo: unknown) =>
  new Request(`http://brutus.localhost${caminho}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

const comId = (jwt: string, caminho: string, id: string, corpo: unknown) => [
  comCorpo(jwt, caminho, 'PATCH', corpo),
  { params: Promise.resolve({ id }) },
] as const;

const naPublica = async (nome: string) => {
  const { barbeiros } = await (await barbeirosPublicos(
    new Request('http://brutus.localhost/api/barbeiros',
                { headers: { 'x-barbearia-slug': 'brutus' } }))).json();
  return barbeiros.map((b: { nome: string }) => b.nome).includes(nome);
};

describe('catálogo de serviços', () => {
  it('barbeiro não cria serviço', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await criarServico(comCorpo(jwt, '/api/painel/servicos', 'POST', {
      nome: 'Sobrancelha', duracaoMinimaMin: 10, duracaoSugeridaMin: 15,
    }));
    expect(res.status).toBe(403);
  });

  it('o dono cria e o serviço aparece no catálogo', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const res = await criarServico(comCorpo(jwt, '/api/painel/servicos', 'POST', {
      nome: 'Sobrancelha', duracaoMinimaMin: 10, duracaoSugeridaMin: 15,
    }));
    expect(res.status).toBe(201);

    const { servicos } = await (await verServicos(get(jwt, '/api/painel/servicos'))).json();
    const novo = servicos.find((s: { nome: string }) => s.nome === 'Sobrancelha');
    // Ninguém faz ainda — é o aviso que a tela mostra.
    expect(novo.barbeiros).toBe(0);
  });

  it('nome repetido é 409, inclusive de serviço desativado', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    await prismaOwner.servico.update({ where: { id: ctx.corte.id }, data: { ativo: false } });

    const res = await criarServico(comCorpo(jwt, '/api/painel/servicos', 'POST', {
      nome: 'Corte', duracaoMinimaMin: 20, duracaoSugeridaMin: 40,
    }));
    expect(res.status).toBe(409);
  });

  it('mínima maior que sugerida é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const res = await criarServico(comCorpo(jwt, '/api/painel/servicos', 'POST', {
      nome: 'Sobrancelha', duracaoMinimaMin: 30, duracaoSugeridaMin: 15,
    }));
    expect(res.status).toBe(422);
  });

  it('desativar serviço tira o barbeiro da rota pública', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    // Rael só faz Corte.
    await editarServico(...comId(
      jwt, `/api/painel/servicos/${ctx.corte.id}`, ctx.corte.id, { ativo: false }));

    expect(await naPublica('Rael')).toBe(false);
  });
});

describe('vínculos', () => {
  it('marcar cria o vínculo com a duração sugerida', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    // Rael não faz Pezinho, cuja sugerida é 15.
    const res = await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      servicoId: ctx.pezinho.id, faz: true,
    }));
    expect(res.status).toBe(200);

    const vinculo = await prismaOwner.barbeiroServico.findUniqueOrThrow({
      where: { barbeiroId_servicoId: { barbeiroId: ctx.rael.id, servicoId: ctx.pezinho.id } },
    });
    expect(vinculo.ativo).toBe(true);
    expect(vinculo.duracaoMin).toBe(15);
  });

  it('desmarcar preserva a duração praticada, e remarcar a devolve', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');

    await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      servicoId: ctx.corte.id, faz: true, duracaoMin: 25,
    }));
    await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      servicoId: ctx.corte.id, faz: false,
    }));

    const desmarcado = await prismaOwner.barbeiroServico.findUniqueOrThrow({
      where: { barbeiroId_servicoId: { barbeiroId: ctx.rael.id, servicoId: ctx.corte.id } },
    });
    expect(desmarcado.ativo).toBe(false);
    expect(desmarcado.duracaoMin).toBe(25);

    await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      servicoId: ctx.corte.id, faz: true,
    }));
    const remarcado = await prismaOwner.barbeiroServico.findUniqueOrThrow({
      where: { barbeiroId_servicoId: { barbeiroId: ctx.rael.id, servicoId: ctx.corte.id } },
    });
    // Volta com 25, não com a sugerida do serviço: a linha guardou o que
    // aquele barbeiro praticava.
    expect(remarcado.duracaoMin).toBe(25);
  });

  it('duração abaixo da mínima do serviço é 422, com a mensagem do validador', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      servicoId: ctx.corte.id, faz: true, duracaoMin: 15,   // Corte exige 20
    }));
    expect(res.status).toBe(422);
    expect((await res.json()).erro).toContain('20');
  });

  it('o barbeiro não mexe no vínculo do colega', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id, faz: false,
    }));
    expect(res.status).toBe(404);
  });

  it('o dono mexe no de qualquer um', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const res = await vincular(comCorpo(jwt, '/api/painel/barbeiro-servicos', 'PUT', {
      barbeiroId: ctx.rael.id, servicoId: ctx.pezinho.id, faz: true,
    }));
    expect(res.status).toBe(200);
  });

  it('o GET lista o que o barbeiro faz', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const { vinculos } = await (await verVinculos(get(jwt, '/api/painel/barbeiro-servicos'))).json();
    const corte = vinculos.find((v: { servicoId: string }) => v.servicoId === ctx.corte.id);
    expect(corte.faz).toBe(true);
    expect(corte.duracaoMin).toBe(30);
  });
});

describe('a frase da barbearia', () => {
  it('o dono edita', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'teo');
    const res = await editarBarbearia(
      comCorpo(jwt, '/api/painel/barbearia', 'PATCH', { horarioResumo: 'ter a dom, 10h-22h' }));
    expect(res.status).toBe(200);

    const depois = await prismaOwner.barbearia.findUniqueOrThrow({
      where: { id: ctx.barbearia.id },
    });
    expect(depois.horarioResumo).toBe('ter a dom, 10h-22h');
  });

  it('o barbeiro não edita', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await sessaoDe(ctx, 'rael');
    const res = await editarBarbearia(
      comCorpo(jwt, '/api/painel/barbearia', 'PATCH', { horarioResumo: 'o que eu quiser' }));
    expect(res.status).toBe(403);
  });
});

describe('o fecho da Etapa 3', () => {
  it('barbeiro novo sai do limbo com expediente e serviço', async () => {
    const ctx = await montarCenarioBrutus();
    const dono = await sessaoDe(ctx, 'teo');

    const duda = await prismaOwner.barbeiro.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Duda', whatsapp: '11955556666', ordem: 9 },
    });
    const eleMesmo = await emitirSessao({
      sub: duda.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });

    // Recém-cadastrado: invisível, que é o aviso da tela de equipe.
    expect(await naPublica('Duda')).toBe(false);

    // Fatia B: expediente.
    await definirDia(comCorpo(eleMesmo, '/api/painel/expediente', 'PUT', {
      diaSemana: diaSemanaDe(diaDeHoje(new Date())),
      minutosInicio: 0, minutosFim: 24 * 60,
    }));
    expect(await naPublica('Duda')).toBe(false);   // ainda falta o serviço

    // Fatia C: serviço.
    await vincular(comCorpo(dono, '/api/painel/barbeiro-servicos', 'PUT', {
      barbeiroId: duda.id, servicoId: ctx.corte.id, faz: true,
    }));

    expect(await naPublica('Duda')).toBe(true);
  });
});

describe('o grant da frase e estreito', () => {
  it('o papel do runtime nao consegue mexer em outra coluna da Barbearia', async () => {
    const ctx = await montarCenarioBrutus();
    // `prismaApp` é o papel `brutus_app`, o mesmo do runtime. A frase ele
    // escreve; desligar a barbearia, não — isso é do admin da plataforma.
    await expect(
      prismaApp.barbearia.update({ where: { id: ctx.barbearia.id }, data: { ativo: false } }),
    ).rejects.toThrow();

    const intacta = await prismaOwner.barbearia.findUniqueOrThrow({
      where: { id: ctx.barbearia.id },
    });
    expect(intacta.ativo).toBe(true);
  });
});
