# Admin da plataforma · Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** dar ao dono do site um painel próprio, em `admin.<domínio>`, onde ele cria barbearias com o primeiro dono, lista o que está no ar, liga e desliga cada uma, e reemite o convite do dono.

**Arquitetura:** um terceiro papel no Postgres (`brutus_admin`) que ganha exatamente uma capacidade nova — `INSERT`/`UPDATE` em `Barbearia` — e **continua sujeito ao RLS** em todo o resto. A credencial do admin vive em variável de ambiente, nunca no banco. A sessão é um JWT em cookie `httpOnly` com segredo próprio, verificado no proxy antes de chegar perto do banco.

**Stack:** Next.js 16 (App Router) · TypeScript · PostgreSQL 16 · Prisma 7 · `jose` · `@node-rs/argon2` · Vitest

**Spec:** `docs/superpowers/specs/2026-08-06-brutus-admin-da-plataforma-design.md` — as referências `§N` apontam para ela. `cliente §N` aponta para `2026-08-05-brutus-agendamento-cliente-design.md`.

---

## Restrições globais

Valem para **todas** as tarefas. Além das do plano da Etapa 1, que continuam valendo:

- **Idioma:** identificadores de domínio, rotas e mensagens de erro em **português**.
- **Nenhum número mágico.** Todo valor vem de `src/lib/config.ts`.
- **`brutus_admin` nunca recebe `BYPASSRLS`.** Toda leitura ou escrita de dado de tenant acontece dentro de `comBarbeariaAdmin()` ou de uma transação que faça o `set_config`. Uma consulta agregada cruzando tenants é sinal de erro, não de otimização.
- **`brutus_app` continua sem `INSERT`/`UPDATE`/`DELETE` em `Barbearia`.** O teste que confere isso não pode ser afrouxado.
- **A credencial do admin nunca vai para o banco nem para o versionamento.** `.env.example` leva as chaves vazias.
- **Segredos separados:** `ADMIN_JWT_SECRET` ≠ `JWT_SECRET`. Nunca reusar.
- **Commits em português**, no imperativo, assunto ≤ 72 caracteres.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `docker/init-db.sql` | cria os três papéis num ambiente novo | 1 |
| `prisma/migrations/*_admin_grants/migration.sql` | grants do `brutus_admin` no banco existente | 1 |
| `src/lib/db.ts` | ganha o cliente `prismaAdmin` | 2 |
| `src/lib/tenant.ts` | ganha `comBarbeariaAdmin()` | 2 |
| `src/lib/admin-sessao.ts` | hash de senha, emissão e leitura do JWT de admin | 3 |
| `scripts/hash-senha.ts` | gera o `ADMIN_SENHA_HASH` para o `.env` | 3 |
| `src/lib/trava-ip.ts` | espera exponencial por IP | 4 |
| `src/app/api/admin/auth/*` | login e logout | 4 |
| `src/lib/slug.ts` | ganha `ehHostAdmin()` | 5 |
| `src/proxy.ts` | roteia o host de admin e barra `/api/admin/*` | 5 |
| `src/lib/convite.ts` | gera e confere token de convite | 6 |
| `src/app/api/admin/barbearias/*` | as quatro capacidades | 6, 7, 8 |
| `src/app/api/auth/convite/[token]/route.ts` | o dono define a senha (emprestado do cliente §9.5) | 8 |
| `src/app/admin/*` | as telas | 9 |

---

## Tarefa 1: O papel `brutus_admin`

**Arquivos:**
- Modificar: `docker/init-db.sql`
- Criar: `prisma/migrations/<ts>_admin_grants/migration.sql`
- Modificar: `.env`, `.env.example`, `docker-compose.yml`
- Criar: `tests/admin-papel.test.ts`

**Interfaces:**
- Produz: papel `brutus_admin` capaz de `INSERT`/`UPDATE` em `Barbearia` e de DML nas demais tabelas, sempre sob RLS. Variáveis `DATABASE_URL_ADMIN`, `DATABASE_URL_ADMIN_HOST`, `DATABASE_URL_ADMIN_TEST`.

- [ ] **Passo 1: Acrescentar o papel ao `docker/init-db.sql`**

Depois do bloco de `brutus_app`, antes do `CREATE DATABASE`:

```sql
-- Papel do admin da plataforma: é o brutus_app MAIS a porta de entrada
-- (INSERT/UPDATE em Barbearia). Sem BYPASSRLS, de propósito — o admin
-- continua sujeito ao RLS em toda tabela de tenant.
CREATE ROLE brutus_admin LOGIN PASSWORD 'admin';
```

E, dentro de **cada** um dos dois blocos `\connect` (`brutus` e `brutus_test`), depois das linhas do `brutus_app`:

```sql
GRANT USAGE ON SCHEMA public TO brutus_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_admin;
```

`ALTER DEFAULT PRIVILEGES` só vale para tabelas criadas **depois** dele. Como os bancos de hoje já têm as oito tabelas, o Passo 2 concede a elas explicitamente.

- [ ] **Passo 2: Escrever a migração dos grants**

```bash
docker compose exec app npx prisma migrate dev --name admin_grants --create-only
```

No `migration.sql` gerado:

```sql
-- O papel pode não existir num banco criado antes desta etapa.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brutus_admin') THEN
    CREATE ROLE brutus_admin LOGIN PASSWORD 'admin';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO brutus_admin;

-- DML nas tabelas que JÁ existem. As futuras vêm por ALTER DEFAULT PRIVILEGES.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO brutus_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_admin;

-- A única capacidade que o brutus_app NÃO tem. É esta linha que
-- distingue os dois papéis; o resto é igual.
GRANT INSERT, UPDATE ON "Barbearia" TO brutus_admin;

-- As políticas de RLS valem para brutus_admin como para qualquer um:
-- foram criadas com FORCE e sem TO, então se aplicam a todos os papéis.
```

- [ ] **Passo 3: Acrescentar as variáveis de ambiente**

Em `.env` e `.env.example`, depois das URLs existentes:

```
DATABASE_URL_ADMIN="postgresql://brutus_admin:admin@db:5432/brutus"
DATABASE_URL_ADMIN_HOST="postgresql://brutus_admin:admin@localhost:5433/brutus"
DATABASE_URL_ADMIN_TEST="postgresql://brutus_admin:admin@localhost:5433/brutus_test"
```

Em `docker-compose.yml`, no bloco `environment` do serviço `app`:

```yaml
      DATABASE_URL_ADMIN: postgresql://brutus_admin:admin@db:5432/brutus
```

- [ ] **Passo 4: Escrever os testes que devem falhar**

`tests/admin-papel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaOwner, prismaApp, limparBanco } from './setup';

const prismaAdminTeste = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_ADMIN_TEST }),
});

const dadosBarbearia = (slug: string) => ({
  slug, nome: 'Nova', endereco: 'Rua Um, 1',
  horarioResumo: 'seg a sex, 9h-18h', whatsappContato: '11900000000',
});

beforeEach(limparBanco);

describe('o papel do admin', () => {
  it('conecta como brutus_admin', async () => {
    const [{ current_user }] = await prismaAdminTeste.$queryRawUnsafe<{ current_user: string }[]>(
      'SELECT current_user',
    );
    expect(current_user).toBe('brutus_admin');
  });

  it('NÃO tem bypassrls', async () => {
    const [{ rolbypassrls }] = await prismaOwner.$queryRawUnsafe<{ rolbypassrls: boolean }[]>(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'brutus_admin'`,
    );
    expect(rolbypassrls).toBe(false);
  });

  it('cria barbearia — a capacidade que o brutus_app não tem', async () => {
    await expect(
      prismaAdminTeste.barbearia.create({ data: dadosBarbearia('nova') }),
    ).resolves.toBeTruthy();
  });

  it('desativa barbearia', async () => {
    const b = await prismaAdminTeste.barbearia.create({ data: dadosBarbearia('nova') });
    await prismaAdminTeste.barbearia.update({ where: { id: b.id }, data: { ativo: false } });
    const depois = await prismaOwner.barbearia.findUnique({ where: { id: b.id } });
    expect(depois!.ativo).toBe(false);
  });

  it('continua sujeito ao RLS: sem tenant apontado, não enxerga barbeiro', async () => {
    const b = await prismaOwner.barbearia.create({ data: dadosBarbearia('nova') });
    await prismaOwner.barbeiro.create({
      data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
    });
    const todos = await prismaAdminTeste.barbeiro.findMany();
    expect(todos).toHaveLength(0);
  });
});

