import { NextResponse } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { comBarbeariaAdmin } from '@/lib/tenant';
import { gerarConvite, linkDoConvite } from '@/lib/convite';
import { enviarTexto } from '@/lib/whatsapp';
import { msgConvite } from '@/lib/mensagens';
import { SLUG_REGEX, SUBDOMINIOS_RESERVADOS } from '@/lib/config';
import { normalizar } from '@/lib/telefone';

/// Cinco campos, e nenhum deles é o horário: o admin da plataforma cadastra a
/// barbearia e **não sabe** o horário dela. Quem sabe é o dono, e a tela dele já
/// existe (`/painel/servicos`). `horarioResumo` nasce nulo.
///
/// Um número só, também de propósito. No cadastro, o contato da barbearia e o
/// celular do dono são a mesma pessoa em praticamente todo caso — pedir dois
/// era pedir para digitar o mesmo número duas vezes. O dono separa depois pela
/// tela de equipe, se a barbearia crescer e ganhar um número próprio.
type Corpo = {
  slug: string; nome: string; endereco: string;
  whatsappContato: string; donoNome: string;
};

export async function GET() {
  const barbearias = await prismaAdmin.barbearia.findMany({ orderBy: { criadoEm: 'asc' } });

  // Tenant a tenant, e não numa agregação só: o brutus_admin está sujeito ao
  // RLS, então um count() global devolveria zero. Mesmo laço que a rota de
  // lembretes já usa. N é o número de barbearias — dezenas, não milhões.
  const comContagem = [];
  for (const b of barbearias) {
    const { barbeiros, agendamentos } = await comBarbeariaAdmin(b.id, async (tx) => ({
      barbeiros: await tx.barbeiro.count(),
      agendamentos: await tx.agendamento.count({ where: { status: 'CONFIRMADO' } }),
    }));
    comContagem.push({
      id: b.id, slug: b.slug, nome: b.nome, ativo: b.ativo, barbeiros, agendamentos,
    });
  }

  return NextResponse.json({ barbearias: comContagem });
}

export async function POST(req: Request) {
  const c = (await req.json().catch(() => ({}))) as Partial<Corpo>;

  // Mesmas regras de extrairSlug(): o que não vira subdomínio válido não pode
  // virar barbearia, senão nasce um tenant que ninguém consegue alcançar.
  const slug = String(c.slug ?? '').trim().toLowerCase();
  if (!SLUG_REGEX.test(slug) || (SUBDOMINIOS_RESERVADOS as readonly string[]).includes(slug)) {
    return NextResponse.json({ erro: 'Slug inválido ou reservado.' }, { status: 422 });
  }

  const contato = normalizar(String(c.whatsappContato ?? ''));
  if (!contato || !c.nome || !c.donoNome || !c.endereco) {
    return NextResponse.json({ erro: 'Faltou preencher algum campo.' }, { status: 422 });
  }

  if (await prismaAdmin.barbearia.findUnique({ where: { slug } })) {
    // Aqui não há por que ser evasivo como no login: quem lê é o dono do site.
    return NextResponse.json({ erro: `O slug "${slug}" já está em uso.` }, { status: 409 });
  }

  const convite = gerarConvite();

  // UMA transação. Se a criação do dono falhar, a barbearia NÃO pode sobrar:
  // barbearia sem dono é órfã — ninguém entra nela para cadastrar ninguém, e
  // ela só sairia de lá pelo psql.
  //
  // Por isso este caso não usa comBarbeariaAdmin(): aquele helper abre a
  // própria transação, e o set_config precisa acontecer DENTRO desta, depois
  // que a barbearia passa a existir.
  const nova = await prismaAdmin.$transaction(async (tx) => {
    const barbearia = await tx.barbearia.create({
      data: {
        slug, nome: c.nome!, endereco: c.endereco!,
        // Sem horário: o dono preenche pela tela dele.
        whatsappContato: contato,
      },
    });
    // Só agora o RLS tem para onde apontar — a barbearia acabou de existir.
    await tx.$executeRaw`SELECT set_config('app.barbearia_id', ${barbearia.id}, true)`;
    await tx.barbeiro.create({
      data: {
        barbeariaId: barbearia.id, nome: c.donoNome!, whatsapp: contato,
        papel: 'DONO', senhaHash: null,
        conviteTokenHash: convite.hash, conviteExpiraEm: convite.expiraEm,
      },
    });
    return barbearia;
  });

  const link = linkDoConvite(slug, convite.token);

  // Fire-and-forget, DEPOIS do commit — igual ao convite de barbeiro. O link
  // ia SÓ para a tela do admin, e o token só existe em hash: perdido ali, o
  // dono não entrava mais e a barbearia nascia órfã. Duas vias resolvem, e
  // falha de WhatsApp não pode desfazer a barbearia que acabou de nascer.
  void enviarTexto(contato, msgConvite({
    nome: c.donoNome!, barbeariaNome: nova.nome, link,
  }));

  return NextResponse.json({
    id: nova.id,
    slug: nova.slug,
    // Em claro UMA vez só: o banco tem apenas o hash, então não existe jeito
    // de recuperar este link depois. Perdeu, reemite.
    linkConvite: link,
  }, { status: 201 });
}
