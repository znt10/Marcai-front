import { NextResponse } from 'next/server';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { ehDono } from '@/lib/autorizacao';

const Corpo = z.object({
  horarioResumo: z.string().trim().min(3).max(120),
});

/// O que a tela precisa para não escrever no escuro.
///
/// A frase nasce **nula** — o admin da plataforma cadastra a barbearia e não
/// sabe o horário dela. Sem este GET, a tela do dono abria com o campo vazio em
/// qualquer caso, e ele não tinha como saber se a home estava mostrando algo,
/// nem o quê: escrevia por cima às cegas.
///
/// Leitura para a EQUIPE inteira, não só o dono: quem atende precisa saber o
/// que a home promete ao cliente. Escrever continua sendo só do dono, no PATCH.
export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  // Lê do BANCO, e não de `aberta.barbearia`: aquele objeto vem do cache de
  // slug→Barbearia, que vive por `TTL_CACHE_TENANT_MS`. Servido dali, o dono
  // salvava a frase e a tela continuava mostrando a antiga por até um minuto —
  // ou seja, exatamente na hora em que ele quer ver que deu certo, o sistema
  // diria que não deu.
  const atual = await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.barbearia.findUniqueOrThrow({
      where: { id: aberta.barbearia.id },
      select: { nome: true, endereco: true, horarioResumo: true, whatsappContato: true },
    }));

  return NextResponse.json(atual);
}

/// A frase de horário da home. **Não** é derivada das agendas de propósito
/// (cliente §5.1): a união dos expedientes de uma equipe com horários
/// diferentes produz frase ruim — "seg a sáb, 9h–20h, exceto terça de 10h às
/// 19h e quinta…". O dono escreve, e a partir daqui tem onde.
export async function PATCH(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  if (!ehDono(aberta.sessao)) {
    return NextResponse.json({ erro: 'Só o dono muda isso.' }, { status: 403 });
  }

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Escreve a frase do horário.' }, { status: 422 });
  }

  await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.barbearia.update({
      where: { id: aberta.barbearia.id },
      data: { horarioResumo: parse.data.horarioResumo },
    }));

  return NextResponse.json({ ok: true });
}
