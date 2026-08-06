import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, prismaApp, limparBanco } from './setup';
import { comBarbearia } from '@/lib/tenant';
import { prisma } from '@/lib/db';

async function duasBarbearias() {
  const brutus = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const domTony = await prismaOwner.barbearia.create({
    data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
            horarioResumo: 'ter a sáb, 10h–19h', whatsappContato: '11955554444' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: brutus.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: domTony.id, nome: 'Tony', whatsapp: '11933334444', papel: 'DONO' },
  });
  return { brutus, domTony };
}

beforeEach(limparBanco);

describe('o papel da conexão', () => {
  it('runtime conecta como brutus_app, não como o dono', async () => {
    const [{ current_user }] = await prismaApp.$queryRawUnsafe<{ current_user: string }[]>(
      'SELECT current_user',
    );
    expect(current_user).toBe('brutus_app');
  });

  it('brutus_app não é dono de nenhuma tabela', async () => {
    const linhas = await prismaApp.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM pg_tables
        WHERE schemaname = 'public' AND tableowner = 'brutus_app'`,
    );
    expect(Number(linhas[0].n)).toBe(0);
  });
});

describe('o RLS filtrando', () => {
  it('sem where nenhum, enxerga só o próprio tenant', async () => {
    const { brutus } = await duasBarbearias();
    const barbeiros = await comBarbearia(brutus.id, (tx) => tx.barbeiro.findMany());
    expect(barbeiros).toHaveLength(1);
    expect(barbeiros[0].nome).toBe('Téo');
  });

  it('buscar pelo id de outro tenant devolve null, não erro', async () => {
    const { brutus, domTony } = await duasBarbearias();
    const alheio = await prismaOwner.barbeiro.findFirst({ where: { barbeariaId: domTony.id } });
    const achado = await comBarbearia(brutus.id, (tx) =>
      tx.barbeiro.findUnique({ where: { id: alheio!.id } }),
    );
    expect(achado).toBeNull();
  });

  it('update em registro de outro tenant afeta zero linhas', async () => {
    const { brutus, domTony } = await duasBarbearias();
    const alheio = await prismaOwner.barbeiro.findFirst({ where: { barbeariaId: domTony.id } });
    const r = await comBarbearia(brutus.id, (tx) =>
      tx.barbeiro.updateMany({ where: { id: alheio!.id }, data: { nome: 'INVADIDO' } }),
    );
    expect(r.count).toBe(0);
    const intacto = await prismaOwner.barbeiro.findUnique({ where: { id: alheio!.id } });
    expect(intacto!.nome).toBe('Tony');
  });
});

describe('falha fechada', () => {
  it('consulta fora de comBarbearia devolve zero linhas, nunca a tabela inteira', async () => {
    await duasBarbearias();
    const todos = await prismaApp.barbeiro.findMany();
    expect(todos).toHaveLength(0);
  });

  it('INSERT carimbado com outro tenant é recusado pelo WITH CHECK', async () => {
    const { brutus, domTony } = await duasBarbearias();
    await expect(
      comBarbearia(brutus.id, (tx) =>
        tx.barbeiro.create({
          data: { barbeariaId: domTony.id, nome: 'Intruso', whatsapp: '11900000000' },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('vazamento pela pool', () => {
  it('o tenant não sobrevive ao fim da transação', async () => {
    const { brutus, domTony } = await duasBarbearias();
    const a = await comBarbearia(brutus.id,  (tx) => tx.barbeiro.findMany());
    const b = await comBarbearia(domTony.id, (tx) => tx.barbeiro.findMany());
    expect(a.map((x) => x.nome)).toEqual(['Téo']);
    expect(b.map((x) => x.nome)).toEqual(['Tony']);

    // As duas asserções acima NÃO seguram o `true` (is_local) do set_config:
    // cada comBarbearia redefine o tenant antes de ler, então um vazamento de
    // sessão fica invisível para elas. O que prende é ler DEPOIS da transação,
    // sem tenant nenhum, na MESMA pool que comBarbearia usou — por isso o
    // singleton de `@/lib/db`, e não o `prismaApp` do setup, que é outro
    // PrismaClient, com outra pool, e jamais veria o vazamento.
    const [{ vazado }] = await prisma.$queryRawUnsafe<{ vazado: string | null }[]>(
      `SELECT current_setting('app.barbearia_id', true) AS vazado`,
    );
    expect(vazado).not.toBe(domTony.id);

    // A consequência observável do vazamento: o pedido seguinte, que não abriu
    // comBarbearia, herdaria o tenant do anterior e leria linhas alheias.
    expect(await prisma.barbeiro.findMany()).toHaveLength(0);
  });
});

describe('unicidade por tenant', () => {
  it('o mesmo WhatsApp existe nas duas barbearias', async () => {
    const { brutus, domTony } = await duasBarbearias();
    await comBarbearia(brutus.id, (tx) =>
      tx.cliente.create({ data: { barbeariaId: brutus.id, nome: 'Marcos', whatsapp: '11977771234' } }),
    );
    await expect(
      comBarbearia(domTony.id, (tx) =>
        tx.cliente.create({ data: { barbeariaId: domTony.id, nome: 'Marcos', whatsapp: '11977771234' } }),
      ),
    ).resolves.toBeTruthy();
  });

  it('o mesmo WhatsApp repetido na mesma barbearia é recusado', async () => {
    const { brutus } = await duasBarbearias();
    await comBarbearia(brutus.id, (tx) =>
      tx.cliente.create({ data: { barbeariaId: brutus.id, nome: 'Marcos', whatsapp: '11977771234' } }),
    );
    await expect(
      comBarbearia(brutus.id, (tx) =>
        tx.cliente.create({ data: { barbeariaId: brutus.id, nome: 'Outro', whatsapp: '11977771234' } }),
      ),
    ).rejects.toThrow();
  });
});

describe('varredura estrutural', () => {
  // Exigir "ao menos uma política" seria fraco demais para o desenho de DUAS
  // políticas por papel: uma tabela com só `owner_irrestrito` e sem
  // `tenant_isolation` satisfaria a asserção e não isolaria nada. O resultado
  // seria falha fechada (o app lê zero linhas de uma tabela populada), mas com
  // a suíte verde — dos sintomas mais caros de diagnosticar. Por isso a
  // política do runtime é exigida NOMINALMENTE e amarrada a `brutus_app`.
  it('toda tabela com barbeariaId tem RLS ligado e a política de isolamento', async () => {
    const semRls = await prismaOwner.$queryRawUnsafe<{ tabela: string }[]>(`
      SELECT c.relname AS tabela
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public'
                        AND table_name = c.relname AND column_name = 'barbeariaId')
         AND (c.relrowsecurity = false
              OR NOT EXISTS (SELECT 1 FROM pg_policies
                              WHERE schemaname = 'public'
                                AND tablename  = c.relname
                                AND policyname = 'tenant_isolation'
                                AND 'brutus_app' = ANY (roles)))
    `);
    expect(semRls).toEqual([]);
  });
});

describe('Barbearia fora do RLS', () => {
  // Barbearia precisa ser lida ANTES de existir tenant, para traduzir
  // subdomínio em id — por isso fica fora do RLS, protegida por GRANT. As duas
  // metades importam: sem SELECT a resolução de subdomínio quebra; com
  // INSERT/UPDATE/DELETE o runtime poderia criar ou apagar barbearias.
  it('brutus_app lê Barbearia, mas não escreve nela', async () => {
    const grants = await prismaOwner.$queryRawUnsafe<{ privilege_type: string }[]>(`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'brutus_app' AND table_schema = 'public'
         AND table_name = 'Barbearia'
       ORDER BY privilege_type
    `);
    expect(grants.map((g) => g.privilege_type)).toEqual(['SELECT']);
  });

  // O GRANT acima é conferido por papel nomeado, e não enxergaria um
  // `GRANT ... TO PUBLIC` dado por engano — que daria escrita a brutus_app sem
  // aparecer na consulta anterior. Este teste fecha essa brecha pelo efeito, e
  // de quebra prova que Barbearia NÃO está sob RLS: se estivesse (sem política
  // para brutus_app), a leitura devolveria zero linhas em vez das duas.
  it('brutus_app enxerga as barbearias sem tenant definido e não consegue criar', async () => {
    await duasBarbearias();

    const lidas = await prismaApp.barbearia.findMany();
    expect(lidas.map((b) => b.slug).sort()).toEqual(['brutus', 'dontony']);

    await expect(
      prismaApp.barbearia.create({
        data: { slug: 'intrusa', nome: 'Intrusa', endereco: 'Rua X, 1',
                horarioResumo: 'seg a sex, 9h–18h', whatsappContato: '11900000000' },
      }),
    ).rejects.toThrow();
  });
});
