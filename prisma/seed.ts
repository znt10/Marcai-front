import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Papel DONO (DATABASE_URL): ignora RLS, que é o que popular oito tabelas de
// dois tenants diferentes exige. O runtime jamais usa esta URL — ver src/lib/db.ts.
//
// O seed roda do HOST, como os testes: de fora do Compose o host `db` não
// resolve, e é para isso que DATABASE_URL_HOST existe no .env. Dentro do
// contêiner essa variável não está definida e DATABASE_URL assume.
const connectionString = process.env.DATABASE_URL_HOST ?? process.env.DATABASE_URL;

// Prisma 7 exige driver adapter: `datasources` saiu do construtor.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV === 'production') {
  throw new Error('O seed nunca roda em produção: cria senha conhecida.');
}

const SEG_A_SAB = [1, 2, 3, 4, 5, 6];
const TER_A_SAB = [2, 3, 4, 5, 6];

async function main() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Agendamento", "Cliente", "Bloqueio", "HorarioTrabalho",
                   "BarbeiroServico", "Servico", "Barbeiro", "Barbearia"
    RESTART IDENTITY CASCADE`);

  // ---------- BRUTUS: o cenário do wireframe ----------
  const brutus = await prisma.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });

  const servicos = await Promise.all([
    { nome: 'Corte',         duracaoMinimaMin: 20, duracaoSugeridaMin: 40, ordem: 0 },
    { nome: 'Barba',         duracaoMinimaMin: 15, duracaoSugeridaMin: 30, ordem: 1 },
    { nome: 'Corte + Barba', duracaoMinimaMin: 40, duracaoSugeridaMin: 60, ordem: 2 },
    { nome: 'Pezinho',       duracaoMinimaMin: 10, duracaoSugeridaMin: 15, ordem: 3 },
  ].map((s) => prisma.servico.create({ data: { ...s, barbeariaId: brutus.id } })));

  const [corte, barba, combo, pezinho] = servicos;

  const teo = await prisma.barbeiro.create({
    data: { barbeariaId: brutus.id, nome: 'Téo', whatsapp: '11911112222',
            papel: 'DONO', ordem: 0 },
  });
  const rael = await prisma.barbeiro.create({
    data: { barbeariaId: brutus.id, nome: 'Rael', whatsapp: '11933334444',
            papel: 'BARBEIRO', ordem: 1 },
  });
  // Convite pendente — o estado que o wireframe 3e desenha.
  await prisma.barbeiro.create({
    data: { barbeariaId: brutus.id, nome: 'Duda', whatsapp: '11955556666',
            papel: 'BARBEIRO', senhaHash: null, ordem: 2 },
  });

  // Durações DIFERENTES de propósito: se um bug ignorar a duração,
  // aparece na primeira tela aberta.
  const duracoes = [
    { barbeiro: teo,  servico: corte,   min: 40 },
    { barbeiro: teo,  servico: barba,   min: 30 },
    { barbeiro: teo,  servico: combo,   min: 60 },
    { barbeiro: teo,  servico: pezinho, min: 15 },
    { barbeiro: rael, servico: corte,   min: 30 },
    { barbeiro: rael, servico: barba,   min: 45 },
    { barbeiro: rael, servico: combo,   min: 60 },
    // Rael NÃO faz pezinho — linha ausente de propósito.
  ];
  for (const d of duracoes) {
    await prisma.barbeiroServico.create({
      data: { barbeariaId: brutus.id, barbeiroId: d.barbeiro.id,
              servicoId: d.servico.id, duracaoMin: d.min },
    });
  }

  for (const dia of SEG_A_SAB) {
    await prisma.horarioTrabalho.create({
      data: { barbeariaId: brutus.id, barbeiroId: teo.id, diaSemana: dia,
              minutosInicio: 9 * 60, minutosFim: 20 * 60 },
    });
  }
  for (const dia of TER_A_SAB) {
    await prisma.horarioTrabalho.create({
      data: { barbeariaId: brutus.id, barbeiroId: rael.id, diaSemana: dia,
              minutosInicio: 10 * 60, minutosFim: 19 * 60 },
    });
  }

  for (const b of [teo, rael]) {
    for (const dia of SEG_A_SAB) {
      await prisma.bloqueio.create({
        data: { barbeariaId: brutus.id, barbeiroId: b.id, motivo: 'ALMOCO',
                repeteSemanalmente: true, diaSemana: dia,
                minutosInicio: 12 * 60, minutosFim: 13 * 60 },
      });
    }
  }

  // ---------- DOM TONY: barbearia-controle, nada em comum ----------
  const domTony = await prisma.barbearia.create({
    data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
            horarioResumo: 'ter a sáb, 10h–19h', whatsappContato: '11955554444' },
  });
  const corteTony = await prisma.servico.create({
    data: { barbeariaId: domTony.id, nome: 'Corte social',
            duracaoMinimaMin: 25, duracaoSugeridaMin: 50 },
  });
  const tony = await prisma.barbeiro.create({
    data: { barbeariaId: domTony.id, nome: 'Tony', whatsapp: '11977778888', papel: 'DONO' },
  });
  await prisma.barbeiroServico.create({
    data: { barbeariaId: domTony.id, barbeiroId: tony.id,
            servicoId: corteTony.id, duracaoMin: 50 },
  });
  for (const dia of TER_A_SAB) {
    await prisma.horarioTrabalho.create({
      data: { barbeariaId: domTony.id, barbeiroId: tony.id, diaSemana: dia,
              minutosInicio: 10 * 60, minutosFim: 19 * 60 },
    });
  }
  await prisma.cliente.create({
    data: { barbeariaId: domTony.id, nome: 'Jorge Dom Tony', whatsapp: '11912121212' },
  });

  console.log('Seed pronto: brutus.localhost:3000 e dontony.localhost:3000');
}

// `.finally` sozinho engoliria a falha em silêncio e ainda assim sairia com
// código 0 em parte dos runtimes — o passo de verificação do plano ("sem
// erro") precisa de um código de saída confiável.
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
