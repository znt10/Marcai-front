import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizar, formatar } from '../src/lib/telefone';
import { SENHA_MINIMA } from '../src/lib/config';

/// A saída de emergência do painel: define a senha de um barbeiro direto pelo
/// banco e destrava a conta.
///
/// Existe porque **reemitir convite apaga a senha** (`senhaHash` volta a nulo,
/// que é o reset de senha do produto) e o token do convite só existe em HASH no
/// banco. Perdido o link, não há caminho de volta pela tela — e se isso
/// acontecer com o último dono ativo, a barbearia fica sem ninguém que consiga
/// entrar. Nenhuma tela pode resolver isso sem virar ela mesma um jeito de
/// entrar sem credencial.
///
/// Roda do HOST, com `DATABASE_URL_HOST`, como o seed.
///
/// Uso:
///   npm run barbeiro:senha -- 11911112222 "uma senha longa"
///   npm run barbeiro:senha -- 11911112222 --destravar

const [numeroBruto, segundo] = process.argv.slice(2);

if (!numeroBruto || !segundo) {
  console.error(
    'Uso:\n' +
    '  npm run barbeiro:senha -- <whatsapp> "<senha>"\n' +
    '  npm run barbeiro:senha -- <whatsapp> --destravar\n\n' +
    'O segundo apenas zera as tentativas e o bloqueio, sem tocar na senha.',
  );
  process.exit(1);
}

const normalizado = normalizar(numeroBruto);
if (!normalizado) {
  console.error(`"${numeroBruto}" não é um WhatsApp brasileiro válido.`);
  process.exit(1);
}
/// Reatribuído porque o estreitamento do `if` acima não atravessa a fronteira
/// da função lá embaixo — sem isto, `string | null` volta a aparecer no `where`.
const whatsapp: string = normalizado;

const soDestravar = segundo === '--destravar';
if (!soDestravar && segundo.length < SENHA_MINIMA) {
  console.error(`A senha precisa de ao menos ${SENHA_MINIMA} caracteres.`);
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_HOST }),
});

async function principal() {
  // Papel dono, sem RLS: este script é de operação, roda fora de tenant e
  // precisa achar a pessoa pelo celular em qualquer barbearia.
  const achados = await prisma.barbeiro.findMany({
    where: { whatsapp },
    include: { barbearia: { select: { slug: true, nome: true } } },
  });

  if (achados.length === 0) {
    console.error(`Nenhum barbeiro com ${formatar(whatsapp)}.`);
    process.exit(1);
  }

  // O celular é único POR BARBEARIA, não globalmente: a mesma pessoa pode
  // trabalhar em duas casas. Trocar a senha das duas em silêncio seria errado.
  if (achados.length > 1) {
    console.error(
      `${formatar(whatsapp)} existe em mais de uma barbearia:\n` +
      achados.map((b) => `  - ${b.barbearia.slug} (${b.nome})`).join('\n') +
      '\nEste script não escolhe por você. Resolva pelo painel da barbearia certa.',
    );
    process.exit(1);
  }

  const barbeiro = achados[0];

  // Incrementar o tokenVersion derruba toda sessão daquela pessoa na hora. É o
  // ponto: se a senha está sendo trocada por perda de acesso, quem estava
  // dentro com o token antigo sai.
  await prisma.barbeiro.update({
    where: { id: barbeiro.id },
    data: {
      ...(soDestravar ? {} : {
        senhaHash: await hash(segundo),
        conviteTokenHash: null,
        conviteExpiraEm: null,
        tokenVersion: { increment: 1 },
      }),
      tentativasLogin: 0,
      bloqueadoAte: null,
    },
  });

  const acao = soDestravar ? 'destravado' : 'senha trocada e conta destravada';
  console.log(
    `${barbeiro.nome} (${barbeiro.papel.toLowerCase()}) na ${barbeiro.barbearia.nome}: ${acao}.`,
  );
  if (!soDestravar) console.log('As sessões antigas dele foram derrubadas.');
  if (!barbeiro.ativo) console.log('ATENÇÃO: este barbeiro está DESATIVADO — ele ainda não entra.');
}

principal()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
