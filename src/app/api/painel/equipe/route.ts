import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { ehDono } from '@/lib/autorizacao';
import { normalizar } from '@/lib/telefone';
import { gerarConvite, linkDoConvite } from '@/lib/convite';
import { enviarTexto } from '@/lib/whatsapp';
import { msgConvite } from '@/lib/mensagens';

/// Papel insuficiente é 403, não 404 (equipe §3): o barbeiro já sabe que não é
/// dono, então a resposta não conta nada que ele não soubesse.
const soODono = NextResponse.json(
  { erro: 'Só o dono mexe na equipe.' }, { status: 403 });

const Corpo = z.object({
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string(),
  papel: z.enum(['DONO', 'BARBEIRO']),
});

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) return soODono;

  const agora = new Date();

  const equipe = await comBarbearia(aberta.barbearia.id, async (tx) => {
    const barbeiros = await tx.barbeiro.findMany({
      // Ativos primeiro; quem saiu vai para o fim, mas continua visível —
      // desativar é reversível, e a lista é onde se reativa.
      orderBy: [{ ativo: 'desc' }, { ordem: 'asc' }],
      // Campo por campo, sem espalhar o objeto do Prisma: `senhaHash` e
      // `conviteTokenHash` não saem daqui nem por acidente.
      select: {
        id: true, nome: true, whatsapp: true, papel: true, ativo: true,
        desativadoEm: true, senhaHash: true, conviteExpiraEm: true,
        _count: { select: { servicos: true, horarios: true } },
      },
    });

    // Consulta separada de propósito: uma equipe tem unidades, não milhares, e
    // uma subconsulta correlacionada por barbeiro custaria legibilidade sem
    // ganho medível.
    const futuros = await tx.agendamento.groupBy({
      by: ['barbeiroId'],
      where: { status: 'CONFIRMADO', inicio: { gt: agora } },
      _count: { _all: true },
    });
    const porBarbeiro = new Map(futuros.map((f) => [f.barbeiroId, f._count._all]));

    return barbeiros.map((b) => ({
      id: b.id, nome: b.nome, whatsapp: b.whatsapp, papel: b.papel,
      ativo: b.ativo, desativadoEm: b.desativadoEm,
      temSenha: b.senhaHash !== null,
      conviteExpirado:
        b.senhaHash === null && b.conviteExpiraEm !== null && b.conviteExpiraEm < agora,
      // Zero em qualquer um dos dois e o barbeiro não aparece para o cliente:
      // é o que a tela precisa dizer em destaque.
      servicos: b._count.servicos,
      expediente: b._count.horarios,
      agendamentosFuturos: porBarbeiro.get(b.id) ?? 0,
    }));
  });

  return NextResponse.json({ equipe });
}

export async function POST(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) return soODono;
  const { barbearia } = aberta;

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche nome, celular e papel.' }, { status: 422 });
  }
  const { nome, papel } = parse.data;

  const whatsapp = normalizar(parse.data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json(
      { erro: 'Confere o celular — parece faltar dígito.' }, { status: 422 });
  }

  const convite = gerarConvite();

  const resultado = await comBarbearia(barbearia.id, async (tx) => {
    // SEM filtrar por `ativo`: o índice único é `[barbeariaId, whatsapp]` e não
    // distingue desativado. Sem esta checagem o erro viria do Postgres como
    // 500; e sem mencionar o desativado, o dono procura na lista, não acha, e
    // conclui que o sistema está errado.
    const existente = await tx.barbeiro.findUnique({
      where: { barbeariaId_whatsapp: { barbeariaId: barbearia.id, whatsapp } },
      select: { nome: true, ativo: true },
    });
    if (existente) return { tipo: 'repetido' as const, existente };

    const ultimo = await tx.barbeiro.findFirst({
      orderBy: { ordem: 'desc' }, select: { ordem: true },
    });

    const criado = await tx.barbeiro.create({
      data: {
        barbeariaId: barbearia.id, nome, whatsapp, papel,
        // Nasce SEM senha: quem entra é quem abrir o link do convite.
        senhaHash: null,
        conviteTokenHash: convite.hash,
        conviteExpiraEm: convite.expiraEm,
        ordem: (ultimo?.ordem ?? -1) + 1,
      },
      select: { id: true, nome: true },
    });
    return { tipo: 'ok' as const, criado };
  });

  if (resultado.tipo === 'repetido') {
    const { nome: dono, ativo } = resultado.existente;
    return NextResponse.json({
      erro: ativo
        ? `Esse celular já é do ${dono}.`
        : `Esse celular é do ${dono}, que está desativado. Reativa em vez de cadastrar de novo.`,
    }, { status: 409 });
  }

  const link = linkDoConvite(barbearia.slug, convite.token);

  // Fire-and-forget, depois do commit (§10.2): WhatsApp fora do ar não derruba
  // o cadastro. É por isso que o link também volta para a tela.
  void enviarTexto(whatsapp, msgConvite({
    nome, barbeariaNome: barbearia.nome, link,
  }));

  return NextResponse.json({ id: resultado.criado.id, linkConvite: link }, { status: 201 });
}
