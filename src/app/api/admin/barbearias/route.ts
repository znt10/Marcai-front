import { NextResponse } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { gerarConvite } from '@/lib/convite';
import { SLUG_REGEX, SUBDOMINIOS_RESERVADOS } from '@/lib/config';
import { normalizar } from '@/lib/telefone';

type Corpo = {
  slug: string; nome: string; endereco: string; horarioResumo: string;
  whatsappContato: string; donoNome: string; donoWhatsapp: string;
};

export async function POST(req: Request) {
  const c = (await req.json().catch(() => ({}))) as Partial<Corpo>;

  // Mesmas regras de extrairSlug(): o que não vira subdomínio válido não pode
  // virar barbearia, senão nasce um tenant que ninguém consegue alcançar.
  const slug = String(c.slug ?? '').trim().toLowerCase();
  if (!SLUG_REGEX.test(slug) || (SUBDOMINIOS_RESERVADOS as readonly string[]).includes(slug)) {
    return NextResponse.json({ erro: 'Slug inválido ou reservado.' }, { status: 422 });
  }

  const donoWhatsapp = normalizar(String(c.donoWhatsapp ?? ''));
  const contato = normalizar(String(c.whatsappContato ?? ''));
  if (!donoWhatsapp || !contato || !c.nome || !c.donoNome || !c.endereco || !c.horarioResumo) {
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
        horarioResumo: c.horarioResumo!, whatsappContato: contato,
      },
    });
    // Só agora o RLS tem para onde apontar — a barbearia acabou de existir.
    await tx.$executeRaw`SELECT set_config('app.barbearia_id', ${barbearia.id}, true)`;
    await tx.barbeiro.create({
      data: {
        barbeariaId: barbearia.id, nome: c.donoNome!, whatsapp: donoWhatsapp,
        papel: 'DONO', senhaHash: null,
        conviteTokenHash: convite.hash, conviteExpiraEm: convite.expiraEm,
      },
    });
    return barbearia;
  });

  const base = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';
  return NextResponse.json({
    id: nova.id,
    slug: nova.slug,
    // Em claro UMA vez só: o banco tem apenas o hash, então não existe jeito
    // de recuperar este link depois. Perdeu, reemite.
    linkConvite: `http://${slug}.${base}:3000/convite/${convite.token}`,
  }, { status: 201 });
}