describe('o papel da aplicação', () => {
  it('brutus_app continua SEM poder criar barbearia', async () => {
    await expect(
      prismaApp.barbearia.create({ data: dadosBarbearia('proibida') }),
    ).rejects.toThrow();
  });

  it('brutus_app continua SEM poder desativar barbearia', async () => {
    const b = await prismaOwner.barbearia.create({ data: dadosBarbearia('nova') });
    await expect(
      prismaApp.barbearia.update({ where: { id: b.id }, data: { ativo: false } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Passo 5: Rodar e ver falhar**

```bash
npm test -- tests/admin-papel.test.ts
```

Esperado: FALHA — o papel `brutus_admin` não existe, a conexão é recusada.

- [ ] **Passo 6: Aplicar nos dois bancos**

```bash
docker compose exec app npx prisma migrate deploy
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
npm test -- tests/admin-papel.test.ts
```

Esperado: PASSA, 7 testes.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Cria o papel brutus_admin sem bypassrls"
```

---

## Tarefa 2: `prismaAdmin` e `comBarbeariaAdmin()`

**Arquivos:**
- Modificar: `src/lib/db.ts`, `src/lib/tenant.ts`
- Modificar: `tests/env.ts`
- Criar: `tests/admin-tenant.test.ts`

**Interfaces:**
- Consome: papel da Tarefa 1.
- Produz:
  - `prismaAdmin: PrismaClient` — `src/lib/db.ts`
  - `comBarbeariaAdmin<T>(barbeariaId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>` — `src/lib/tenant.ts`

- [ ] **Passo 1: Escrever o teste que deve falhar**

`tests/admin-tenant.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { comBarbeariaAdmin } from '@/lib/tenant';

async function duasBarbearias() {
  const a = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
            horarioResumo: 'ter a sáb, 10h–19h', whatsappContato: '11955554444' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: a.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Tony', whatsapp: '11933334444', papel: 'DONO' },
  });
  return { a, b };
}

beforeEach(limparBanco);

describe('comBarbeariaAdmin', () => {
  it('enxerga só o tenant apontado', async () => {
    const { a } = await duasBarbearias();
    const barbeiros = await comBarbeariaAdmin(a.id, (tx) => tx.barbeiro.findMany());
    expect(barbeiros.map((x) => x.nome)).toEqual(['Téo']);
  });

  it('o tenant não sobrevive ao fim da transação', async () => {
    const { a, b } = await duasBarbearias();
    const um = await comBarbeariaAdmin(a.id, (tx) => tx.barbeiro.findMany());
    const dois = await comBarbeariaAdmin(b.id, (tx) => tx.barbeiro.findMany());
    expect(um.map((x) => x.nome)).toEqual(['Téo']);
    expect(dois.map((x) => x.nome)).toEqual(['Tony']);
  });

  it('escreve carimbando o tenant certo', async () => {
    const { a } = await duasBarbearias();
    await comBarbeariaAdmin(a.id, (tx) =>
      tx.barbeiro.create({
        data: { barbeariaId: a.id, nome: 'Rael', whatsapp: '11955556666' },
      }),
    );
    const todos = await prismaOwner.barbeiro.findMany({ where: { barbeariaId: a.id } });
    expect(todos).toHaveLength(2);
  });

  it('recusa escrita carimbada com outro tenant', async () => {
    const { a, b } = await duasBarbearias();
    await expect(
      comBarbeariaAdmin(a.id, (tx) =>
        tx.barbeiro.create({
          data: { barbeariaId: b.id, nome: 'Intruso', whatsapp: '11900000000' },
        }),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Passo 2: Redirecionar a URL de admin nos testes**

Em `tests/env.ts`, junto da linha que já existe:

```ts
process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP_TEST;
process.env.DATABASE_URL_ADMIN = process.env.DATABASE_URL_ADMIN_TEST;
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npm test -- tests/admin-tenant.test.ts
```

Esperado: FALHA — `comBarbeariaAdmin` não existe.

- [ ] **Passo 4: Acrescentar `prismaAdmin` em `src/lib/db.ts`**

Depois do bloco do `prisma` que já existe:

```ts
/// Cliente do admin da plataforma (papel brutus_admin). A ÚNICA coisa que
/// ele pode e o `prisma` acima não é escrever em Barbearia. Continua sujeito
/// ao RLS em toda tabela de tenant — ver comBarbeariaAdmin().
///
/// Vive em singleton próprio porque a URL é outra: dois adapters, duas pools.
const criarAdmin = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_ADMIN }),
  });

const globalAdmin_ = globalThis as unknown as { prismaAdmin?: PrismaClient };

export const prismaAdmin = globalAdmin_.prismaAdmin ?? criarAdmin();
if (process.env.NODE_ENV !== 'production') globalAdmin_.prismaAdmin = prismaAdmin;
```

- [ ] **Passo 5: Acrescentar `comBarbeariaAdmin()` em `src/lib/tenant.ts`**

Ajustar o import e acrescentar, logo depois de `comBarbearia`:

```ts
import { prisma, prismaAdmin } from './db';

/// Igual a comBarbearia(), sobre o cliente do admin.
///
/// O 3º argumento `true` do set_config é is_local pelo mesmo motivo de lá: a
/// variável morre com a TRANSAÇÃO. Com `false`, a conexão voltaria para a
/// pool carregando o último tenant, e a próxima requisição do painel — que
/// percorre TODAS as barbearias — herdaria o tenant errado.
export function comBarbeariaAdmin<T>(
  barbeariaId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prismaAdmin.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.barbearia_id', ${barbeariaId}, true)`;
    return fn(tx);
  });
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -- tests/admin-tenant.test.ts
```

Esperado: PASSA, 4 testes.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Acrescenta o cliente e o escopo de tenant do admin"
```

---

## Tarefa 3: Senha e sessão do admin

**Arquivos:**
- Criar: `src/lib/admin-sessao.ts`, `scripts/hash-senha.ts`
- Modificar: `package.json`, `.env`, `.env.example`, `src/lib/config.ts`
- Criar: `tests/admin-sessao.test.ts`

**Interfaces:**
- Produz, em `src/lib/admin-sessao.ts`:
  - `conferirSenha(usuario: string, senha: string): Promise<boolean>`
  - `emitirSessao(): Promise<string>` — o JWT
  - `lerSessao(jwt: string | undefined): Promise<boolean>` — válido ou não
  - `COOKIE_ADMIN = 'sessao_admin'`

- [ ] **Passo 1: Instalar as dependências**

```bash
npm install jose @node-rs/argon2
```

`jose` porque roda no runtime Edge, onde o `proxy.ts` executa — `jsonwebtoken` não roda (cliente §9.5). `@node-rs/argon2` é binário pronto, não compila no Alpine.

- [ ] **Passo 2: Acrescentar as constantes em `src/lib/config.ts`**

```ts
// Admin da plataforma (§4). Sessão curta: o painel é usado em rajadas de
// minutos para cadastrar uma barbearia, não durante um turno inteiro.
export const ADMIN_SESSAO_HORAS = 2;
export const ADMIN_TRAVA_BASE_MS = 1_000;
export const ADMIN_TRAVA_TETO_MS = 60_000;
```

- [ ] **Passo 3: Escrever o teste que deve falhar**

`tests/admin-sessao.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { conferirSenha, emitirSessao, lerSessao } from '@/lib/admin-sessao';

beforeAll(async () => {
  process.env.ADMIN_USUARIO = 'dono';
  process.env.ADMIN_SENHA_HASH = await hash('senha-longa-de-teste');
  process.env.ADMIN_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-aqui';
});

describe('conferirSenha', () => {
  it('aceita usuário e senha corretos', async () => {
    await expect(conferirSenha('dono', 'senha-longa-de-teste')).resolves.toBe(true);
  });

  it('recusa senha errada', async () => {
    await expect(conferirSenha('dono', 'outra')).resolves.toBe(false);
  });

  it('recusa usuário errado', async () => {
    await expect(conferirSenha('ninguem', 'senha-longa-de-teste')).resolves.toBe(false);
  });

  it('usuário inexistente demora o mesmo que senha errada', async () => {
    const cronometrar = async (fn: () => Promise<unknown>) => {
      const t = performance.now();
      await fn();
      return performance.now() - t;
    };
    const comUsuarioErrado = await cronometrar(() => conferirSenha('ninguem', 'x'));
    const comSenhaErrada = await cronometrar(() => conferirSenha('dono', 'x'));
    // O verify roda nos dois casos; a diferença tem que ser ruído, não sinal.
    const razao = Math.max(comUsuarioErrado, comSenhaErrada) /
                  Math.min(comUsuarioErrado, comSenhaErrada);
    expect(razao).toBeLessThan(3);
  });
});

describe('sessão', () => {
  it('o token emitido é aceito de volta', async () => {
    await expect(lerSessao(await emitirSessao())).resolves.toBe(true);
  });

  it('recusa lixo', async () => {
    await expect(lerSessao('nao-e-um-jwt')).resolves.toBe(false);
  });

  it('recusa ausência de token', async () => {
    await expect(lerSessao(undefined)).resolves.toBe(false);
  });

  it('recusa token assinado com outro segredo', async () => {
    const bom = await emitirSessao();
    process.env.ADMIN_JWT_SECRET = 'um-segredo-completamente-diferente-32b!';
    await expect(lerSessao(bom)).resolves.toBe(false);
  });
});
```

- [ ] **Passo 4: Rodar e ver falhar**

```bash
npm test -- tests/admin-sessao.test.ts
```

Esperado: FALHA — o módulo não existe.

- [ ] **Passo 5: Escrever `src/lib/admin-sessao.ts`**

```ts
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { ADMIN_SESSAO_HORAS } from './config';

export const COOKIE_ADMIN = 'sessao_admin';

/// Hash descartável, contra o qual o verify roda quando o usuário não bate.
/// Sem ele, responder mais rápido para usuário inexistente denuncia qual é o
/// usuário certo, e a resposta genérica vira teatro (cliente §9.5).
const HASH_FANTASMA = hash('nao-e-a-senha-de-ninguem');

const segredo = () => new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);

export async function conferirSenha(usuario: string, senha: string): Promise<boolean> {
  const esperado = process.env.ADMIN_SENHA_HASH;
  const usuarioBate = usuario === process.env.ADMIN_USUARIO;

  // O verify roda SEMPRE, mesmo com usuário errado. É o custo do argon2 que
  // domina o tempo de resposta, então ele precisa acontecer nos dois ramos.
  const hashAlvo = usuarioBate && esperado ? esperado : await HASH_FANTASMA;
  const senhaBate = await verify(hashAlvo, senha).catch(() => false);

  return usuarioBate && senhaBate;
}

export function emitirSessao(): Promise<string> {
  return new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSAO_HORAS}h`)
    .sign(segredo());
}

export async function lerSessao(jwt: string | undefined): Promise<boolean> {
  if (!jwt) return false;
  try {
    const { payload } = await jwtVerify(jwt, segredo());
    return payload.sub === 'admin';
  } catch {
    return false;
  }
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -- tests/admin-sessao.test.ts
```

Esperado: PASSA, 8 testes.

- [ ] **Passo 7: Escrever `scripts/hash-senha.ts`**

```ts
import { hash } from '@node-rs/argon2';

const senha = process.argv[2];
if (!senha) {
  console.error('uso: npm run admin:hash -- "sua senha aqui"');
  process.exit(1);
}
hash(senha).then((h) => {
  console.log('\nCole no .env:\n');
  console.log(`ADMIN_SENHA_HASH='${h}'`);
  console.log('\nAspas SIMPLES: o hash tem $ dentro, e aspas duplas fazem o shell expandir.\n');
});
```

Em `package.json`, nos scripts:

```json
"admin:hash": "tsx scripts/hash-senha.ts"
```

- [ ] **Passo 8: Gerar a credencial e preencher o `.env`**

```bash
npm run admin:hash -- "escolha uma senha longa aqui"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Colar no `.env`; em `.env.example`, as três chaves entram **vazias**:

```
ADMIN_USUARIO=""
ADMIN_SENHA_HASH=""
ADMIN_JWT_SECRET=""
```

Acrescentar ao `environment` do serviço `app` em `docker-compose.yml`:

```yaml
      ADMIN_USUARIO: ${ADMIN_USUARIO}
      ADMIN_SENHA_HASH: ${ADMIN_SENHA_HASH}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
```

- [ ] **Passo 9: Commit**

```bash
git add -A
git commit -m "Adiciona senha e sessao do admin fora do banco"
```

---

## Tarefa 4: Login, logout e trava por IP

**Arquivos:**
- Criar: `src/lib/trava-ip.ts`
- Criar: `src/app/api/admin/auth/login/route.ts`, `src/app/api/admin/auth/logout/route.ts`
- Criar: `tests/admin-login.test.ts`

**Interfaces:**
- Consome: `conferirSenha`, `emitirSessao`, `COOKIE_ADMIN` da Tarefa 3.
- Produz:
  - `esperaDe(ip: string): number` — ms que faltam, 0 se liberado — `src/lib/trava-ip.ts`
  - `registrarFalha(ip: string): void`, `limparFalhas(ip: string): void`, `_zerarTravas(): void`

- [ ] **Passo 1: Escrever o teste que deve falhar**

`tests/admin-login.test.ts`:

```ts
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { esperaDe, registrarFalha, limparFalhas, _zerarTravas } from '@/lib/trava-ip';
import { ADMIN_TRAVA_BASE_MS, ADMIN_TRAVA_TETO_MS } from '@/lib/config';
import { POST as login } from '@/app/api/admin/auth/login/route';

beforeAll(async () => {
  process.env.ADMIN_USUARIO = 'dono';
  process.env.ADMIN_SENHA_HASH = await hash('senha-longa-de-teste');
  process.env.ADMIN_JWT_SECRET = 'segredo-de-teste-com-mais-de-32-bytes-aqui';
});

beforeEach(_zerarTravas);

const pedido = (corpo: unknown, ip = '10.0.0.1') =>
  new Request('http://admin.localhost/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(corpo),
  });

describe('trava por IP', () => {
  it('IP limpo não espera', () => {
    expect(esperaDe('10.0.0.1')).toBe(0);
  });

  it('a espera dobra a cada falha', () => {
    registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeGreaterThan(0);
    expect(esperaDe('10.0.0.1')).toBeLessThanOrEqual(ADMIN_TRAVA_BASE_MS);
    registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeGreaterThan(ADMIN_TRAVA_BASE_MS);
  });

  it('a espera tem teto', () => {
    for (let i = 0; i < 30; i++) registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBeLessThanOrEqual(ADMIN_TRAVA_TETO_MS);
  });

  it('a trava é POR IP: um IP travado não afeta o outro', () => {
    for (let i = 0; i < 5; i++) registrarFalha('10.0.0.1');
    expect(esperaDe('10.0.0.2')).toBe(0);
  });

  it('acerto limpa o contador', () => {
    registrarFalha('10.0.0.1');
    limparFalhas('10.0.0.1');
    expect(esperaDe('10.0.0.1')).toBe(0);
  });
});

describe('POST /api/admin/auth/login', () => {
  it('senha certa devolve 200 e planta o cookie', async () => {
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }));
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('sessao_admin=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('senha errada devolve 401 sem cookie', async () => {
    const r = await login(pedido({ usuario: 'dono', senha: 'errada' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('usuário errado responde a MESMA coisa que senha errada', async () => {
    const a = await login(pedido({ usuario: 'ninguem', senha: 'x' }, '10.0.0.7'));
    const b = await login(pedido({ usuario: 'dono', senha: 'x' }, '10.0.0.8'));
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });

  it('depois de uma falha, o mesmo IP recebe 429', async () => {
    await login(pedido({ usuario: 'dono', senha: 'errada' }, '10.0.0.9'));
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }, '10.0.0.9'));
    expect(r.status).toBe(429);
  });

  it('a trava NÃO derruba a conta: outro IP entra normalmente', async () => {
    for (let i = 0; i < 5; i++) {
      await login(pedido({ usuario: 'dono', senha: 'errada' }, '10.0.0.9'));
    }
    const r = await login(pedido({ usuario: 'dono', senha: 'senha-longa-de-teste' }, '10.0.0.10'));
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/admin-login.test.ts
```

Esperado: FALHA — os módulos não existem.

- [ ] **Passo 3: Escrever `src/lib/trava-ip.ts`**

```ts
import { ADMIN_TRAVA_BASE_MS, ADMIN_TRAVA_TETO_MS } from './config';

/// Espera exponencial por IP para o login do admin (§4).
///
/// Por IP, e não por conta, porque a conta é UMA: travá-la deixaria qualquer
/// um trancar o dono do site fora do próprio painel com cinco requisições.
/// É o oposto da escolha do barbeiro (cliente §9.5), onde a barbearia inteira
/// sai pelo mesmo IP e travar o IP derrubaria a equipe.
///
/// Em memória: some no restart, e cada instância tem a sua. Aceito enquanto
/// o deploy é de instância única — o custo de subir isso para o banco não se
/// paga com uma conta só. Se virar multi-instância, migra para uma tabela.
const falhas = new Map<string, { quantas: number; ultimaEm: number }>();

export function esperaDe(ip: string): number {
  const f = falhas.get(ip);
  if (!f) return 0;
  const atraso = Math.min(ADMIN_TRAVA_BASE_MS * 2 ** (f.quantas - 1), ADMIN_TRAVA_TETO_MS);
  const decorrido = Date.now() - f.ultimaEm;
  return Math.max(0, atraso - decorrido);
}

export function registrarFalha(ip: string): void {
  const f = falhas.get(ip);
  falhas.set(ip, { quantas: (f?.quantas ?? 0) + 1, ultimaEm: Date.now() });
}

export function limparFalhas(ip: string): void {
  falhas.delete(ip);
}

/// Só para teste.
export function _zerarTravas(): void {
  falhas.clear();
}
```

- [ ] **Passo 4: Escrever `src/app/api/admin/auth/login/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { conferirSenha, emitirSessao, COOKIE_ADMIN } from '@/lib/admin-sessao';
import { esperaDe, registrarFalha, limparFalhas } from '@/lib/trava-ip';
import { ADMIN_SESSAO_HORAS } from '@/lib/config';

const ipDe = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido';

export async function POST(req: Request) {
  const ip = ipDe(req);

  const espera = esperaDe(ip);
  if (espera > 0) {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Espera um pouco.' },
      { status: 429, headers: { 'retry-after': String(Math.ceil(espera / 1000)) } },
    );
  }

  const { usuario, senha } = await req.json().catch(() => ({ usuario: '', senha: '' }));

  if (!(await conferirSenha(String(usuario ?? ''), String(senha ?? '')))) {
    registrarFalha(ip);
    // Mesma resposta para usuário inexistente e senha errada.
    return NextResponse.json({ erro: 'usuário ou senha inválidos' }, { status: 401 });
  }

  limparFalhas(ip);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_ADMIN, await emitirSessao(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSAO_HORAS * 3600,
  });
  return resposta;
}
```

- [ ] **Passo 5: Escrever `src/app/api/admin/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { COOKIE_ADMIN } from '@/lib/admin-sessao';

export async function POST() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.delete(COOKIE_ADMIN);
  return resposta;
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -- tests/admin-login.test.ts
```

Esperado: PASSA, 11 testes.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Adiciona login do admin com trava exponencial por IP"
```

---

## Tarefa 5: O host do admin no proxy

**Arquivos:**
- Modificar: `src/lib/slug.ts`, `src/proxy.ts`
- Criar: `tests/admin-proxy.test.ts`

**Interfaces:**
- Produz: `ehHostAdmin(host: string, dominioBase: string): boolean` — `src/lib/slug.ts`

- [ ] **Passo 1: Escrever o teste que deve falhar**

`tests/admin-proxy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ehHostAdmin, extrairSlug } from '@/lib/slug';

describe('ehHostAdmin', () => {
  it('reconhece o host de admin', () => {
    expect(ehHostAdmin('admin.localhost:3000', 'localhost')).toBe(true);
  });

  it('o domínio nu NÃO é admin', () => {
    expect(ehHostAdmin('localhost:3000', 'localhost')).toBe(false);
  });

  it('subdomínio de barbearia NÃO é admin', () => {
    expect(ehHostAdmin('brutus.localhost:3000', 'localhost')).toBe(false);
  });

  it('admin de outro domínio NÃO é admin daqui', () => {
    expect(ehHostAdmin('admin.outrodominio.com', 'localhost')).toBe(false);
  });

  it('o host de admin não resolve tenant nenhum', () => {
    expect(extrairSlug('admin.localhost:3000', 'localhost')).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/admin-proxy.test.ts
```

Esperado: FALHA — `ehHostAdmin` não existe.

- [ ] **Passo 3: Escrever `ehHostAdmin` em `src/lib/slug.ts`**

No fim do arquivo:

```ts
/// `extrairSlug` devolve null para DOIS casos diferentes — domínio nu e
/// subdomínio reservado — e o proxy precisa distingui-los: um serve a
/// institucional, o outro serve o painel de admin.
export function ehHostAdmin(host: string, dominioBase: string): boolean {
  return host.split(':')[0].toLowerCase() === `admin.${dominioBase}`;
}
```

- [ ] **Passo 4: Reescrever `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { extrairSlug, ehHostAdmin } from '@/lib/slug';
import { lerSessao } from '@/lib/admin-sessao';
import { COOKIE_ADMIN } from '@/lib/admin-sessao';

const DOMINIO_BASE = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';

export async function proxy(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const caminho = req.nextUrl.pathname;

  // ---- O host do admin ----
  if (ehHostAdmin(host, DOMINIO_BASE)) {
    const autenticado = await lerSessao(req.cookies.get(COOKIE_ADMIN)?.value);
    const ehLogin = caminho === '/admin/login' || caminho === '/api/admin/auth/login';

    if (!autenticado && !ehLogin) {
      return caminho.startsWith('/api/')
        ? NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
        : NextResponse.redirect(new URL('/admin/login', req.url));
    }
    if (caminho === '/') return NextResponse.rewrite(new URL('/admin', req.url));
    return NextResponse.next();
  }

  // ---- Fora do host do admin, o painel não existe ----
  // A barreira é POSICIONAL: nenhuma rota de admin precisa lembrar de se
  // proteger, porque nenhuma delas é alcançável a partir daqui.
  if (caminho.startsWith('/admin') || caminho.startsWith('/api/admin')) {
    return new NextResponse(null, { status: 404 });
  }

  const slug = extrairSlug(host, DOMINIO_BASE);

  // Domínio nu na raiz: não é tenant nenhum, é a vitrine do produto.
  if (!slug && caminho === '/') {
    return NextResponse.rewrite(new URL('/institucional', req.url));
  }

  const headers = new Headers(req.headers);
  // Apaga o que veio de fora ANTES de escrever o nosso. O header é canal
  // interno: `curl -H "x-barbearia-slug: dontony"` não escolhe tenant.
  headers.delete('x-barbearia-slug');
  if (slug) headers.set('x-barbearia-slug', slug);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Passo 5: Rodar toda a suíte**

```bash
npm test
```

Esperado: PASSA. O proxy virou `async` — se algum teste existente o chamava direto, precisa de `await`.

- [ ] **Passo 6: Conferir no ar**

```bash
docker compose restart app
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: brutus.localhost" http://localhost:3000/api/admin/barbearias
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: admin.localhost"  http://localhost:3000/api/admin/barbearias
```

Esperado: `404` no primeiro (o admin não existe fora do host dele) e `401` no segundo.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Roteia o host de admin e barra o painel fora dele"
```

---

## Tarefa 6: Criar barbearia com o primeiro dono

**Arquivos:**
- Criar: `src/lib/convite.ts`, `src/app/api/admin/barbearias/route.ts`
- Modificar: `src/lib/config.ts`
- Criar: `tests/admin-criar-barbearia.test.ts`

**Interfaces:**
- Consome: `prismaAdmin` (Tarefa 2), `SLUG_REGEX` e `SUBDOMINIOS_RESERVADOS` (config).
- Produz:
  - `gerarConvite(): { token: string; hash: string; expiraEm: Date }` — `src/lib/convite.ts`
  - `hashDe(token: string): string` — usada na Tarefa 8 para buscar pelo hash
  - `POST /api/admin/barbearias` → `201 { id, slug, linkConvite }`

- [ ] **Passo 1: Acrescentar a constante em `src/lib/config.ts`**

```ts
export const CONVITE_VALIDADE_HORAS = 48;
```

- [ ] **Passo 2: Escrever o teste que deve falhar**

`tests/admin-criar-barbearia.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { POST as criar } from '@/app/api/admin/barbearias/route';

beforeEach(limparBanco);

const corpoValido = {
  slug: 'novabarbearia', nome: 'Nova Barbearia', endereco: 'Rua Um, 1',
  horarioResumo: 'seg a sex, 9h-18h', whatsappContato: '11900000000',
  donoNome: 'Zé', donoWhatsapp: '11911112222',
};

const pedido = (corpo: unknown) =>
  new Request('http://admin.localhost/api/admin/barbearias', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });

describe('POST /api/admin/barbearias', () => {
  it('cria a barbearia e devolve o link de convite', async () => {
    const r = await criar(pedido(corpoValido));
    expect(r.status).toBe(201);
    const corpo = await r.json();
    expect(corpo.slug).toBe('novabarbearia');
    expect(corpo.linkConvite).toContain('novabarbearia.');
  });

  it('a barbearia nasce com exatamente um DONO, sem senha', async () => {
    await criar(pedido(corpoValido));
    const barbeiros = await prismaOwner.barbeiro.findMany();
    expect(barbeiros).toHaveLength(1);
    expect(barbeiros[0].papel).toBe('DONO');
    expect(barbeiros[0].senhaHash).toBeNull();
    expect(barbeiros[0].conviteTokenHash).not.toBeNull();
    expect(barbeiros[0].conviteExpiraEm!.getTime()).toBeGreaterThan(Date.now());
  });

  it('guarda só o HASH do convite, nunca o token em claro', async () => {
    const r = await criar(pedido(corpoValido));
    const { linkConvite } = await r.json();
    const token = linkConvite.split('/').pop();
    const [barbeiro] = await prismaOwner.barbeiro.findMany();
    expect(barbeiro.conviteTokenHash).not.toBe(token);
  });

  it('recusa slug repetido com 409', async () => {
    await criar(pedido(corpoValido));
    const r = await criar(pedido(corpoValido));
    expect(r.status).toBe(409);
  });

  it('recusa slug reservado', async () => {
    const r = await criar(pedido({ ...corpoValido, slug: 'admin' }));
    expect(r.status).toBe(422);
  });

  it('recusa slug fora do formato', async () => {
    const r = await criar(pedido({ ...corpoValido, slug: 'NÃO VALE' }));
    expect(r.status).toBe(422);
  });

  it('falha ao criar o dono NÃO deixa barbearia órfã', async () => {
    // whatsapp vazio viola a validação; a barbearia não pode sobrar.
    const r = await criar(pedido({ ...corpoValido, donoWhatsapp: '' }));
    expect(r.status).toBe(422);
    expect(await prismaOwner.barbearia.findMany()).toHaveLength(0);
  });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npm test -- tests/admin-criar-barbearia.test.ts
```

Esperado: FALHA — a rota não existe.

- [ ] **Passo 4: Escrever `src/lib/convite.ts`**

```ts
import { randomBytes, createHash } from 'node:crypto';
import { CONVITE_VALIDADE_HORAS } from './config';

/// Guardar só o hash do convite pelo mesmo motivo que se guarda só o hash da
/// senha: quem ler o banco não ganha acesso a conta nenhuma (cliente §9.5).
///
/// SHA-256 aqui, e não argon2: o token tem 32 bytes aleatórios, então não há
/// o que adivinhar por força bruta — o alongamento de chave do argon2 existe
/// para senhas escolhidas por gente, que têm pouca entropia.
export function gerarConvite(): { token: string; hash: string; expiraEm: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashDe(token),
    expiraEm: new Date(Date.now() + CONVITE_VALIDADE_HORAS * 3600_000),
  };
}

export const hashDe = (token: string) =>
  createHash('sha256').update(token).digest('hex');

```

Não há função de comparação aqui de propósito: a busca é feita pelo hash
direto na consulta (`where: { conviteTokenHash: hashDe(token) }`), o que
delega a comparação ao índice do Postgres. Uma comparação em tempo constante
no código só faria sentido se o hash já estivesse em mãos — e aí o token
também estaria.
```

- [ ] **Passo 5: Escrever `src/app/api/admin/barbearias/route.ts`**

```ts
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
    return NextResponse.json({ erro: `O slug "${slug}" já está em uso.` }, { status: 409 });
  }

  const convite = gerarConvite();

  // UMA transação. Se o dono falhar, a barbearia NÃO pode sobrar: barbearia
  // sem dono é órfã — ninguém entra nela para cadastrar ninguém.
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
    // Em claro UMA vez só: não existe jeito de recuperá-lo depois.
    linkConvite: `http://${slug}.${base}:3000/convite/${convite.token}`,
  }, { status: 201 });
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -- tests/admin-criar-barbearia.test.ts
```

Esperado: PASSA, 7 testes.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Cria barbearia e o primeiro dono numa transacao so"
```

---

## Tarefa 7: Listar, ativar e desativar

**Arquivos:**
- Modificar: `src/app/api/admin/barbearias/route.ts` (acrescentar `GET`)
- Criar: `src/app/api/admin/barbearias/[id]/route.ts`
- Criar: `tests/admin-listar.test.ts`

**Interfaces:**
- Produz:
  - `GET /api/admin/barbearias` → `{ barbearias: { id, slug, nome, ativo, barbeiros, agendamentos }[] }`
  - `PATCH /api/admin/barbearias/[id]` com `{ ativo: boolean }`

- [ ] **Passo 1: Escrever o teste que deve falhar**

`tests/admin-listar.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { GET as listar } from '@/app/api/admin/barbearias/route';
import { PATCH as alterar } from '@/app/api/admin/barbearias/[id]/route';

async function cenario() {
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Rael', whatsapp: '11933334444' },
  });
  return b;
}

beforeEach(limparBanco);

describe('GET /api/admin/barbearias', () => {
  it('lista com a contagem de barbeiros', async () => {
    await cenario();
    const { barbearias } = await (await listar()).json();
    expect(barbearias).toHaveLength(1);
    expect(barbearias[0].slug).toBe('brutus');
    expect(barbearias[0].barbeiros).toBe(2);
  });

  it('lista barbearia inativa também — é o painel de quem administra', async () => {
    const b = await cenario();
    await prismaOwner.barbearia.update({ where: { id: b.id }, data: { ativo: false } });
    const { barbearias } = await (await listar()).json();
    expect(barbearias[0].ativo).toBe(false);
  });
});

describe('PATCH /api/admin/barbearias/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const pedido = (ativo: boolean) =>
    new Request('http://admin.localhost/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ativo }),
    });

  it('desativa', async () => {
    const b = await cenario();
    const r = await alterar(pedido(false), params(b.id));
    expect(r.status).toBe(200);
    const depois = await prismaOwner.barbearia.findUnique({ where: { id: b.id } });
    expect(depois!.ativo).toBe(false);
  });

  it('reativa', async () => {
    const b = await cenario();
    await alterar(pedido(false), params(b.id));
    await alterar(pedido(true), params(b.id));
    const depois = await prismaOwner.barbearia.findUnique({ where: { id: b.id } });
    expect(depois!.ativo).toBe(true);
  });

  it('id inexistente devolve 404', async () => {
    const r = await alterar(pedido(false), params('00000000-0000-0000-0000-000000000000'));
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/admin-listar.test.ts
```

Esperado: FALHA — `GET` e `PATCH` não existem.

- [ ] **Passo 3: Acrescentar o `GET` em `src/app/api/admin/barbearias/route.ts`**

No topo, junto dos imports que já estão lá:

```ts
import { comBarbeariaAdmin } from '@/lib/tenant';
```

E, antes do `POST`:

```ts
export async function GET() {
  const barbearias = await prismaAdmin.barbearia.findMany({ orderBy: { criadoEm: 'asc' } });

  // Tenant a tenant, e não numa agregação só: brutus_admin está sujeito ao
  // RLS, então um count() global devolveria zero. Mesmo laço que a rota de
  // lembretes usa. N é o número de barbearias — dezenas, não milhões.
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
```

- [ ] **Passo 4: Escrever `src/app/api/admin/barbearias/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prismaAdmin } from '@/lib/db';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ativo } = await req.json().catch(() => ({ ativo: undefined }));

  if (typeof ativo !== 'boolean') {
    return NextResponse.json({ erro: 'Informe ativo: true ou false.' }, { status: 422 });
  }

  const alteradas = await prismaAdmin.barbearia.updateMany({ where: { id }, data: { ativo } });
  if (alteradas.count === 0) {
    return NextResponse.json({ erro: 'Barbearia não encontrada.' }, { status: 404 });
  }

  // O cache de slug→Barbearia guarda o tenant por TTL_CACHE_TENANT_MS. Uma
  // barbearia desativada leva até um minuto para sair do ar, e o efeito é
  // por instância. Documentado no §6.3 — é tolerância aceita, não bug.
  return NextResponse.json({ ok: true });
}
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -- tests/admin-listar.test.ts
```

Esperado: PASSA, 5 testes.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "Lista barbearias contando tenant a tenant e liga o interruptor"
```

---

## Tarefa 8: Reemitir o convite e o dono definir a senha

**Arquivos:**
- Criar: `src/app/api/admin/barbearias/[id]/convite/route.ts`
- Criar: `src/app/api/auth/convite/[token]/route.ts`
- Criar: `tests/admin-convite.test.ts`

**Interfaces:**
- Consome: `gerarConvite`, `conferirConvite`, `hashDe` (Tarefa 6).
- Produz:
  - `POST /api/admin/barbearias/[id]/convite` → `{ linkConvite }`
  - `POST /api/auth/convite/[token]` com `{ senha }` → define a senha do dono

**Nota de escopo:** a segunda rota pertence ao cliente §9.5 (Etapa 2). Entra aqui porque sem ela o dono criado pelo painel não tem como definir senha — o painel entregaria contas inutilizáveis.

- [ ] **Passo 1: Escrever o teste que deve falhar**

`tests/admin-convite.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { verify } from '@node-rs/argon2';
import { prismaOwner, limparBanco } from './setup';
import { POST as reemitir } from '@/app/api/admin/barbearias/[id]/convite/route';
import { POST as definirSenha } from '@/app/api/auth/convite/[token]/route';
import { gerarConvite } from '@/lib/convite';

async function barbeariaComDono() {
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const convite = gerarConvite();
  const dono = await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO',
            senhaHash: null, conviteTokenHash: convite.hash, conviteExpiraEm: convite.expiraEm },
  });
  return { b, dono, token: convite.token };
}

beforeEach(limparBanco);

const paramsId = (id: string) => ({ params: Promise.resolve({ id }) });
const paramsToken = (token: string) => ({ params: Promise.resolve({ token }) });
const pedidoSenha = (senha: string) =>
  new Request('http://brutus.localhost/x', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ senha }),
  });

describe('POST /api/admin/barbearias/[id]/convite', () => {
  it('reemite e invalida o token anterior', async () => {
    const { b, token: antigo } = await barbeariaComDono();
    const r = await reemitir(new Request('http://admin.localhost/x', { method: 'POST' }), paramsId(b.id));
    expect(r.status).toBe(200);

    const usarAntigo = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(antigo));
    expect(usarAntigo.status).toBe(404);
  });

  it('derruba a sessão do dono incrementando tokenVersion', async () => {
    const { b, dono } = await barbeariaComDono();
    await reemitir(new Request('http://admin.localhost/x', { method: 'POST' }), paramsId(b.id));
    const depois = await prismaOwner.barbeiro.findUnique({ where: { id: dono.id } });
    expect(depois!.tokenVersion).toBe(dono.tokenVersion + 1);
    expect(depois!.senhaHash).toBeNull();
  });

  it('barbearia inexistente devolve 404', async () => {
    const r = await reemitir(
      new Request('http://admin.localhost/x', { method: 'POST' }),
      paramsId('00000000-0000-0000-0000-000000000000'),
    );
    expect(r.status).toBe(404);
  });
});

describe('POST /api/auth/convite/[token]', () => {
  it('define a senha e zera o convite', async () => {
    const { dono, token } = await barbeariaComDono();
    const r = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(token));
    expect(r.status).toBe(200);

    const depois = await prismaOwner.barbeiro.findUnique({ where: { id: dono.id } });
    expect(depois!.conviteTokenHash).toBeNull();
    expect(await verify(depois!.senhaHash!, 'senha-nova-123')).toBe(true);
  });

  it('o mesmo token não serve duas vezes', async () => {
    const { token } = await barbeariaComDono();
    await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(token));
    const r = await definirSenha(pedidoSenha('outra-senha-456'), paramsToken(token));
    expect(r.status).toBe(404);
  });

  it('token expirado é recusado', async () => {
    const { dono, token } = await barbeariaComDono();
    await prismaOwner.barbeiro.update({
      where: { id: dono.id }, data: { conviteExpiraEm: new Date(Date.now() - 1000) },
    });
    const r = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken(token));
    expect(r.status).toBe(404);
  });

  it('token inventado é recusado', async () => {
    await barbeariaComDono();
    const r = await definirSenha(pedidoSenha('senha-nova-123'), paramsToken('inventado'));
    expect(r.status).toBe(404);
  });

  it('senha curta demais é recusada', async () => {
    const { token } = await barbeariaComDono();
    const r = await definirSenha(pedidoSenha('123'), paramsToken(token));
    expect(r.status).toBe(422);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/admin-convite.test.ts
```

Esperado: FALHA — as rotas não existem.

- [ ] **Passo 3: Acrescentar a constante em `src/lib/config.ts`**

```ts
export const SENHA_MINIMA = 8;
```

- [ ] **Passo 4: Escrever `src/app/api/admin/barbearias/[id]/convite/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prismaAdmin } from '@/lib/db';
import { comBarbeariaAdmin } from '@/lib/tenant';
import { gerarConvite } from '@/lib/convite';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const barbearia = await prismaAdmin.barbearia.findUnique({ where: { id } });
  if (!barbearia) {
    return NextResponse.json({ erro: 'Barbearia não encontrada.' }, { status: 404 });
  }

  const convite = gerarConvite();

  const dono = await comBarbeariaAdmin(barbearia.id, async (tx) => {
    const atual = await tx.barbeiro.findFirst({
      where: { papel: 'DONO', ativo: true }, orderBy: { criadoEm: 'asc' },
    });
    if (!atual) return null;
    await tx.barbeiro.update({
      where: { id: atual.id },
      data: {
        senhaHash: null,
        conviteTokenHash: convite.hash,
        conviteExpiraEm: convite.expiraEm,
        // Derruba na hora qualquer sessão ativa. Sem isso, quem tomou a
        // conta continuaria dentro por até 12h depois do reset.
        tokenVersion: { increment: 1 },
      },
    });
    return atual;
  });

  if (!dono) {
    return NextResponse.json({ erro: 'Essa barbearia não tem dono ativo.' }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';
  return NextResponse.json({
    linkConvite: `http://${barbearia.slug}.${base}:3000/convite/${convite.token}`,
  });
}
```

- [ ] **Passo 5: Escrever `src/app/api/auth/convite/[token]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { hash } from '@node-rs/argon2';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { hashDe } from '@/lib/convite';
import { SENHA_MINIMA } from '@/lib/config';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { senha } = await req.json().catch(() => ({ senha: '' }));

  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    return NextResponse.json(
      { erro: `A senha precisa de ao menos ${SENHA_MINIMA} caracteres.` },
      { status: 422 },
    );
  }

  const barbearia = await barbeariaDaRequisicao(req);

  // Busca pelo HASH, nunca pelo token: é o hash que está no banco.
  const ok = await comBarbearia(barbearia.id, async (tx) => {
    const barbeiro = await tx.barbeiro.findFirst({
      where: { conviteTokenHash: hashDe(token), conviteExpiraEm: { gt: new Date() } },
    });
    if (!barbeiro) return false;
    await tx.barbeiro.update({
      where: { id: barbeiro.id },
      data: { senhaHash: await hash(senha), conviteTokenHash: null, conviteExpiraEm: null },
    });
    return true;
  });

  // 404 e não 403: um token inválido não pode revelar se existe convite algum.
  if (!ok) return NextResponse.json({ erro: 'Convite inválido ou vencido.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -- tests/admin-convite.test.ts
```

Esperado: PASSA, 9 testes.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Reemite convite do dono e deixa ele definir a senha"
```

---

## Tarefa 9: As telas do admin

**Arquivos:**
- Criar: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/login/page.tsx`
- Criar: `src/components/admin/FormLogin.tsx`, `src/components/admin/ListaBarbearias.tsx`, `src/components/admin/FormBarbearia.tsx`
- Criar: `src/app/convite/[token]/page.tsx`, `src/components/DefinirSenha.tsx`

**Interfaces:**
- Consome: todas as rotas das Tarefas 4, 6, 7 e 8; primitivos de `@/components/wf`.

- [ ] **Passo 1: Escrever o layout do admin**

`src/app/admin/layout.tsx`:

```tsx
import { Frame, Lbl } from '@/components/wf';

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  return (
    <Frame largo>
      <div className="flex justify-between items-baseline">
        <h1 className="text-[17px] md:text-2xl font-normal m-0">admin</h1>
        <Lbl>plataforma</Lbl>
      </div>
      {children}
    </Frame>
  );
}
```

- [ ] **Passo 2: Escrever a tela de login**

`src/app/admin/login/page.tsx`:

```tsx
import { FormLogin } from '@/components/admin/FormLogin';

export default function Login() {
  return <FormLogin />;
}
```

`src/components/admin/FormLogin.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';

export function FormLogin() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await fetch('/api/admin/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usuario, senha }),
    });
    if (r.ok) { window.location.href = '/admin'; return; }
    setErro((await r.json()).erro);
    setEnviando(false);
  }

  return (
    <>
      <Lbl>entrar</Lbl>
      <Box variante={usuario ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="usuário"
               value={usuario} onChange={(e) => setUsuario(e.target.value)} />
      </Box>
      <Box variante={senha ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" type="password" placeholder="senha"
               value={senha} onChange={(e) => setSenha(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && entrar()} />
      </Box>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={usuario && senha && !enviando ? 'fill' : 'mut'}
           className="cursor-pointer" onClick={entrar}>entrar</Box>
    </>
  );
}
```

- [ ] **Passo 3: Escrever a tela principal**

`src/app/admin/page.tsx`:

```tsx
import { ListaBarbearias } from '@/components/admin/ListaBarbearias';
import { FormBarbearia } from '@/components/admin/FormBarbearia';
import { Sep } from '@/components/wf';

export default function Admin() {
  return (
    <>
      <ListaBarbearias />
      <Sep />
      <FormBarbearia />
    </>
  );
}
```

- [ ] **Passo 4: Escrever a lista**

`src/components/admin/ListaBarbearias.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';

type Barbearia = {
  id: string; slug: string; nome: string; ativo: boolean;
  barbeiros: number; agendamentos: number;
};

export function ListaBarbearias() {
  const [barbearias, setBarbearias] = useState<Barbearia[]>([]);
  const [link, setLink] = useState('');

  const carregar = () =>
    fetch('/api/admin/barbearias').then((r) => r.json()).then((d) => setBarbearias(d.barbearias));

  useEffect(() => { carregar(); }, []);

  async function alternar(b: Barbearia) {
    await fetch(`/api/admin/barbearias/${b.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ativo: !b.ativo }),
    });
    carregar();
  }

  async function reemitir(b: Barbearia) {
    const r = await fetch(`/api/admin/barbearias/${b.id}/convite`, { method: 'POST' });
    const d = await r.json();
    setLink(r.ok ? d.linkConvite : d.erro);
  }

  return (
    <>
      <Lbl>barbearias no ar</Lbl>
      {barbearias.length === 0 && <Sub>nenhuma ainda</Sub>}
      {barbearias.map((b) => (
        <Box key={b.id} variante={b.ativo ? 'normal' : 'mut'}
             className="flex flex-wrap gap-2 justify-between items-center">
          <span>{b.nome} · <Lbl className="inline">{b.slug}</Lbl></span>
          <Lbl>{b.barbeiros} barbeiros · {b.agendamentos} agendamentos</Lbl>
          <div className="flex gap-2">
            <Chip onClick={() => alternar(b)}>{b.ativo ? 'desativar' : 'reativar'}</Chip>
            <Chip acento onClick={() => reemitir(b)}>novo convite</Chip>
          </div>
        </Box>
      ))}
      {link && (
        <Box variante="dash" className="break-all">
          <Lbl>manda esse link pro dono — ele só aparece uma vez</Lbl>
          {link}
        </Box>
      )}
    </>
  );
}
```

- [ ] **Passo 5: Escrever o formulário de criação**

`src/components/admin/FormBarbearia.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';

const CAMPOS = [
  { chave: 'slug',            rotulo: 'slug (vira o subdomínio)' },
  { chave: 'nome',            rotulo: 'nome da barbearia' },
  { chave: 'endereco',        rotulo: 'endereço' },
  { chave: 'horarioResumo',   rotulo: 'horário (ex: seg a sáb, 9h–20h)' },
  { chave: 'whatsappContato', rotulo: 'WhatsApp da barbearia' },
  { chave: 'donoNome',        rotulo: 'nome do dono' },
  { chave: 'donoWhatsapp',    rotulo: 'WhatsApp do dono' },
] as const;

export function FormBarbearia() {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [link, setLink] = useState('');

  const completo = CAMPOS.every((c) => (dados[c.chave] ?? '').trim());

  async function criar() {
    setErro(''); setLink('');
    const r = await fetch('/api/admin/barbearias', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dados),
    });
    const corpo = await r.json();
    if (!r.ok) { setErro(corpo.erro); return; }
    setLink(corpo.linkConvite);
    setDados({});
  }

  return (
    <>
      <Lbl>nova barbearia</Lbl>
      {CAMPOS.map((c) => (
        <Box key={c.chave} variante={dados[c.chave] ? 'normal' : 'dash'}>
          <input className="w-full outline-none bg-transparent" placeholder={c.rotulo}
                 value={dados[c.chave] ?? ''}
                 onChange={(e) => setDados({ ...dados, [c.chave]: e.target.value })} />
        </Box>
      ))}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={completo ? 'fill' : 'mut'} className="cursor-pointer" onClick={criar}>
        criar barbearia
      </Box>
      {link && (
        <Box variante="dash" className="break-all">
          <Lbl>link de convite do dono — só aparece uma vez</Lbl>
          {link}
        </Box>
      )}
    </>
  );
}
```

- [ ] **Passo 6: Escrever a tela do convite**

`src/app/convite/[token]/page.tsx`:

```tsx
import { Frame, StatusBar } from '@/components/wf';
import { DefinirSenha } from '@/components/DefinirSenha';

export default async function Convite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Frame>
      <StatusBar />
      <h1 className="text-[17px] md:text-2xl font-normal m-0">Criar sua senha</h1>
      <DefinirSenha token={token} />
    </Frame>
  );
}
```

`src/components/DefinirSenha.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';

export function DefinirSenha({ token }: { token: string }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  async function salvar() {
    setErro('');
    const r = await fetch(`/api/auth/convite/${token}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ senha }),
    });
    if (r.ok) { setPronto(true); return; }
    setErro((await r.json()).erro);
  }

  if (pronto) {
    return (
      <>
        <Sub>Senha criada. Já dá pra entrar no painel.</Sub>
        <a href="/painel"><Box variante="fill">ir para o painel</Box></a>
      </>
    );
  }

  return (
    <>
      <Lbl>escolhe uma senha de ao menos 8 caracteres</Lbl>
      <Box variante={senha ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" type="password" placeholder="senha"
               value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Box>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={senha.length >= 8 ? 'fill' : 'mut'} className="cursor-pointer" onClick={salvar}>
        criar senha
      </Box>
    </>
  );
}
```

- [ ] **Passo 7: Conferir no navegador**

```bash
docker compose restart app
```

Abrir `http://admin.localhost:3000` — deve redirecionar para `/admin/login`. Entrar, criar uma barbearia de teste, copiar o link de convite, abrir em aba anônima, definir a senha. Depois desativar a barbearia e conferir que `http://<slug>.localhost:3000` cai em 404 (**até um minuto** depois, pelo cache de tenant).

- [ ] **Passo 8: Commit**

```bash
git add -A
git commit -m "Monta as telas do admin e a tela de convite"
```

---

## Tarefa 10: Fechamento

**Arquivos:**
- Modificar: `README.md`, `.env.example`

- [ ] **Passo 1: Rodar a suíte inteira**

```bash
npm test
```

Esperado: todos os arquivos passam — os 107 da Etapa 1 mais ~51 destas tarefas.

- [ ] **Passo 2: Conferir que o `brutus_app` não regrediu**

```bash
npm test -- tests/admin-papel.test.ts -t "brutus_app"
```

Esperado: PASSA. Este é o teste que impede alguém de "resolver" um erro de permissão dando `GRANT` no papel errado.

- [ ] **Passo 3: Acrescentar a seção ao `README.md`**

````markdown
## Admin da plataforma

`http://admin.localhost:3000` — cria barbearias e o primeiro dono de cada uma.

Antes da primeira vez, gerar a credencial:

```bash
npm run admin:hash -- "uma senha longa"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Colar as duas saídas em `ADMIN_SENHA_HASH` e `ADMIN_JWT_SECRET` no `.env`, e
escolher um `ADMIN_USUARIO`. As três nunca vão para o versionamento.

O painel só existe no host `admin.` — em qualquer subdomínio de barbearia,
`/admin` e `/api/admin/*` respondem 404.

**Desativar uma barbearia leva até um minuto** para fazer efeito: o tenant
fica em cache por `TTL_CACHE_TENANT_MS`.
````

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "Fecha o admin da plataforma com suite verde e README"
```

---

## Autorrevisão

**Cobertura do spec:**

| Seção | Tarefa |
|---|---|
| §2 Os três papéis | 1, 6 (o dono nasce com a barbearia) |
| §3 Onde mora, armadilha do proxy | 5 |
| §4 Credenciais fora do banco, sessão | 3 |
| §4 Força bruta por IP | 4 |
| §5 O terceiro papel do Postgres | 1, 2 |
| §6.1 Criar barbearia + dono | 6 |
| §6.2 Listar | 7 |
| §6.3 Ativar e desativar | 7 |
| §6.4 Reemitir convite | 8 |
| §7 Rotas e telas | 4, 6, 7, 8, 9 |
| §8 Testes | distribuídos |
| §9 Variáveis de ambiente | 1, 3, 10 |

**Lacunas conhecidas e conscientes:**

- A trava por IP vive **em memória**: some no restart e é por instância. Aceito enquanto o deploy for de instância única (§4). Migrar para tabela é aditivo.
- `POST /api/auth/convite/[token]` pertence ao cliente §9.5 (Etapa 2) e foi trazida para a Tarefa 8 porque sem ela o painel entrega contas que ninguém consegue usar. A Etapa 2 herda a rota pronta.
- O link de convite é montado com `http://` e porta `3000`, o que serve para desenvolvimento. Em produção vira `https://` sem porta — uma constante em `config.ts` quando houver deploy.
- Desativar barbearia leva até `TTL_CACHE_TENANT_MS` para valer (§6.3). Documentado no README para não virar bug misterioso.
- O `docker/init-db.sql` só roda em volume novo. Banco existente pega o papel pela migração da Tarefa 1, que tem o `CREATE ROLE` idempotente justamente por isso.
- O §8 do spec pede um teste de que **cookie de barbeiro não abre rota de admin, e vice-versa**. Ele não cabe ainda: a sessão de barbeiro é da Etapa 2 e não existe. O que dá para provar agora — e está na Tarefa 3 — é que um token assinado com outro segredo é recusado, que é o mecanismo por trás daquela garantia. O teste cruzado entra junto com o login do barbeiro.
- A barreira de `/api/admin/*` fora do host de admin é verificada por `curl` na Tarefa 5, não por teste automatizado: ela vive no `proxy.ts`, que o Vitest não executa. As rotas em si são testadas chamando os handlers direto, como o resto da suíte já faz.
