# BRUTUS — Etapa 1 (fluxo do cliente) · Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam `- [ ]` para acompanhamento.

**Objetivo:** entregar o agendamento público de uma barbearia — escolher barbeiro, serviço e horário, confirmar com nome e WhatsApp, e cancelar — sobre uma fundação multi-tenant isolada por Row Level Security do Postgres.

**Arquitetura:** Next.js App Router com Postgres via Prisma. Cada barbearia é um tenant alcançado por subdomínio; o isolamento vive no banco (RLS), não no código. O cálculo de horários livres é uma função pura, sem acesso a banco, testada isoladamente. O visual reproduz o wireframe de origem literalmente, com os valores dele travados como tokens do Tailwind.

**Stack:** Next.js 15 (App Router) · TypeScript · PostgreSQL 16 · Prisma 6 · Tailwind CSS v4 · Vitest · date-fns + date-fns-tz · Docker Compose

**Spec:** `docs/superpowers/specs/2026-08-05-brutus-agendamento-cliente-design.md` — as referências `§N` abaixo apontam para ela.

---

## Restrições globais

Valem para **todas** as tarefas. Copiadas literalmente do spec.

- **Idioma:** todo identificador de domínio, coluna, rota e mensagem de erro em **português** (`Barbeiro`, `duracaoMin`, `barbeariaId`). Sem mistura com inglês no domínio.
- **Fuso:** `America/Sao_Paulo`. Banco guarda UTC. Conversão **só** em `src/lib/datas.ts` — nenhum outro arquivo importa `date-fns-tz`.
- **Duração de serviço:** entre **10 e 60 minutos**, sempre. `DURACAO_MINIMA_MIN = 10`, `DURACAO_MAXIMA_MIN = 60`.
- **Granularidade da grade:** `GRANULARIDADE_MIN = 30`. O passo da grade é **independente** da duração do serviço.
- **Prazo de cancelamento pelo cliente:** 60 minutos antes (`PRAZO_CANCELAMENTO_MIN`).
- **Intervalos são semiabertos `[início, fim)`** em toda comparação, no código e no banco.
- **Nenhum número mágico no código.** Todo valor vem de `src/lib/config.ts`.
- **Dois papéis no Postgres:** `brutus_owner` (migração, ignora RLS) e `brutus_app` (runtime, sujeito a RLS). O `PrismaClient` de runtime usa **`DATABASE_URL_APP`**. Confundir os dois desliga o isolamento inteiro.
- **Toda leitura de dado de tenant acontece dentro de `comBarbearia()`.** Nunca `prisma.<modelo>.findMany()` direto.
- **Toda `@unique` de dado de tenant é composta com `barbeariaId`.** Exceções: `Barbearia.slug` e `Agendamento.codigo`, globais por decisão.
- **A API pública nunca retorna** nome de cliente, telefone de cliente, motivo de bloqueio, nem horário ocupado.
- **Commits em português**, no imperativo, uma linha de assunto ≤ 72 caracteres.
- **Fora de escopo nesta etapa:** login do barbeiro, painel, cadastro de barbearia, preço.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `docker-compose.yml`, `Dockerfile`, `docker/init-db.sql` | ambiente: Postgres com dois papéis + app | 1 |
| `prisma/schema.prisma` | modelo de dados | 2 |
| `prisma/migrations/*_restricoes/migration.sql` | CHECKs, FK compostas, restrição de exclusão | 3 |
| `prisma/migrations/*_rls/migration.sql` | políticas de Row Level Security | 4 |
| `src/lib/config.ts` | toda constante do sistema | 2 |
| `src/lib/db.ts` | `PrismaClient` singleton (papel `brutus_app`) | 4 |
| `src/lib/tenant.ts` | `comBarbearia()` e `barbeariaAtual()` | 4, 10 |
| `prisma/seed.ts` | duas barbearias com dados independentes | 5 |
| `src/lib/datas.ts` | **único** ponto de conversão de fuso | 6 |
| `src/lib/telefone.ts` | normalização e validação de WhatsApp | 7 |
| `src/lib/servicos.ts` | resolve e valida duração por barbeiro+serviço | 8 |
| `src/lib/slots.ts` | motor de horários livres — função pura | 9 |
| `src/middleware.ts` | subdomínio → `x-barbearia-slug` | 10 |
| `src/app/globals.css` | tokens `@theme` do wireframe | 11 |
| `src/components/wf/*` | primitivos visuais do wireframe | 11 |
| `src/app/api/*` | rotas | 12, 14, 15, 20 |
| `src/lib/whatsapp.ts`, `src/lib/mensagens.ts` | Evolution API e textos | 13 |
| `src/app/page.tsx`, `calendario/`, `agendamento/[codigo]/` | telas | 16, 17, 18 |

---

## Tarefa 1: Ambiente Docker com Postgres de dois papéis

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `next.config.ts`, `.dockerignore`
- Criar: `docker-compose.yml`, `Dockerfile`, `docker/init-db.sql`
- Criar: `.env.example`, `.env`
- Criar: `src/app/layout.tsx`, `src/app/page.tsx` (provisória)

**Interfaces:**
- Produz: ambiente onde `docker compose up` sobe Postgres em `localhost:5433` e Next em `localhost:3000`; papéis `brutus_owner` e `brutus_app`; bancos `brutus` e `brutus_test`.

- [ ] **Passo 1: Criar o projeto Next.js**

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*"
```

Responder **não** a Turbopack se perguntar. Confirma que `src/app/`, `tailwind.config` (ou `globals.css` com `@import "tailwindcss"`) e `package.json` existem.

- [ ] **Passo 2: Instalar as dependências do projeto**

```bash
npm install @prisma/client date-fns date-fns-tz nanoid zod
npm install -D prisma vitest @vitejs/plugin-react tsx
```

- [ ] **Passo 3: Escrever `docker/init-db.sql`**

Roda **uma única vez**, quando o volume `pgdata` nasce.

```sql
-- Papel dono: roda migração, é dono das tabelas, IGNORA RLS.
CREATE ROLE brutus_owner LOGIN PASSWORD 'owner';

-- Papel da aplicação: só DML, jamais dono. É sobre ele que o RLS age.
CREATE ROLE brutus_app LOGIN PASSWORD 'app';

CREATE DATABASE brutus      OWNER brutus_owner;
CREATE DATABASE brutus_test OWNER brutus_owner;

\connect brutus
GRANT USAGE ON SCHEMA public TO brutus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_app;

\connect brutus_test
GRANT USAGE ON SCHEMA public TO brutus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_app;
```

`ALTER DEFAULT PRIVILEGES` faz o `GRANT` valer para tabelas que **ainda não existem** — as que o `prisma migrate` vai criar depois. Sem isso, cada migração exigiria um `GRANT` manual, e a tabela esquecida viraria erro de permissão em produção.

- [ ] **Passo 4: Escrever `Dockerfile`**

```dockerfile
FROM node:22-alpine AS dev
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS prod
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`openssl` é obrigatório: o engine do Prisma depende dele e a imagem Alpine não traz. A falha resultante não menciona openssl em lugar nenhum.

- [ ] **Passo 5: Escrever `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports: ["5433:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: { context: ., target: dev }
    command: sh -c "npx prisma migrate deploy && npm run dev"
    environment:
      DATABASE_URL:     postgresql://brutus_owner:owner@db:5432/brutus
      DATABASE_URL_APP: postgresql://brutus_app:app@db:5432/brutus
      NEXT_PUBLIC_DOMINIO_BASE: localhost
      WATCHPACK_POLLING: "true"
    ports: ["3000:3000"]
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      db: { condition: service_healthy }

volumes:
  pgdata:
```

Quatro detalhes que quebram no Windows se faltarem:
1. `healthcheck` + `service_healthy` — `depends_on` sozinho só espera o contêiner iniciar, não o Postgres aceitar conexão.
2. volumes anônimos em `/app/node_modules` e `/app/.next` — o bind mount `.:/app` sobrepõe a instalação Linux da imagem pela do host.
3. `WATCHPACK_POLLING` — eventos de arquivo do Windows não atravessam o bind mount; sem polling não há hot reload.
4. porta `5433` — não colide com um Postgres já instalado na máquina.

- [ ] **Passo 6: Escrever `.dockerignore`**

```
node_modules
.next
.git
.env
```

- [ ] **Passo 7: Escrever `.env.example` e copiar para `.env`**

```
DATABASE_URL="postgresql://brutus_owner:owner@db:5432/brutus"
DATABASE_URL_APP="postgresql://brutus_app:app@db:5432/brutus"
DATABASE_URL_HOST="postgresql://brutus_owner:owner@localhost:5433/brutus"
DATABASE_URL_APP_HOST="postgresql://brutus_app:app@localhost:5433/brutus"
DATABASE_URL_TEST="postgresql://brutus_owner:owner@localhost:5433/brutus_test"
DATABASE_URL_APP_TEST="postgresql://brutus_app:app@localhost:5433/brutus_test"
NEXT_PUBLIC_DOMINIO_BASE="localhost"
EVOLUTION_API_URL=""
EVOLUTION_INSTANCE=""
EVOLUTION_API_KEY=""
CRON_SECRET=""
```

```bash
cp .env.example .env
```

- [ ] **Passo 8: Subir e verificar**

```bash
docker compose up -d db
docker compose logs db | grep "database system is ready"
```

Esperado: a linha aparece.

```bash
docker compose exec db psql -U brutus_app -d brutus -c "SELECT current_user;"
```

Esperado: `brutus_app`. Se der erro de autenticação, o `init-db.sql` não rodou — `docker compose down -v` e subir de novo.

- [ ] **Passo 9: Commit**

```bash
git add -A
git commit -m "Sobe ambiente Docker com Postgres de dois papeis"
```

---

## Tarefa 2: Schema Prisma e constantes

**Arquivos:**
- Criar: `prisma/schema.prisma`
- Criar: `src/lib/config.ts`
- Criar: `prisma/migrations/*_inicial/` (gerada)

**Interfaces:**
- Produz: modelos `Barbearia`, `Barbeiro`, `Servico`, `BarbeiroServico`, `HorarioTrabalho`, `Bloqueio`, `Cliente`, `Agendamento`; enums `PapelBarbeiro`, `MotivoBloqueio`, `StatusAgendamento`; todas as constantes de `config.ts`.

- [ ] **Passo 1: Escrever `src/lib/config.ts`**

```ts
export const FUSO = 'America/Sao_Paulo';

// Duração de serviço — os dois limites globais (§5.1).
// ATENÇÃO: duplicados no CHECK da migração da Tarefa 3. Mudar aqui exige
// mudar lá. O teste `config-bate-com-banco` falha se divergirem.
export const DURACAO_MINIMA_MIN = 10;
export const DURACAO_MAXIMA_MIN = 60;

// Passo da grade — independente da duração do serviço (§6.2.1).
export const GRANULARIDADE_MIN = 30;

export const ANTECEDENCIA_MINIMA_MIN = 0;
export const PRAZO_CANCELAMENTO_MIN = 60;
export const DIAS_NA_HOME = 2;
export const JANELA_MAXIMA_DIAS = 60;
export const LEMBRETE_ANTECEDENCIA_MIN = 60;

// Multi-tenant (§9.4)
export const SUBDOMINIOS_RESERVADOS = [
  'www', 'api', 'app', 'admin', 'painel', 'static', 'assets', 'cdn', 'mail',
] as const;
export const TTL_CACHE_TENANT_MS = 60_000;
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/;

// Verificação de número no WhatsApp (§10.5)
export const CHECK_NUMERO_TIMEOUT_MS = 3_000;
export const CHECK_NUMERO_TTL_MS = 86_400_000;
export const CHECK_NUMERO_LIMITE_POR_IP_HORA = 10;
```

- [ ] **Passo 2: Escrever `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum PapelBarbeiro     { DONO BARBEIRO }
enum MotivoBloqueio    { ALMOCO FOLGA PESSOAL OUTRO }
enum StatusAgendamento { CONFIRMADO CANCELADO_CLIENTE CANCELADO_BARBEIRO }

/// A tabela de tenant. Única sem barbeariaId e única fora do RLS.
model Barbearia {
  id              String   @id @default(uuid())
  slug            String   @unique
  nome            String
  endereco        String
  horarioResumo   String
  whatsappContato String
  ativo           Boolean  @default(true)
  criadoEm        DateTime @default(now())

  barbeiros       Barbeiro[]
  servicos        Servico[]
  barbeiroServicos BarbeiroServico[]
  horarios        HorarioTrabalho[]
  bloqueios       Bloqueio[]
  clientes        Cliente[]
  agendamentos    Agendamento[]
}

model Barbeiro {
  id               String        @id @default(uuid())
  barbeariaId      String
  nome             String
  whatsapp         String
  papel            PapelBarbeiro @default(BARBEIRO)
  senhaHash        String?
  tokenVersion     Int           @default(0)
  conviteTokenHash String?
  conviteExpiraEm  DateTime?
  tentativasLogin  Int           @default(0)
  bloqueadoAte     DateTime?
  fotoUrl          String?
  ativo            Boolean       @default(true)
  ordem            Int           @default(0)
  desativadoEm     DateTime?
  criadoEm         DateTime      @default(now())

  barbearia        Barbearia     @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  servicos         BarbeiroServico[]
  horarios         HorarioTrabalho[]
  bloqueios        Bloqueio[]
  agendamentos     Agendamento[]

  @@unique([barbeariaId, whatsapp])
  /// Redundante como chave; necessária como alvo das FK compostas (Tarefa 3).
  @@unique([barbeariaId, id])
  @@index([barbeariaId])
}

model Servico {
  id                 String   @id @default(uuid())
  barbeariaId        String
  nome               String
  duracaoMinimaMin   Int
  duracaoSugeridaMin Int
  ativo              Boolean  @default(true)
  ordem              Int      @default(0)

  barbearia    Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  barbeiros    BarbeiroServico[]
  agendamentos Agendamento[]

  @@unique([barbeariaId, nome])
  @@unique([barbeariaId, id])
  @@index([barbeariaId])
}

model BarbeiroServico {
  barbeariaId String
  barbeiroId  String
  servicoId   String
  duracaoMin  Int
  ativo       Boolean @default(true)

  barbearia Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  barbeiro  Barbeiro  @relation(fields: [barbeiroId],  references: [id], onDelete: Cascade)
  servico   Servico   @relation(fields: [servicoId],   references: [id], onDelete: Restrict)

  @@id([barbeiroId, servicoId])
  @@index([barbeariaId])
}

model HorarioTrabalho {
  id            String @id @default(uuid())
  barbeariaId   String
  barbeiroId    String
  diaSemana     Int
  minutosInicio Int
  minutosFim    Int

  barbearia Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  barbeiro  Barbeiro  @relation(fields: [barbeiroId],  references: [id], onDelete: Cascade)

  @@unique([barbeiroId, diaSemana])
  @@index([barbeariaId])
}

model Bloqueio {
  id                 String         @id @default(uuid())
  barbeariaId        String
  barbeiroId         String
  motivo             MotivoBloqueio
  observacao         String?
  repeteSemanalmente Boolean
  diaSemana          Int?
  minutosInicio      Int?
  minutosFim         Int?
  inicio             DateTime?
  fim                DateTime?
  criadoEm           DateTime       @default(now())

  barbearia Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  barbeiro  Barbeiro  @relation(fields: [barbeiroId],  references: [id], onDelete: Cascade)

  @@index([barbeariaId])
  @@index([barbeiroId])
}

model Cliente {
  id          String   @id @default(uuid())
  barbeariaId String
  nome        String
  whatsapp    String
  criadoEm    DateTime @default(now())

  barbearia    Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  agendamentos Agendamento[]

  @@unique([barbeariaId, whatsapp])
  @@unique([barbeariaId, id])
  @@index([barbeariaId])
}

model Agendamento {
  id                String            @id @default(uuid())
  barbeariaId       String
  /// Token de URL pública — único GLOBALMENTE, de propósito (§5.1).
  codigo            String            @unique
  barbeiroId        String
  clienteId         String
  servicoId         String
  servicoNome       String
  inicio            DateTime
  fim               DateTime
  duracaoMin        Int
  status            StatusAgendamento @default(CONFIRMADO)
  criadoEm          DateTime          @default(now())
  canceladoEm       DateTime?
  lembreteEnviadoEm DateTime?

  barbearia Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
  barbeiro  Barbeiro  @relation(fields: [barbeiroId],  references: [id], onDelete: Restrict)
  cliente   Cliente   @relation(fields: [clienteId],   references: [id], onDelete: Restrict)
  servico   Servico   @relation(fields: [servicoId],   references: [id], onDelete: Restrict)

  @@index([barbeariaId])
  @@index([barbeiroId, inicio])
  @@index([clienteId])
  @@index([servicoId])
}
```

- [ ] **Passo 3: Gerar e aplicar a migração**

```bash
docker compose exec app npx prisma migrate dev --name inicial
```

- [ ] **Passo 4: Verificar que as tabelas existem**

```bash
docker compose exec db psql -U brutus_owner -d brutus -c "\dt"
```

Esperado: as 8 tabelas listadas.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Modela o schema Prisma com barbeariaId em toda tabela"
```

---

## Tarefa 3: Restrições que o Prisma não expressa

**Arquivos:**
- Criar: `prisma/migrations/<ts>_restricoes/migration.sql`
- Criar: `tests/setup.ts`, `vitest.config.ts`
- Criar: `tests/restricoes.test.ts`

**Interfaces:**
- Consome: schema da Tarefa 2.
- Produz: `CHECK` de duração e de expediente, FK compostas, restrição de exclusão `agendamento_sem_sobreposicao`. Helper de teste `prismaOwner` exportado de `tests/setup.ts`.

- [ ] **Passo 1: Configurar o Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false, // banco de teste compartilhado
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

`tests/setup.ts`:

```ts
import { PrismaClient } from '@prisma/client';

/// Papel DONO: ignora RLS. Só para montar cenário de teste.
export const prismaOwner = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

/// Papel APP: sujeito ao RLS. É o que o código sob teste usa.
export const prismaApp = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_APP_TEST } },
});

export async function limparBanco() {
  await prismaOwner.$executeRawUnsafe(`
    TRUNCATE TABLE "Agendamento", "Cliente", "Bloqueio", "HorarioTrabalho",
                   "BarbeiroServico", "Servico", "Barbeiro", "Barbearia"
    RESTART IDENTITY CASCADE
  `);
}
```

Adicionar ao `package.json`:

```json
"scripts": {
  "test": "dotenv -e .env -- vitest run",
  "test:watch": "dotenv -e .env -- vitest",
  "seed": "tsx prisma/seed.ts"
}
```

```bash
npm install -D dotenv-cli
```

- [ ] **Passo 2: Preparar o banco de teste**

```bash
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
```

- [ ] **Passo 3: Escrever os testes que devem falhar**

`tests/restricoes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from '@/lib/config';

async function cenario() {
  const barbearia = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
            horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' },
  });
  const barbeiro = await prismaOwner.barbeiro.create({
    data: { barbeariaId: barbearia.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO' },
  });
  const servico = await prismaOwner.servico.create({
    data: { barbeariaId: barbearia.id, nome: 'Corte',
            duracaoMinimaMin: 20, duracaoSugeridaMin: 40 },
  });
  const cliente = await prismaOwner.cliente.create({
    data: { barbeariaId: barbearia.id, nome: 'Marcos', whatsapp: '11977771234' },
  });
  return { barbearia, barbeiro, servico, cliente };
}

function dadosAgendamento(c: Awaited<ReturnType<typeof cenario>>, inicio: Date, duracaoMin: number) {
  return {
    barbeariaId: c.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
    barbeiroId: c.barbeiro.id, clienteId: c.cliente.id, servicoId: c.servico.id,
    servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + duracaoMin * 60_000),
    duracaoMin, status: 'CONFIRMADO' as const,
  };
}

beforeEach(limparBanco);

describe('CHECK de duração', () => {
  it('recusa duração abaixo do mínimo global', async () => {
    const c = await cenario();
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: c.servico.id, duracaoMin: DURACAO_MINIMA_MIN - 1 },
    })).rejects.toThrow();
  });

  it('recusa duração acima do máximo global', async () => {
    const c = await cenario();
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: c.servico.id, duracaoMin: DURACAO_MAXIMA_MIN + 1 },
    })).rejects.toThrow();
  });

  it('aceita exatamente o mínimo e exatamente o máximo', async () => {
    const c = await cenario();
    await expect(prismaOwner.barbeiroServico.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              servicoId: c.servico.id, duracaoMin: DURACAO_MAXIMA_MIN },
    })).resolves.toBeTruthy();
  });
});

describe('CHECK de expediente', () => {
  it('recusa expediente que termina antes de começar', async () => {
    const c = await cenario();
    await expect(prismaOwner.horarioTrabalho.create({
      data: { barbeariaId: c.barbearia.id, barbeiroId: c.barbeiro.id,
              diaSemana: 3, minutosInicio: 1200, minutosFim: 540 },
    })).rejects.toThrow();
  });
});

describe('restrição de exclusão — sobreposição', () => {
  it('recusa sobreposição parcial: 16:00+40min colide com 16:30+30min', async () => {
    const c = await cenario();
    await prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    });
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:30:00Z'), 30),
    })).rejects.toThrow();
  });

  it('aceita encosto exato: 16:00+40min e 16:40+40min convivem', async () => {
    const c = await cenario();
    await prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    });
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:40:00Z'), 40),
    })).resolves.toBeTruthy();
  });

  it('libera o horário quando o agendamento é cancelado', async () => {
    const c = await cenario();
    const primeiro = await prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    });
    await prismaOwner.agendamento.update({
      where: { id: primeiro.id },
      data: { status: 'CANCELADO_CLIENTE', canceladoEm: new Date() },
    });
    await expect(prismaOwner.agendamento.create({
      data: dadosAgendamento(c, new Date('2026-08-05T19:00:00Z'), 40),
    })).resolves.toBeTruthy();
  });
});
```

- [ ] **Passo 4: Rodar e ver falhar**

```bash
npm test -- tests/restricoes.test.ts
```

Esperado: FALHA. Sem as restrições, os `rejects.toThrow()` não disparam.

- [ ] **Passo 5: Escrever a migração**

```bash
docker compose exec app npx prisma migrate dev --name restricoes --create-only
```

Escrever no `migration.sql` gerado:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Limites globais de duração. Os literais 10 e 60 duplicam
-- DURACAO_MINIMA_MIN / DURACAO_MAXIMA_MIN de src/lib/config.ts.
ALTER TABLE "Servico" ADD CONSTRAINT servico_duracao_valida CHECK (
  "duracaoMinimaMin"   BETWEEN 10 AND 60 AND
  "duracaoSugeridaMin" BETWEEN "duracaoMinimaMin" AND 60
);

ALTER TABLE "BarbeiroServico" ADD CONSTRAINT barbeiro_servico_duracao_valida CHECK (
  "duracaoMin" BETWEEN 10 AND 60
);

ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT horario_valido CHECK (
  "minutosInicio" >= 0 AND "minutosFim" <= 1440 AND "minutosFim" > "minutosInicio"
);

-- Bloqueio: exatamente um dos dois conjuntos preenchido (§5.1).
ALTER TABLE "Bloqueio" ADD CONSTRAINT bloqueio_forma_valida CHECK (
  ("repeteSemanalmente" = true
     AND "diaSemana" IS NOT NULL AND "minutosInicio" IS NOT NULL
     AND "minutosFim" IS NOT NULL AND "inicio" IS NULL AND "fim" IS NULL)
  OR
  ("repeteSemanalmente" = false
     AND "inicio" IS NOT NULL AND "fim" IS NOT NULL AND "fim" > "inicio"
     AND "diaSemana" IS NULL AND "minutosInicio" IS NULL AND "minutosFim" IS NULL)
);

-- FK compostas: o barbeariaId denormalizado nunca diverge do dono real.
ALTER TABLE "BarbeiroServico"
  ADD CONSTRAINT bs_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id") ON DELETE CASCADE,
  ADD CONSTRAINT bs_servico_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "servicoId")  REFERENCES "Servico"  ("barbeariaId", "id");

ALTER TABLE "HorarioTrabalho"
  ADD CONSTRAINT ht_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id") ON DELETE CASCADE;

ALTER TABLE "Bloqueio"
  ADD CONSTRAINT bl_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id") ON DELETE CASCADE;

ALTER TABLE "Agendamento"
  ADD CONSTRAINT ag_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id"),
  ADD CONSTRAINT ag_cliente_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "clienteId")  REFERENCES "Cliente"  ("barbeariaId", "id"),
  ADD CONSTRAINT ag_servico_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "servicoId")  REFERENCES "Servico"  ("barbeariaId", "id");

-- A ÚNICA garantia contra dupla marcação (§5.4).
-- Compara INTERVALOS, não instantes: um índice único em (barbeiroId, inicio)
-- deixaria passar 16:00+40min colidindo com 16:30+30min.
ALTER TABLE "Agendamento"
  ADD CONSTRAINT agendamento_sem_sobreposicao
  EXCLUDE USING gist (
    "barbeiroId" WITH =,
    tstzrange("inicio", "fim", '[)') WITH &&
  )
  WHERE (status = 'CONFIRMADO');
```

- [ ] **Passo 6: Aplicar nos dois bancos e rodar os testes**

```bash
docker compose exec app npx prisma migrate deploy
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
npm test -- tests/restricoes.test.ts
```

Esperado: PASSA, 7 testes.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Adiciona CHECKs, FK compostas e restricao de exclusao"
```

---

## Tarefa 4: Row Level Security e `comBarbearia()`

**Arquivos:**
- Criar: `prisma/migrations/<ts>_rls/migration.sql`
- Criar: `src/lib/db.ts`, `src/lib/tenant.ts`
- Criar: `tests/isolamento.test.ts`

**Interfaces:**
- Consome: schema e restrições das Tarefas 2 e 3.
- Produz:
  - `prisma: PrismaClient` (papel `brutus_app`) — `src/lib/db.ts`
  - `comBarbearia<T>(barbeariaId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>` — `src/lib/tenant.ts`

- [ ] **Passo 1: Escrever os testes de isolamento**

`tests/isolamento.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, prismaApp, limparBanco } from './setup';
import { comBarbearia } from '@/lib/tenant';

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
    // Trocar o 3º argumento de set_config para `false` tem que quebrar este teste.
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
  it('toda tabela com barbeariaId tem RLS ligado e ao menos uma política', async () => {
    const semRls = await prismaOwner.$queryRawUnsafe<{ tabela: string }[]>(`
      SELECT c.relname AS tabela
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = c.relname AND column_name = 'barbeariaId')
         AND (c.relrowsecurity = false
              OR NOT EXISTS (SELECT 1 FROM pg_policies
                              WHERE tablename = c.relname))
    `);
    expect(semRls).toEqual([]);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/isolamento.test.ts
```

Esperado: FALHA — `@/lib/tenant` não existe.

- [ ] **Passo 3: Escrever `src/lib/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

/// Runtime SEMPRE usa DATABASE_URL_APP (papel brutus_app, sujeito a RLS).
/// Trocar por DATABASE_URL desliga o isolamento inteiro — o dono ignora RLS.
const criar = () =>
  new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL_APP } },
  });

const global_ = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = global_.prisma ?? criar();
if (process.env.NODE_ENV !== 'production') global_.prisma = prisma;
```

- [ ] **Passo 4: Escrever `src/lib/tenant.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from './db';

/// Executa `fn` com o RLS apontando para `barbeariaId`.
///
/// O 3º argumento `true` de set_config é is_local: a variável morre com a
/// TRANSAÇÃO. Com `false` ela viveria na SESSÃO — e como a conexão volta
/// para a pool, o próximo pedido herdaria este tenant. Vazamento cruzado
/// intermitente, dependente de temporização. Nunca trocar para `false`.
export function comBarbearia<T>(
  barbeariaId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.barbearia_id', ${barbeariaId}, true)`;
    return fn(tx);
  });
}
```

- [ ] **Passo 5: Escrever a migração de RLS**

```bash
docker compose exec app npx prisma migrate dev --name rls --create-only
```

```sql
-- Barbearia fica FORA do RLS: precisa ser lida antes de existir tenant,
-- para traduzir subdomínio em id. Protegida por GRANT, não por política.
REVOKE INSERT, UPDATE, DELETE ON "Barbearia" FROM brutus_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Barbeiro','Servico','BarbeiroServico','HorarioTrabalho',
    'Bloqueio','Cliente','Agendamento'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE aplica a política até ao DONO da tabela. Rede de segurança
    -- para o caso de a aplicação ser apontada para a URL errada.
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      ("barbeariaId" = current_setting('app.barbearia_id', true))
        WITH CHECK ("barbeariaId" = current_setting('app.barbearia_id', true))
    $f$, t);
  END LOOP;
END $$;
```

Três detalhes que carregam o peso:
- **`USING` e `WITH CHECK` juntos** — `USING` filtra o que sai, `WITH CHECK` valida o que entra. Só `USING` deixaria gravar linha carimbada com outro tenant.
- **`true` em `current_setting(..., true)`** é `missing_ok`: sem tenant definido retorna `NULL`, e `coluna = NULL` é falso no RLS. **Zero linhas** — falha fechada.
- **`FORCE`** porque o dono da tabela ignora RLS por padrão.

- [ ] **Passo 6: Aplicar e rodar os testes**

```bash
docker compose exec app npx prisma migrate deploy
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
npm test -- tests/isolamento.test.ts
```

Esperado: PASSA, 11 testes.

- [ ] **Passo 7: Provar que o teste de pool não é decorativo**

Trocar temporariamente `true` por `false` no `set_config` de `src/lib/tenant.ts` e rodar:

```bash
npm test -- tests/isolamento.test.ts -t "não sobrevive"
```

Esperado: **FALHA**. Se passar, o teste está errado. Reverter para `true` e confirmar que volta a passar.

- [ ] **Passo 8: Commit**

```bash
git add -A
git commit -m "Isola tenants com Row Level Security do Postgres"
```

---

## Tarefa 5: Seed com duas barbearias

**Arquivos:**
- Criar: `prisma/seed.ts`

**Interfaces:**
- Consome: schema da Tarefa 2.
- Produz: barbearias `brutus` e `dontony` populadas e independentes.

- [ ] **Passo 1: Escrever `prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient(); // DATABASE_URL — papel dono, sem RLS

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

main().finally(() => prisma.$disconnect());
```

- [ ] **Passo 2: Rodar o seed**

```bash
docker compose exec app npm run seed
```

Esperado: a mensagem final, sem erro. Se o `CHECK` de duração barrar algo, o valor está fora de 10–60.

- [ ] **Passo 3: Verificar as duas barbearias**

```bash
docker compose exec db psql -U brutus_owner -d brutus \
  -c "SELECT slug, nome FROM \"Barbearia\" ORDER BY slug;"
```

Esperado: `brutus` e `dontony`.

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "Popula o seed com duas barbearias independentes"
```

---

## Tarefa 6: Fuso horário

**Arquivos:**
- Criar: `src/lib/datas.ts`
- Criar: `tests/datas.test.ts`

**Interfaces:**
- Produz:
  - `localParaUtc(dia: string, minutos: number): Date`
  - `utcParaLocal(d: Date): { dia: string; minutos: number }`
  - `formatarHora(d: Date): string` — `'16:00'`
  - `formatarDiaLongo(d: Date): string` — `'qua 5 ago'`
  - `diaDeHoje(agora: Date): string` — `'2026-08-05'`
  - `somarDias(dia: string, n: number): string`
  - `diaSemanaDe(dia: string): number` — 0=domingo

- [ ] **Passo 1: Escrever os testes**

`tests/datas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  localParaUtc, utcParaLocal, formatarHora, formatarDiaLongo,
  diaDeHoje, somarDias, diaSemanaDe,
} from '@/lib/datas';

describe('localParaUtc', () => {
  it('16:00 em São Paulo é 19:00 UTC', () => {
    expect(localParaUtc('2026-08-05', 16 * 60).toISOString())
      .toBe('2026-08-05T19:00:00.000Z');
  });

  it('meia-noite local não escorrega de dia', () => {
    expect(localParaUtc('2026-08-05', 0).toISOString())
      .toBe('2026-08-05T03:00:00.000Z');
  });
});

describe('utcParaLocal', () => {
  it('é o inverso de localParaUtc', () => {
    const ida = localParaUtc('2026-08-05', 16 * 60);
    expect(utcParaLocal(ida)).toEqual({ dia: '2026-08-05', minutos: 960 });
  });
});

describe('formatação', () => {
  it('formata a hora local, não a UTC', () => {
    expect(formatarHora(new Date('2026-08-05T19:00:00Z'))).toBe('16:00');
  });

  it('formata o dia longo', () => {
    expect(formatarDiaLongo(new Date('2026-08-05T19:00:00Z'))).toBe('qua 5 ago');
  });
});

describe('navegação de dias', () => {
  it('diaDeHoje usa o fuso local', () => {
    // 02:00 UTC de dia 6 ainda é dia 5 em São Paulo
    expect(diaDeHoje(new Date('2026-08-06T02:00:00Z'))).toBe('2026-08-05');
  });

  it('somarDias atravessa o mês', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('diaSemanaDe devolve 0 para domingo', () => {
    expect(diaSemanaDe('2026-08-09')).toBe(0);
    expect(diaSemanaDe('2026-08-05')).toBe(3);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/datas.test.ts
```

Esperado: FALHA — módulo não existe.

- [ ] **Passo 3: Implementar `src/lib/datas.ts`**

```ts
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FUSO } from './config';

/// ÚNICO arquivo do projeto que importa date-fns-tz.
/// Espalhar conversão de fuso é o jeito mais rápido de produzir bug de
/// agenda que só aparece meses depois.

export function localParaUtc(dia: string, minutos: number): Date {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return fromZonedTime(`${dia}T${h}:${m}:00`, FUSO);
}

export function utcParaLocal(d: Date): { dia: string; minutos: number } {
  const local = toZonedTime(d, FUSO);
  return {
    dia: format(local, 'yyyy-MM-dd'),
    minutos: local.getHours() * 60 + local.getMinutes(),
  };
}

export const formatarHora = (d: Date) => formatInTimeZone(d, FUSO, 'HH:mm');

export const formatarDiaLongo = (d: Date) =>
  formatInTimeZone(d, FUSO, "EEE d MMM", { locale: ptBR }).toLowerCase();

export const diaDeHoje = (agora: Date) => utcParaLocal(agora).dia;

export const somarDias = (dia: string, n: number) =>
  format(addDays(parseISO(`${dia}T12:00:00`), n), 'yyyy-MM-dd');

export const diaSemanaDe = (dia: string) => parseISO(`${dia}T12:00:00`).getDay();
```

`somarDias` e `diaSemanaDe` ancoram ao meio-dia de propósito: às 00:00 qualquer deslocamento de fuso empurraria para o dia anterior.

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/datas.test.ts
```

Esperado: PASSA, 8 testes.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Centraliza conversao de fuso em lib/datas"
```

---

## Tarefa 7: Telefone

**Arquivos:**
- Criar: `src/lib/telefone.ts`, `tests/telefone.test.ts`

**Interfaces:**
- Produz:
  - `normalizar(entrada: string): string | null`
  - `formatar(digitos: string): string`

- [ ] **Passo 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { normalizar, formatar } from '@/lib/telefone';

describe('normalizar', () => {
  it.each([
    ['(11) 9 7777-1234', '11977771234'],
    ['11977771234',      '11977771234'],
    ['+55 11 97777-1234','11977771234'],
    ['5511977771234',    '11977771234'],
    ['(11) 3333-4444',   '1133334444'],
  ])('%s vira %s', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });

  it.each([
    ['119777712', 'curto demais'],
    ['119777712345', 'longo demais'],
    ['0977771234', 'DDD inválido'],
    ['abc', 'texto puro'],
    ['', 'vazio'],
  ])('%s é rejeitado (%s)', (entrada) => {
    expect(normalizar(entrada)).toBeNull();
  });
});

describe('formatar', () => {
  it('formata celular', () => {
    expect(formatar('11977771234')).toBe('(11) 9 7777-1234');
  });
  it('formata fixo', () => {
    expect(formatar('1133334444')).toBe('(11) 3333-4444');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/telefone.test.ts
```

- [ ] **Passo 3: Implementar**

```ts
export function normalizar(entrada: string): string | null {
  let d = (entrada ?? '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return d;
}

export function formatar(digitos: string): string {
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos[2]} ${digitos.slice(3, 7)}-${digitos.slice(7)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/telefone.test.ts
```

Esperado: PASSA, 12 testes.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Valida e normaliza numero de WhatsApp"
```

---

## Tarefa 8: Duração por barbeiro e serviço

**Arquivos:**
- Criar: `src/lib/servicos.ts`, `tests/servicos.test.ts`

**Interfaces:**
- Produz:
  - `validarDuracao(duracaoMin: number, servico: { duracaoMinimaMin: number }): void` — lança `Error` com mensagem em português
  - `ErroDuracao` — classe de erro

- [ ] **Passo 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { validarDuracao } from '@/lib/servicos';
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from '@/lib/config';

const corte = { duracaoMinimaMin: 20 };

describe('validarDuracao', () => {
  it('aceita exatamente o piso do serviço', () => {
    expect(() => validarDuracao(20, corte)).not.toThrow();
  });
  it('recusa um minuto abaixo do piso do serviço', () => {
    expect(() => validarDuracao(19, corte)).toThrow(/pelo menos 20/);
  });
  it('aceita exatamente o mínimo global', () => {
    expect(() => validarDuracao(DURACAO_MINIMA_MIN, { duracaoMinimaMin: 10 })).not.toThrow();
  });
  it('recusa abaixo do mínimo global', () => {
    expect(() => validarDuracao(DURACAO_MINIMA_MIN - 1, { duracaoMinimaMin: 10 })).toThrow();
  });
  it('aceita exatamente o máximo global', () => {
    expect(() => validarDuracao(DURACAO_MAXIMA_MIN, corte)).not.toThrow();
  });
  it('recusa acima do máximo global mesmo com piso baixo', () => {
    expect(() => validarDuracao(DURACAO_MAXIMA_MIN + 1, { duracaoMinimaMin: 10 }))
      .toThrow(/no máximo 60/);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/servicos.test.ts
```

- [ ] **Passo 3: Implementar**

```ts
import { DURACAO_MINIMA_MIN, DURACAO_MAXIMA_MIN } from './config';

export class ErroDuracao extends Error {}

/// Confere os TRÊS limites (§5.1), inclusive os dois que o CHECK do banco
/// já cobre. A redundância é proposital: a mensagem daqui é legível na
/// tela; a do CHECK é um despejo do Postgres.
export function validarDuracao(
  duracaoMin: number,
  servico: { duracaoMinimaMin: number },
): void {
  if (!Number.isInteger(duracaoMin)) {
    throw new ErroDuracao('A duração precisa ser um número inteiro de minutos.');
  }
  if (duracaoMin < DURACAO_MINIMA_MIN) {
    throw new ErroDuracao(`A duração precisa ser de pelo menos ${DURACAO_MINIMA_MIN} minutos.`);
  }
  if (duracaoMin > DURACAO_MAXIMA_MIN) {
    throw new ErroDuracao(`A duração pode ser de no máximo ${DURACAO_MAXIMA_MIN} minutos.`);
  }
  if (duracaoMin < servico.duracaoMinimaMin) {
    throw new ErroDuracao(`Esse serviço precisa de pelo menos ${servico.duracaoMinimaMin} minutos.`);
  }
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/servicos.test.ts
```

Esperado: PASSA, 6 testes.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Valida duracao contra os tres limites"
```

---

## Tarefa 9: Motor de horários livres

**Arquivos:**
- Criar: `src/lib/slots.ts`, `tests/slots.test.ts`

**Interfaces:**
- Produz:
  - `type Slot = { inicio: Date; fim: Date; barbeiroId: string }`
  - `type BloqueioSlot = { repeteSemanalmente: boolean; diaSemana: number | null; minutosInicio: number | null; minutosFim: number | null; inicio: Date | null; fim: Date | null }`
  - `slotsLivres(e: EntradaSlots): Slot[]`
  - `unirSlots(listas: Slot[][], ordemPorBarbeiro: Map<string, number>): Slot[]`

- [ ] **Passo 1: Escrever os testes**

`tests/slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slotsLivres, unirSlots, type EntradaSlots } from '@/lib/slots';
import { localParaUtc, formatarHora } from '@/lib/datas';

const DIA = '2026-08-05'; // quarta-feira
const QUA = 3;

function base(over: Partial<EntradaSlots> = {}): EntradaSlots {
  return {
    barbeiroId: 'teo',
    duracaoMin: 40,
    expediente: [{ diaSemana: QUA, minutosInicio: 9 * 60, minutosFim: 20 * 60 }],
    bloqueios: [],
    agendamentos: [],
    dia: DIA,
    agora: localParaUtc(DIA, 0),
    ...over,
  };
}

const horas = (s: ReturnType<typeof slotsLivres>) => s.map((x) => formatarHora(x.inicio));

describe('expediente', () => {
  it('dia sem expediente devolve vazio', () => {
    expect(slotsLivres(base({ expediente: [] }))).toEqual([]);
  });

  it('barbeiro que não atende na quarta devolve vazio', () => {
    expect(slotsLivres(base({
      expediente: [{ diaSemana: 1, minutosInicio: 540, minutosFim: 1200 }],
    }))).toEqual([]);
  });

  it('gera a grade de 30 em 30 a partir da abertura', () => {
    const r = horas(slotsLivres(base()));
    expect(r.slice(0, 4)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('o passo é a granularidade, não a duração', () => {
    const r = horas(slotsLivres(base({ duracaoMin: 40 })));
    expect(r[1]).toBe('09:30'); // não 09:40
  });

  it('o último slot cabe inteiro no expediente', () => {
    const r = horas(slotsLivres(base({ duracaoMin: 60 })));
    expect(r.at(-1)).toBe('19:00'); // 19:30 + 60min passaria das 20h
  });

  it('duração diferente produz grade diferente', () => {
    const curto = horas(slotsLivres(base({ duracaoMin: 30 })));
    const longo = horas(slotsLivres(base({ duracaoMin: 60 })));
    expect(curto.length).toBeGreaterThan(longo.length);
  });
});

describe('bloqueios', () => {
  it('bloqueio semanal remove os slots do intervalo', () => {
    const r = horas(slotsLivres(base({
      bloqueios: [{ repeteSemanalmente: true, diaSemana: QUA,
                    minutosInicio: 12 * 60, minutosFim: 13 * 60,
                    inicio: null, fim: null }],
    })));
    expect(r).not.toContain('12:00');
    expect(r).not.toContain('12:30');
    expect(r).toContain('13:00');
  });

  it('bloqueio semanal de outro dia da semana não afeta', () => {
    const r = horas(slotsLivres(base({
      bloqueios: [{ repeteSemanalmente: true, diaSemana: 1,
                    minutosInicio: 12 * 60, minutosFim: 13 * 60,
                    inicio: null, fim: null }],
    })));
    expect(r).toContain('12:00');
  });

  it('bloqueio pontual só afeta o dia dele', () => {
    const r = horas(slotsLivres(base({
      bloqueios: [{ repeteSemanalmente: false, diaSemana: null,
                    minutosInicio: null, minutosFim: null,
                    inicio: localParaUtc('2026-08-06', 9 * 60),
                    fim:    localParaUtc('2026-08-06', 11 * 60) }],
    })));
    expect(r).toContain('09:00');
  });
});

describe('agendamentos existentes', () => {
  it('remove os slots que o agendamento cobre', () => {
    const r = horas(slotsLivres(base({
      agendamentos: [{ inicio: localParaUtc(DIA, 9 * 60),
                       fim:    localParaUtc(DIA, 9 * 60 + 40) }],
    })));
    expect(r).not.toContain('09:00');
    expect(r).not.toContain('09:30'); // 09:30+40 invade 09:00–09:40
    expect(r).toContain('10:00');
  });

  it('fronteira semiaberta: quem termina 16:40 não bloqueia 16:40', () => {
    const r = horas(slotsLivres(base({
      duracaoMin: 20,
      agendamentos: [{ inicio: localParaUtc(DIA, 16 * 60),
                       fim:    localParaUtc(DIA, 16 * 60 + 40) }],
    })));
    expect(r).toContain('17:00');
  });

  it('brecha: barba de 30 cabe entre cortes de 40', () => {
    const ags = [
      { inicio: localParaUtc(DIA, 9 * 60),  fim: localParaUtc(DIA, 9 * 60 + 40) },
      { inicio: localParaUtc(DIA, 10 * 60 + 30), fim: localParaUtc(DIA, 11 * 60 + 10) },
    ];
    expect(horas(slotsLivres(base({ duracaoMin: 30, agendamentos: ags })))).toContain('10:00');
    expect(horas(slotsLivres(base({ duracaoMin: 60, agendamentos: ags })))).not.toContain('10:00');
  });

  it('dia inteiro tomado devolve vazio', () => {
    const r = slotsLivres(base({
      agendamentos: [{ inicio: localParaUtc(DIA, 9 * 60),
                       fim:    localParaUtc(DIA, 20 * 60) }],
    }));
    expect(r).toEqual([]);
  });
});

describe('horário que já passou', () => {
  it('com agora no meio do expediente, o passado some', () => {
    const r = horas(slotsLivres(base({ agora: localParaUtc(DIA, 15 * 60) })));
    expect(r).not.toContain('09:00');
    expect(r).toContain('15:00');
    expect(r).toContain('16:00');
  });
});

describe('tanto faz', () => {
  const ordem = new Map([['teo', 0], ['rael', 1]]);

  it('mesmo horário nos dois vira um slot só, do de menor ordem', () => {
    const teo  = slotsLivres(base({ barbeiroId: 'teo',  duracaoMin: 40 }));
    const rael = slotsLivres(base({ barbeiroId: 'rael', duracaoMin: 40 }));
    const u = unirSlots([teo, rael], ordem);
    const noveHoras = u.filter((s) => formatarHora(s.inicio) === '09:00');
    expect(noveHoras).toHaveLength(1);
    expect(noveHoras[0].barbeiroId).toBe('teo');
  });

  it('horário que só um tem aparece atribuído a ele', () => {
    const teo = slotsLivres(base({
      barbeiroId: 'teo', duracaoMin: 40,
      agendamentos: [{ inicio: localParaUtc(DIA, 9 * 60),
                       fim:    localParaUtc(DIA, 9 * 60 + 40) }],
    }));
    const rael = slotsLivres(base({ barbeiroId: 'rael', duracaoMin: 40 }));
    const u = unirSlots([teo, rael], ordem);
    const nove = u.find((s) => formatarHora(s.inicio) === '09:00');
    expect(nove?.barbeiroId).toBe('rael');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/slots.test.ts
```

- [ ] **Passo 3: Implementar `src/lib/slots.ts`**

```ts
import { GRANULARIDADE_MIN, ANTECEDENCIA_MINIMA_MIN } from './config';
import { localParaUtc, diaSemanaDe } from './datas';

export type Slot = { inicio: Date; fim: Date; barbeiroId: string };

export type BloqueioSlot = {
  repeteSemanalmente: boolean;
  diaSemana: number | null;
  minutosInicio: number | null;
  minutosFim: number | null;
  inicio: Date | null;
  fim: Date | null;
};

export type EntradaSlots = {
  barbeiroId: string;
  /// Vem do BarbeiroServico. A função NÃO conhece Servico nem BarbeiroServico.
  duracaoMin: number;
  expediente: { diaSemana: number; minutosInicio: number; minutosFim: number }[];
  bloqueios: BloqueioSlot[];
  agendamentos: { inicio: Date; fim: Date }[];
  dia: string;
  /// Injetado, nunca new Date() interno — senão todo teste de "já passou"
  /// vira refém do relógio da máquina.
  agora: Date;
};

/// Intervalos semiabertos [início, fim): quem termina 16:40 não colide com
/// quem começa 16:40.
const colide = (aIni: Date, aFim: Date, bIni: Date, bFim: Date) =>
  aIni < bFim && aFim > bIni;

export function slotsLivres(e: EntradaSlots): Slot[] {
  const diaSemana = diaSemanaDe(e.dia);
  const jornada = e.expediente.find((h) => h.diaSemana === diaSemana);
  if (!jornada) return []; // barbeiro não declarou expediente nesse dia

  const limite = new Date(e.agora.getTime() + ANTECEDENCIA_MINIMA_MIN * 60_000);

  const intervalosBloqueados = e.bloqueios.flatMap((b) => {
    if (b.repeteSemanalmente) {
      if (b.diaSemana !== diaSemana) return [];
      return [{
        inicio: localParaUtc(e.dia, b.minutosInicio!),
        fim:    localParaUtc(e.dia, b.minutosFim!),
      }];
    }
    return [{ inicio: b.inicio!, fim: b.fim! }];
  });

  const livres: Slot[] = [];
  for (let m = jornada.minutosInicio; m + e.duracaoMin <= jornada.minutosFim; m += GRANULARIDADE_MIN) {
    const inicio = localParaUtc(e.dia, m);
    const fim = new Date(inicio.getTime() + e.duracaoMin * 60_000);

    if (inicio < limite) continue;
    if (intervalosBloqueados.some((b) => colide(inicio, fim, b.inicio, b.fim))) continue;
    if (e.agendamentos.some((a) => colide(inicio, fim, a.inicio, a.fim))) continue;

    livres.push({ inicio, fim, barbeiroId: e.barbeiroId });
  }
  return livres;
}

/// "Tanto faz": une os slots de vários barbeiros. Mesmo horário em dois
/// barbeiros vira um slot só, do de menor `ordem`.
export function unirSlots(listas: Slot[][], ordemPorBarbeiro: Map<string, number>): Slot[] {
  const porInstante = new Map<number, Slot>();
  for (const slot of listas.flat()) {
    const chave = slot.inicio.getTime();
    const atual = porInstante.get(chave);
    if (!atual) { porInstante.set(chave, slot); continue; }
    const a = ordemPorBarbeiro.get(slot.barbeiroId) ?? Number.MAX_SAFE_INTEGER;
    const b = ordemPorBarbeiro.get(atual.barbeiroId) ?? Number.MAX_SAFE_INTEGER;
    if (a < b) porInstante.set(chave, slot);
  }
  return [...porInstante.values()].sort((x, y) => x.inicio.getTime() - y.inicio.getTime());
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/slots.test.ts
```

Esperado: PASSA, 16 testes.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Implementa o motor de horarios livres como funcao pura"
```

---

## Tarefa 10: Resolução de tenant por subdomínio

**Arquivos:**
- Criar: `src/middleware.ts`
- Modificar: `src/lib/tenant.ts` (acrescentar resolução)
- Criar: `src/app/nao-encontrada/page.tsx`
- Criar: `tests/tenant.test.ts`

**Interfaces:**
- Consome: `comBarbearia` da Tarefa 4.
- Produz:
  - `extrairSlug(host: string, dominioBase: string): string | null` — exportada para teste
  - `barbeariaAtual(): Promise<Barbearia>` — lança `notFound()` se não resolver

- [ ] **Passo 1: Escrever os testes de `extrairSlug`**

`tests/tenant.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extrairSlug } from '@/lib/tenant';

describe('extrairSlug', () => {
  it.each([
    ['brutus.seuapp.com.br',      'seuapp.com.br', 'brutus'],
    ['brutus.localhost:3000',     'localhost',     'brutus'],
    ['dontony.localhost',         'localhost',     'dontony'],
  ])('%s → %s', (host, base, esperado) => {
    expect(extrairSlug(host, base)).toBe(esperado);
  });

  it.each([
    ['seuapp.com.br',       'seuapp.com.br', 'domínio nu'],
    ['localhost:3000',      'localhost',     'localhost puro'],
    ['www.seuapp.com.br',   'seuapp.com.br', 'reservado www'],
    ['api.seuapp.com.br',   'seuapp.com.br', 'reservado api'],
    ['painel.seuapp.com.br','seuapp.com.br', 'reservado painel'],
    ['outrodominio.com',    'seuapp.com.br', 'domínio alheio'],
    ['BRUTUS!.localhost',   'localhost',     'slug inválido'],
  ])('%s não resolve (%s)', (host, base) => {
    expect(extrairSlug(host, base)).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/tenant.test.ts
```

- [ ] **Passo 3: Acrescentar a resolução em `src/lib/tenant.ts`**

Adicionar ao final do arquivo (mantendo `comBarbearia` como está):

```ts
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Barbearia } from '@prisma/client';
import { SUBDOMINIOS_RESERVADOS, SLUG_REGEX, TTL_CACHE_TENANT_MS } from './config';

export function extrairSlug(host: string, dominioBase: string): string | null {
  const semPorta = host.split(':')[0].toLowerCase();
  if (semPorta === dominioBase) return null;
  if (!semPorta.endsWith(`.${dominioBase}`)) return null;

  const slug = semPorta.slice(0, -(dominioBase.length + 1));
  if (slug.includes('.')) return null;
  if ((SUBDOMINIOS_RESERVADOS as readonly string[]).includes(slug)) return null;
  if (!SLUG_REGEX.test(slug)) return null;
  return slug;
}

const cacheSlug = new Map<string, { valor: Barbearia | null; expiraEm: number }>();

async function buscarPorSlug(slug: string): Promise<Barbearia | null> {
  const guardado = cacheSlug.get(slug);
  if (guardado && guardado.expiraEm > Date.now()) return guardado.valor;

  // Barbearia está FORA do RLS de propósito: é lida antes de existir tenant.
  const valor = await prisma.barbearia.findFirst({ where: { slug, ativo: true } });
  cacheSlug.set(slug, { valor, expiraEm: Date.now() + TTL_CACHE_TENANT_MS });
  return valor;
}

/// Envolvida em cache() do React: várias chamadas na mesma requisição
/// batem no banco uma vez só.
export const barbeariaAtual = cache(async (): Promise<Barbearia> => {
  const slug = (await headers()).get('x-barbearia-slug');
  if (!slug) notFound();
  const barbearia = await buscarPorSlug(slug);
  if (!barbearia) notFound();
  return barbearia;
});
```

- [ ] **Passo 4: Escrever `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { extrairSlug } from '@/lib/tenant';

const DOMINIO_BASE = process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost';

export function middleware(req: NextRequest) {
  const slug = extrairSlug(req.headers.get('host') ?? '', DOMINIO_BASE);

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

- [ ] **Passo 5: Escrever a página de tenant inexistente**

`src/app/nao-encontrada/page.tsx` e um `not-found.tsx` na raiz:

```tsx
export default function NaoEncontrada() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 40 }}>
      <h1>Essa barbearia não está no ar.</h1>
      <p>Confere o endereço que você digitou.</p>
    </main>
  );
}
```

Copiar o mesmo conteúdo para `src/app/not-found.tsx`.

- [ ] **Passo 6: Rodar os testes**

```bash
npm test -- tests/tenant.test.ts
```

Esperado: PASSA, 10 testes.

- [ ] **Passo 7: Verificar no navegador**

```bash
docker compose up -d
```

Abrir `http://brutus.localhost:3000` e `http://dontony.localhost:3000` — as duas respondem. Abrir `http://naoexiste.localhost:3000` — 404.

- [ ] **Passo 8: Commit**

```bash
git add -A
git commit -m "Resolve tenant pelo subdominio no middleware"
```

---

## Tarefa 11: Tokens do wireframe e primitivos visuais

**Arquivos:**
- Modificar: `src/app/globals.css`
- Modificar: `src/app/layout.tsx`
- Criar: `src/components/wf/{Frame,Box,Chip,Row,Lbl,Sub,Sep,Avatar,StatusBar,index}.tsx`

**Interfaces:**
- Produz: `<Frame>`, `<Box variante>`, `<Chip ativo acento>`, `<Row wrap>`, `<Lbl>`, `<Sub>`, `<Sep>`, `<Avatar tamanho>`, `<StatusBar>` — todos de `@/components/wf`.

- [ ] **Passo 1: Escrever os tokens em `src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  /* traço — cor de toda borda e todo preenchimento sólido */
  --color-traco:      #2a2a2a;
  --color-acento:     #5b46d9;

  /* texto */
  --color-sub:        #777777;
  --color-lbl:        #888888;
  --color-apagado:    #999999;

  /* superfícies e linhas */
  --color-mut:        #efefef;
  --color-mut-borda:  #cccccc;
  --color-linha:      #e2e2e2;
  --color-regua:      #dddddd;

  --radius-wf:        6px;
  --shadow-sel:       2px 2px 0 #2a2a2a;
}

body { background: #f0eee9; }
```

- [ ] **Passo 2: Carregar a fonte em `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Architects_Daughter } from 'next/font/google';
import './globals.css';

const mao = Architects_Daughter({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-mao',
  display: 'swap',
});

export const metadata: Metadata = { title: 'Agendamento' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={mao.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Passo 3: Escrever os primitivos**

`src/components/wf/Frame.tsx`:

```tsx
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[300px] max-w-full mx-auto p-3.5 flex flex-col gap-2.5
                    bg-white text-traco [font-family:var(--font-mao)]">
      {children}
    </div>
  );
}
```

`src/components/wf/Box.tsx`:

```tsx
type Variante = 'normal' | 'dash' | 'fill' | 'sel' | 'mut';

const estilos: Record<Variante, string> = {
  normal: 'bg-white border-traco',
  dash:   'bg-white border-traco border-dashed text-apagado',
  fill:   'bg-traco border-traco text-white text-center py-2.5',
  sel:    'bg-white border-traco border-[2.5px] shadow-[var(--shadow-sel)]',
  mut:    'bg-mut border-mut-borda text-apagado',
};

export function Box({
  variante = 'normal', className = '', children, ...props
}: {
  variante?: Variante;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & { as?: never }) {
  return (
    <div
      className={`border-[1.5px] rounded-wf px-2.5 py-2 text-xs ${estilos[variante]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
```

`src/components/wf/Chip.tsx`:

```tsx
export function Chip({
  ativo = false, acento = false, className = '', children, ...props
}: {
  ativo?: boolean;
  acento?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cor = ativo
    ? 'bg-traco text-white border-traco'
    : acento
      ? 'bg-white border-acento text-acento'
      : 'bg-white border-traco';
  return (
    <button
      type="button"
      className={`border-[1.5px] rounded-full px-2.5 py-1 text-[11px] shrink-0
                  disabled:opacity-45 ${cor} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
```

`src/components/wf/Row.tsx`:

```tsx
export function Row({
  wrap = false, className = '', children,
}: { wrap?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2 ${wrap ? 'flex-wrap' : '[&>*]:flex-1'} ${className}`}>
      {children}
    </div>
  );
}
```

`src/components/wf/Lbl.tsx`:

```tsx
export const Lbl = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[11px] text-lbl ${className}`}>{children}</div>
);

export const Sub = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`text-[11px] text-sub ${className}`}>{children}</div>
);
```

`src/components/wf/Sep.tsx`:

```tsx
export const Sep = () => <div className="h-px bg-linha my-0.5" />;
```

`src/components/wf/Avatar.tsx`:

```tsx
export const Avatar = ({ tamanho = 26 }: { tamanho?: number }) => (
  <div
    className="rounded-full border-[1.5px] border-traco shrink-0"
    style={{ width: tamanho, height: tamanho }}
  />
);
```

`src/components/wf/StatusBar.tsx`:

```tsx
export const StatusBar = () => (
  <div className="flex justify-between text-[9px] text-apagado [font-family:system-ui]">
    <span>9:41</span><span>▮▮▮</span>
  </div>
);
```

`src/components/wf/index.ts`:

```ts
export { Frame } from './Frame';
export { Box } from './Box';
export { Chip } from './Chip';
export { Row } from './Row';
export { Lbl, Sub } from './Lbl';
export { Sep } from './Sep';
export { Avatar } from './Avatar';
export { StatusBar } from './StatusBar';
```

- [ ] **Passo 4: Verificar visualmente**

Substituir temporariamente `src/app/page.tsx` por uma vitrine com um de cada primitivo e abrir `http://brutus.localhost:3000`. Conferir contra o wireframe: borda fina, cantos levemente arredondados, fonte manuscrita, `sel` com sombra sólida deslocada.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Porta os tokens e primitivos visuais do wireframe"
```

---

## Tarefa 12: Rotas de leitura — barbeiros, serviços, horários

**Arquivos:**
- Criar: `src/lib/agenda.ts`
- Criar: `src/app/api/barbeiros/route.ts`, `src/app/api/servicos/route.ts`,
  `src/app/api/horarios/route.ts`, `src/app/api/dias-com-vaga/route.ts`
- Criar: `tests/api-leitura.test.ts`

**Interfaces:**
- Consome: `comBarbearia`, `barbeariaAtual`, `slotsLivres`, `unirSlots`.
- Produz: `slotsDoDia(tx, barbeariaId, barbeiroId | 'qualquer', servicoId, dia, agora): Promise<Slot[]>` em `src/lib/agenda.ts`.

- [ ] **Passo 1: Escrever os testes**

`tests/api-leitura.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { localParaUtc, formatarHora } from '@/lib/datas';

const DIA = '2026-08-05'; // quarta
let ctx: Awaited<ReturnType<typeof montar>>;

async function montar() {
  const b = await prismaOwner.barbearia.create({
    data: { slug: 'brutus', nome: 'BRUTUS', endereco: 'x',
            horarioResumo: 'y', whatsappContato: '11988887777' },
  });
  const corte = await prismaOwner.servico.create({
    data: { barbeariaId: b.id, nome: 'Corte', duracaoMinimaMin: 20, duracaoSugeridaMin: 40 },
  });
  const pezinho = await prismaOwner.servico.create({
    data: { barbeariaId: b.id, nome: 'Pezinho', duracaoMinimaMin: 10, duracaoSugeridaMin: 15 },
  });
  const teo = await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Téo', whatsapp: '11911112222', papel: 'DONO', ordem: 0 },
  });
  const rael = await prismaOwner.barbeiro.create({
    data: { barbeariaId: b.id, nome: 'Rael', whatsapp: '11933334444', ordem: 1 },
  });
  for (const [barbeiro, servico, min] of [
    [teo, corte, 40], [teo, pezinho, 15], [rael, corte, 30],
  ] as const) {
    await prismaOwner.barbeiroServico.create({
      data: { barbeariaId: b.id, barbeiroId: barbeiro.id, servicoId: servico.id, duracaoMin: min },
    });
  }
  for (const barbeiro of [teo, rael]) {
    await prismaOwner.horarioTrabalho.create({
      data: { barbeariaId: b.id, barbeiroId: barbeiro.id, diaSemana: 3,
              minutosInicio: 9 * 60, minutosFim: 20 * 60 },
    });
  }
  return { b, corte, pezinho, teo, rael };
}

beforeEach(async () => { await limparBanco(); ctx = await montar(); });

describe('slotsDoDia', () => {
  it('usa a duração do barbeiro escolhido', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, ctx.rael.id, ctx.corte.id, DIA, localParaUtc(DIA, 0)));
    expect(s.every((x) => x.fim.getTime() - x.inicio.getTime() === 30 * 60_000)).toBe(true);
  });

  it('"qualquer" ignora quem não faz o serviço', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, 'qualquer', ctx.pezinho.id, DIA, localParaUtc(DIA, 0)));
    expect(new Set(s.map((x) => x.barbeiroId))).toEqual(new Set([ctx.teo.id]));
  });

  it('"qualquer" atribui ao de menor ordem quando os dois têm o horário', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, 'qualquer', ctx.corte.id, DIA, localParaUtc(DIA, 0)));
    expect(s.find((x) => formatarHora(x.inicio) === '09:00')!.barbeiroId).toBe(ctx.teo.id);
  });

  it('barbeiro que não oferece o serviço devolve vazio', async () => {
    const s = await comBarbearia(ctx.b.id, (tx) =>
      slotsDoDia(tx, ctx.b.id, ctx.rael.id, ctx.pezinho.id, DIA, localParaUtc(DIA, 0)));
    expect(s).toEqual([]);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/api-leitura.test.ts
```

- [ ] **Passo 3: Implementar `src/lib/agenda.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { slotsLivres, unirSlots, type Slot } from './slots';

export async function slotsDoDia(
  tx: Prisma.TransactionClient,
  barbeariaId: string,
  barbeiroId: string | 'qualquer',
  servicoId: string,
  dia: string,
  agora: Date,
): Promise<Slot[]> {
  const vinculos = await tx.barbeiroServico.findMany({
    where: {
      servicoId, ativo: true,
      ...(barbeiroId === 'qualquer' ? {} : { barbeiroId }),
      barbeiro: { ativo: true },
    },
    include: { barbeiro: { select: { id: true, ordem: true } } },
  });
  if (vinculos.length === 0) return [];

  const ids = vinculos.map((v) => v.barbeiroId);
  const [expedientes, bloqueios, agendamentos] = await Promise.all([
    tx.horarioTrabalho.findMany({ where: { barbeiroId: { in: ids } } }),
    tx.bloqueio.findMany({ where: { barbeiroId: { in: ids } } }),
    tx.agendamento.findMany({
      where: { barbeiroId: { in: ids }, status: 'CONFIRMADO' },
      select: { barbeiroId: true, inicio: true, fim: true },
    }),
  ]);

  const listas = vinculos.map((v) =>
    slotsLivres({
      barbeiroId: v.barbeiroId,
      duracaoMin: v.duracaoMin,
      expediente: expedientes.filter((h) => h.barbeiroId === v.barbeiroId),
      bloqueios:  bloqueios.filter((b) => b.barbeiroId === v.barbeiroId),
      agendamentos: agendamentos.filter((a) => a.barbeiroId === v.barbeiroId),
      dia, agora,
    }),
  );

  const ordem = new Map(vinculos.map((v) => [v.barbeiroId, v.barbeiro.ordem]));
  return unirSlots(listas, ordem);
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/api-leitura.test.ts
```

Esperado: PASSA, 4 testes.

- [ ] **Passo 5: Escrever as rotas**

`src/app/api/barbeiros/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';

export async function GET() {
  const barbearia = await barbeariaAtual();
  const barbeiros = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiro.findMany({
      where: { ativo: true, servicos: { some: { ativo: true } } },
      select: { id: true, nome: true, fotoUrl: true },
      orderBy: { ordem: 'asc' },
    }),
  );
  return NextResponse.json({ barbeiros });
}
```

`src/app/api/servicos/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';

export async function GET(req: NextRequest) {
  const barbearia = await barbeariaAtual();
  const barbeiroId = req.nextUrl.searchParams.get('barbeiroId') ?? 'qualquer';

  const vinculos = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiroServico.findMany({
      where: {
        ativo: true, barbeiro: { ativo: true },
        ...(barbeiroId === 'qualquer' ? {} : { barbeiroId }),
        servico: { ativo: true },
      },
      include: { servico: { select: { id: true, nome: true, ordem: true } } },
    }),
  );

  // Com "qualquer", a duração exibida é a MENOR entre os barbeiros —
  // o barbeiro só é resolvido na escolha do horário.
  const porServico = new Map<string, { id: string; nome: string; ordem: number; duracaoMin: number }>();
  for (const v of vinculos) {
    const atual = porServico.get(v.servicoId);
    if (!atual || v.duracaoMin < atual.duracaoMin) {
      porServico.set(v.servicoId, { ...v.servico, duracaoMin: v.duracaoMin });
    }
  }

  const servicos = [...porServico.values()]
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ id, nome, duracaoMin }) => ({ id, nome, duracaoMin }));

  return NextResponse.json({ servicos });
}
```

`src/app/api/horarios/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { formatarHora, formatarDiaLongo, diaDeHoje, somarDias, localParaUtc } from '@/lib/datas';
import { JANELA_MAXIMA_DIAS, DIAS_NA_HOME } from '@/lib/config';

export async function GET(req: NextRequest) {
  const barbearia = await barbeariaAtual();
  const p = req.nextUrl.searchParams;
  const barbeiroId = p.get('barbeiroId') ?? 'qualquer';
  const servicoId = p.get('servicoId');
  if (!servicoId) {
    return NextResponse.json({ erro: 'Escolhe o serviço primeiro.' }, { status: 400 });
  }

  const agora = new Date();
  const hoje = diaDeHoje(agora);
  const de = p.get('de') ?? hoje;
  const quantos = Math.min(Number(p.get('dias') ?? DIAS_NA_HOME), JANELA_MAXIMA_DIAS);

  const dias = await comBarbearia(barbearia.id, async (tx) => {
    const saida = [];
    for (let i = 0; i < quantos; i++) {
      const data = somarDias(de, i);
      const slots = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, data, agora);
      const nomes = new Map(
        (await tx.barbeiro.findMany({
          where: { id: { in: [...new Set(slots.map((s) => s.barbeiroId))] } },
          select: { id: true, nome: true },
        })).map((b) => [b.id, b.nome]),
      );
      saida.push({
        data,
        rotulo: rotuloDe(data, hoje),
        // Só o que está LIVRE. Nenhum nome de cliente, nenhum ocupado (§9.1).
        slots: slots.map((s) => ({
          hora: formatarHora(s.inicio),
          inicio: s.inicio.toISOString(),
          fim: s.fim.toISOString(),
          barbeiroId: s.barbeiroId,
          barbeiroNome: nomes.get(s.barbeiroId) ?? '',
          duracaoMin: Math.round((s.fim.getTime() - s.inicio.getTime()) / 60_000),
        })),
      });
    }
    return saida;
  });

  return NextResponse.json({ dias });
}

function rotuloDe(data: string, hoje: string) {
  const longo = formatarDiaLongo(localParaUtc(data, 12 * 60));
  if (data === hoje) return `hoje · ${longo}`;
  if (data === somarDias(hoje, 1)) return `amanhã · ${longo}`;
  return longo;
}
```

`src/app/api/dias-com-vaga/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';

export async function GET(req: NextRequest) {
  const barbearia = await barbeariaAtual();
  const p = req.nextUrl.searchParams;
  const barbeiroId = p.get('barbeiroId') ?? 'qualquer';
  const servicoId = p.get('servicoId');
  const mes = p.get('mes'); // 'YYYY-MM'
  if (!servicoId || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ erro: 'Parâmetros inválidos.' }, { status: 400 });
  }

  const agora = new Date();
  const [ano, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate();

  const dias = await comBarbearia(barbearia.id, async (tx) => {
    const comVaga: number[] = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const data = `${mes}-${String(d).padStart(2, '0')}`;
      const slots = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, data, agora);
      if (slots.length > 0) comVaga.push(d);
    }
    return comVaga;
  });

  return NextResponse.json({ dias });
}
```

- [ ] **Passo 6: Verificar as rotas no navegador**

```bash
docker compose up -d
curl -s "http://brutus.localhost:3000/api/barbeiros" | head -c 300
```

Esperado: Téo e Rael, **não** o Tony da Dom Tony.

```bash
curl -s "http://dontony.localhost:3000/api/barbeiros" | head -c 300
```

Esperado: só o Tony.

- [ ] **Passo 7: Commit**

```bash
git add -A
git commit -m "Expoe rotas de leitura de barbeiros, servicos e horarios"
```

---

## Tarefa 13: Evolution API — envio e verificação de número

**Arquivos:**
- Criar: `src/lib/whatsapp.ts`, `src/lib/mensagens.ts`
- Criar: `tests/whatsapp.test.ts`

**Interfaces:**
- Produz:
  - `enviarTexto(whatsappDigitos: string, mensagem: string): Promise<void>` — nunca lança
  - `numeroExiste(whatsappDigitos: string, ip: string): Promise<'existe' | 'nao_existe' | 'indeterminado'>`
  - `msgConfirmacao(...)`, `msgCancelamento(...)`, `msgLembrete(...)` em `mensagens.ts`

- [ ] **Passo 1: Escrever os testes**

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { numeroExiste, enviarTexto, _limparCaches } from '@/lib/whatsapp';

beforeEach(() => {
  _limparCaches();
  process.env.EVOLUTION_API_URL = 'http://evolution.teste';
  process.env.EVOLUTION_INSTANCE = 'brutus';
  process.env.EVOLUTION_API_KEY = 'chave';
});
afterEach(() => vi.restoreAllMocks());

describe('numeroExiste', () => {
  it('exists true → existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: true, jid: 'x' }],
    }));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('existe');
  });

  it('exists false → nao_existe', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: false }],
    }));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('nao_existe');
  });

  it('API fora do ar → indeterminado (nunca bloqueia)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('indeterminado');
  });

  it('sem EVOLUTION_API_URL → indeterminado, sem chamada de rede', async () => {
    process.env.EVOLUTION_API_URL = '';
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await numeroExiste('11977771234', '1.1.1.1')).toBe('indeterminado');
    expect(spy).not.toHaveBeenCalled();
  });

  it('segunda consulta do mesmo número usa cache', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ exists: true }] });
    vi.stubGlobal('fetch', spy);
    await numeroExiste('11977771234', '1.1.1.1');
    await numeroExiste('11977771234', '1.1.1.1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('estourado o limite por IP, devolve indeterminado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: true }],
    }));
    for (let i = 0; i < 10; i++) await numeroExiste(`1197777${1000 + i}`, '2.2.2.2');
    expect(await numeroExiste('11999990000', '2.2.2.2')).toBe('indeterminado');
  });
});

describe('enviarTexto', () => {
  it('não lança quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fora do ar')));
    await expect(enviarTexto('11977771234', 'oi')).resolves.toBeUndefined();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/whatsapp.test.ts
```

- [ ] **Passo 3: Implementar `src/lib/whatsapp.ts`**

```ts
import {
  CHECK_NUMERO_TIMEOUT_MS, CHECK_NUMERO_TTL_MS, CHECK_NUMERO_LIMITE_POR_IP_HORA,
} from './config';

const HORA_MS = 3_600_000;

const cacheNumero = new Map<string, { existe: boolean; expiraEm: number }>();
const usoPorIp = new Map<string, { contador: number; janelaAte: number }>();

/// Só para teste.
export function _limparCaches() { cacheNumero.clear(); usoPorIp.clear(); }

const config = () => ({
  url: process.env.EVOLUTION_API_URL ?? '',
  instancia: process.env.EVOLUTION_INSTANCE ?? '',
  chave: process.env.EVOLUTION_API_KEY ?? '',
});

/// Fire-and-forget. Falha de WhatsApp NUNCA derruba um agendamento (§10.2).
export async function enviarTexto(whatsappDigitos: string, mensagem: string): Promise<void> {
  const { url, instancia, chave } = config();
  if (!url) { console.info('[whatsapp] sem EVOLUTION_API_URL:', whatsappDigitos, mensagem); return; }
  try {
    await fetch(`${url}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify({ number: `55${whatsappDigitos}`, text: mensagem }),
      signal: AbortSignal.timeout(CHECK_NUMERO_TIMEOUT_MS),
    });
  } catch (e) {
    console.error('[whatsapp] falha ao enviar:', e);
  }
}

/// 'nao_existe' bloqueia o agendamento. 'indeterminado' deixa passar —
/// indisponibilidade não é resposta (§10.5).
export async function numeroExiste(
  whatsappDigitos: string,
  ip: string,
): Promise<'existe' | 'nao_existe' | 'indeterminado'> {
  const { url, instancia, chave } = config();
  if (!url) return 'indeterminado';

  const guardado = cacheNumero.get(whatsappDigitos);
  if (guardado && guardado.expiraEm > Date.now()) {
    return guardado.existe ? 'existe' : 'nao_existe';
  }

  // Um formulário público que responde "esse número tem WhatsApp" é uma
  // ferramenta de varredura. Sem limite, viram milhares de consultas.
  const uso = usoPorIp.get(ip);
  if (!uso || uso.janelaAte < Date.now()) {
    usoPorIp.set(ip, { contador: 1, janelaAte: Date.now() + HORA_MS });
  } else if (uso.contador >= CHECK_NUMERO_LIMITE_POR_IP_HORA) {
    return 'indeterminado';
  } else {
    uso.contador += 1;
  }

  try {
    const r = await fetch(`${url}/chat/whatsappNumbers/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify({ numbers: [`55${whatsappDigitos}`] }),
      signal: AbortSignal.timeout(CHECK_NUMERO_TIMEOUT_MS),
    });
    if (!r.ok) return 'indeterminado';
    const dados = await r.json();
    const existe = Array.isArray(dados) && dados[0]?.exists === true;
    cacheNumero.set(whatsappDigitos, { existe, expiraEm: Date.now() + CHECK_NUMERO_TTL_MS });
    return existe ? 'existe' : 'nao_existe';
  } catch (e) {
    console.error('[whatsapp] falha ao verificar número:', e);
    return 'indeterminado';
  }
}
```

- [ ] **Passo 4: Implementar `src/lib/mensagens.ts`**

```ts
import { formatarDiaLongo, formatarHora } from './datas';

type Dados = {
  clienteNome: string; barbeiroNome: string; servicoNome: string;
  inicio: Date; endereco: string; link: string;
};

export const msgConfirmacao = (d: Dados) =>
  `Fechou, ${d.clienteNome.split(' ')[0]}! Seu ${d.servicoNome.toLowerCase()} ` +
  `está marcado para ${formatarDiaLongo(d.inicio)} às ${formatarHora(d.inicio)} ` +
  `com ${d.barbeiroNome}.\n\n${d.endereco}\n\n` +
  `Precisa cancelar? ${d.link}`;

export const msgCancelamento = (d: Omit<Dados, 'link'>) =>
  `Seu horário de ${formatarDiaLongo(d.inicio)} às ${formatarHora(d.inicio)} ` +
  `com ${d.barbeiroNome} foi cancelado. Até a próxima!`;

export const msgLembrete = (d: Omit<Dados, 'link'>) =>
  `Lembrete: ${d.servicoNome.toLowerCase()} hoje às ${formatarHora(d.inicio)} ` +
  `com ${d.barbeiroNome}. ${d.endereco}`;
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -- tests/whatsapp.test.ts
```

Esperado: PASSA, 7 testes.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "Integra Evolution API com degradacao e limite de taxa"
```

---

## Tarefa 14: Criar agendamento

**Arquivos:**
- Criar: `src/app/api/agendamentos/route.ts`
- Criar: `tests/api-agendar.test.ts`

**Interfaces:**
- Consome: `slotsDoDia`, `numeroExiste`, `normalizar`, `comBarbearia`.
- Produz: `POST /api/agendamentos` → `201 { codigo }` | 409 | 422.

- [ ] **Passo 1: Escrever os testes**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { POST } from '@/app/api/agendamentos/route';
import { localParaUtc } from '@/lib/datas';

const DIA = '2026-08-05';
let ctx: any;

// A rota lê o tenant do header que o middleware injeta.
function pedido(corpo: unknown) {
  return new Request('http://brutus.localhost:3000/api/agendamentos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-barbearia-slug': 'brutus' },
    body: JSON.stringify(corpo),
  });
}

beforeEach(async () => {
  await limparBanco();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem evolution')));
  // ...montar barbearia 'brutus' com Téo, serviço Corte 40min, expediente
  // quarta 9h–20h — mesmo cenário da Tarefa 12.
  ctx = await montarCenarioBrutus();
});

describe('POST /api/agendamentos', () => {
  it('agenda horário livre e devolve código', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos Vinícius', whatsapp: '(11) 9 7777-1234',
    }));
    expect(r.status).toBe(201);
    const { codigo } = await r.json();
    expect(codigo).toHaveLength(10);
  });

  it('dois pedidos no mesmo horário: um 201, um 409', async () => {
    const corpo = {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    };
    const a = await POST(pedido(corpo));
    const b = await POST(pedido({ ...corpo, whatsapp: '11966665555' }));
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const total = await prismaOwner.agendamento.count({ where: { status: 'CONFIRMADO' } });
    expect(total).toBe(1);
  });

  it('sobreposição parcial é recusada', async () => {
    await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.barba.id, // 30min
      inicio: localParaUtc(DIA, 16 * 60 + 30).toISOString(),
      nome: 'Ana', whatsapp: '11966665555',
    }));
    expect(r.status).toBe(409);
  });

  it('WhatsApp inválido → 422', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '119777',
    }));
    expect(r.status).toBe(422);
  });

  it('duração forjada no corpo é ignorada', async () => {
    await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234', duracaoMin: 5,
    }));
    const ag = await prismaOwner.agendamento.findFirst();
    expect(ag!.duracaoMin).toBe(40);
  });

  it('barbeiro que não faz o serviço → 422', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.rael.id, servicoId: ctx.pezinho.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    expect(r.status).toBe(422);
  });

  it('horário no passado → 422', async () => {
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc('2020-01-02', 10 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    expect(r.status).toBe(422);
  });

  it('Evolution respondendo exists:false → 422, nada gravado', async () => {
    process.env.EVOLUTION_API_URL = 'http://evolution.teste';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => [{ exists: false }],
    }));
    const r = await POST(pedido({
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: localParaUtc(DIA, 16 * 60).toISOString(),
      nome: 'Marcos', whatsapp: '11977771234',
    }));
    expect(r.status).toBe(422);
    expect(await prismaOwner.agendamento.count()).toBe(0);
    process.env.EVOLUTION_API_URL = '';
  });
});
```

> Escrever `montarCenarioBrutus()` em `tests/cenarios.ts`, exportado, com barbearia `brutus`, Téo (Corte 40, Barba 30, Pezinho 15), Rael (Corte 30), expediente quarta 9h–20h. Reaproveitado pelas Tarefas 14 e 15.

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/api-agendar.test.ts
```

- [ ] **Passo 3: Implementar a rota**

```ts
import { NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { slotsDoDia } from '@/lib/agenda';
import { normalizar } from '@/lib/telefone';
import { numeroExiste, enviarTexto } from '@/lib/whatsapp';
import { msgConfirmacao } from '@/lib/mensagens';
import { utcParaLocal } from '@/lib/datas';

// Sem 0/O e 1/l/I — código é lido em voz alta e digitado à mão.
const gerarCodigo = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 10);

const Corpo = z.object({
  barbeiroId: z.string().uuid(),
  servicoId: z.string().uuid(),
  inicio: z.string().datetime(),
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string(),
});

export async function POST(req: Request) {
  const barbearia = await barbeariaAtual();

  const bruto = await req.json().catch(() => null);
  const parse = Corpo.safeParse(bruto);
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche nome e WhatsApp pra gente.' }, { status: 422 });
  }
  const { barbeiroId, servicoId, inicio: inicioIso, nome } = parse.data;

  const whatsapp = normalizar(parse.data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json(
      { erro: 'Confere o WhatsApp — parece faltar dígito.' }, { status: 422 });
  }

  // Chamada de rede ANTES da transação: não segurar conexão de banco
  // esperando API externa.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido';
  if (await numeroExiste(whatsapp, ip) === 'nao_existe') {
    return NextResponse.json(
      { erro: 'Esse número não tem WhatsApp. Confere pra gente?' }, { status: 422 });
  }

  const inicio = new Date(inicioIso);
  const agora = new Date();

  try {
    const criado = await comBarbearia(barbearia.id, async (tx) => {
      const vinculo = await tx.barbeiroServico.findUnique({
        where: { barbeiroId_servicoId: { barbeiroId, servicoId } },
        include: { servico: { select: { nome: true, ativo: true } } },
      });
      if (!vinculo || !vinculo.ativo || !vinculo.servico.ativo) {
        throw new ErroCliente(422, 'Esse barbeiro não faz esse serviço.');
      }

      // A duração vem do banco. O que veio no corpo é sugestão de atacante.
      const duracaoMin = vinculo.duracaoMin;
      const fim = new Date(inicio.getTime() + duracaoMin * 60_000);

      const { dia } = utcParaLocal(inicio);
      const livres = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, dia, agora);
      if (!livres.some((s) => s.inicio.getTime() === inicio.getTime())) {
        throw new ErroCliente(422, 'Esse horário não está mais disponível.');
      }

      const cliente = await tx.cliente.upsert({
        where: { barbeariaId_whatsapp: { barbeariaId: barbearia.id, whatsapp } },
        create: { barbeariaId: barbearia.id, nome, whatsapp },
        update: { nome },
      });

      return tx.agendamento.create({
        data: {
          barbeariaId: barbearia.id, codigo: gerarCodigo(),
          barbeiroId, clienteId: cliente.id, servicoId,
          servicoNome: vinculo.servico.nome,
          inicio, fim, duracaoMin, status: 'CONFIRMADO',
        },
        include: { barbeiro: { select: { nome: true } } },
      });
    });

    // Fire-and-forget, DEPOIS do commit. Falha aqui não desfaz nada.
    const link = `${req.headers.get('origin') ?? ''}/agendamento/${criado.codigo}`;
    void enviarTexto(whatsapp, msgConfirmacao({
      clienteNome: nome, barbeiroNome: criado.barbeiro.nome,
      servicoNome: criado.servicoNome, inicio: criado.inicio,
      endereco: barbearia.endereco, link,
    }));

    return NextResponse.json({ codigo: criado.codigo }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroCliente) {
      return NextResponse.json({ erro: e.mensagem }, { status: e.status });
    }
    // 23P01 = exclusion_violation. NÃO é 23505 (unique_violation):
    // a garantia é uma restrição de EXCLUSÃO sobre intervalos (§5.4).
    if (typeof e === 'object' && e !== null && (e as any).meta?.code === '23P01') {
      return NextResponse.json(
        { erro: 'Esse horário acabou de ser pego. Escolhe outro?' }, { status: 409 });
    }
    throw e;
  }
}

class ErroCliente extends Error {
  constructor(public status: number, public mensagem: string) { super(mensagem); }
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/api-agendar.test.ts
```

Esperado: PASSA, 8 testes. Se o 409 vier como 500, conferir o caminho do código do erro do Prisma (`e.meta.code`) — logar o erro cru uma vez e ajustar.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Cria agendamento com revalidacao e protecao contra corrida"
```

---

## Tarefa 15: Ler e cancelar agendamento

**Arquivos:**
- Criar: `src/app/api/agendamentos/[codigo]/route.ts`
- Criar: `src/app/api/agendamentos/[codigo]/cancelar/route.ts`
- Criar: `tests/api-cancelar.test.ts`

**Interfaces:**
- Produz: `GET /api/agendamentos/[codigo]`, `POST /api/agendamentos/[codigo]/cancelar`.

- [ ] **Passo 1: Escrever os testes**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { GET } from '@/app/api/agendamentos/[codigo]/route';
import { POST as cancelar } from '@/app/api/agendamentos/[codigo]/cancelar/route';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';

function req(slug = 'brutus') {
  return new Request('http://x/api', { headers: { 'x-barbearia-slug': slug } });
}

describe('cancelamento', () => {
  it(`${PRAZO_CANCELAMENTO_MIN + 1} min antes: cancela`, async () => {
    const ag = await agendamentoDaqui(PRAZO_CANCELAMENTO_MIN + 1);
    const r = await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(200);
    const depois = await prismaOwner.agendamento.findUnique({ where: { id: ag.id } });
    expect(depois!.status).toBe('CANCELADO_CLIENTE');
  });

  it(`${PRAZO_CANCELAMENTO_MIN - 1} min antes: recusa e mantém intacto`, async () => {
    const ag = await agendamentoDaqui(PRAZO_CANCELAMENTO_MIN - 1);
    const r = await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(422);
    const depois = await prismaOwner.agendamento.findUnique({ where: { id: ag.id } });
    expect(depois!.status).toBe('CONFIRMADO');
  });

  it('cancelar duas vezes é idempotente', async () => {
    const ag = await agendamentoDaqui(120);
    await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    const r = await cancelar(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(200);
  });

  it('código de outra barbearia dá 404', async () => {
    const ag = await agendamentoDaqui(120); // criado em brutus
    const r = await GET(req('dontony'), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect(r.status).toBe(404);
  });

  it('GET expõe podeCancelar calculado no servidor', async () => {
    const ag = await agendamentoDaqui(PRAZO_CANCELAMENTO_MIN - 1);
    const r = await GET(req(), { params: Promise.resolve({ codigo: ag.codigo }) });
    expect((await r.json()).podeCancelar).toBe(false);
  });

  it('GET não devolve telefone do cliente', async () => {
    const ag = await agendamentoDaqui(120);
    const corpo = await (await GET(req(), { params: Promise.resolve({ codigo: ag.codigo }) })).json();
    expect(JSON.stringify(corpo)).not.toContain('7777');
  });
});
```

> `agendamentoDaqui(minutos)` cria em `tests/cenarios.ts` um agendamento confirmado começando daqui a N minutos, na barbearia `brutus`, com cliente de WhatsApp `11977771234`.

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/api-cancelar.test.ts
```

- [ ] **Passo 3: Implementar `GET`**

```ts
import { NextResponse } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';
import { formatar } from '@/lib/telefone';

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const barbearia = await barbeariaAtual();

  // O RLS garante que um código de outra barbearia não é encontrado aqui.
  const ag = await comBarbearia(barbearia.id, (tx) =>
    tx.agendamento.findFirst({
      where: { codigo },
      include: { barbeiro: { select: { nome: true } }, cliente: { select: { nome: true } } },
    }),
  );
  if (!ag) return NextResponse.json({ erro: 'Agendamento não encontrado.' }, { status: 404 });

  const minutosAte = (ag.inicio.getTime() - Date.now()) / 60_000;

  return NextResponse.json({
    codigo: ag.codigo,
    clienteNome: ag.cliente.nome,
    barbeiroNome: ag.barbeiro.nome,
    servicoNome: ag.servicoNome,
    duracaoMin: ag.duracaoMin,
    inicio: ag.inicio.toISOString(),
    fim: ag.fim.toISOString(),
    status: ag.status,
    // Calculado no servidor. A tela obedece, não recalcula.
    podeCancelar: ag.status === 'CONFIRMADO' && minutosAte > PRAZO_CANCELAMENTO_MIN,
    endereco: barbearia.endereco,
    whatsappBarbearia: formatar(barbearia.whatsappContato),
  });
}
```

- [ ] **Passo 4: Implementar `POST .../cancelar`**

```ts
import { NextResponse } from 'next/server';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';
import { formatar } from '@/lib/telefone';
import { enviarTexto } from '@/lib/whatsapp';
import { msgCancelamento } from '@/lib/mensagens';

export async function POST(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const barbearia = await barbeariaAtual();

  const resultado = await comBarbearia(barbearia.id, async (tx) => {
    const ag = await tx.agendamento.findFirst({
      where: { codigo },
      include: { barbeiro: { select: { nome: true } }, cliente: true },
    });
    if (!ag) return { tipo: 'nao_encontrado' as const };
    if (ag.status !== 'CONFIRMADO') return { tipo: 'ja_cancelado' as const };

    // Reconferido no servidor mesmo com podeCancelar:false na tela.
    // Botão desabilitado não é controle de acesso.
    const minutosAte = (ag.inicio.getTime() - Date.now()) / 60_000;
    if (minutosAte <= PRAZO_CANCELAMENTO_MIN) return { tipo: 'fora_do_prazo' as const };

    await tx.agendamento.update({
      where: { id: ag.id },
      data: { status: 'CANCELADO_CLIENTE', canceladoEm: new Date() },
    });
    return { tipo: 'ok' as const, ag };
  });

  if (resultado.tipo === 'nao_encontrado') {
    return NextResponse.json({ erro: 'Agendamento não encontrado.' }, { status: 404 });
  }
  if (resultado.tipo === 'fora_do_prazo') {
    return NextResponse.json({
      erro: `Passou do prazo de 1h. Chama a barbearia no zap: ${formatar(barbearia.whatsappContato)}`,
    }, { status: 422 });
  }
  if (resultado.tipo === 'ok') {
    void enviarTexto(resultado.ag.cliente.whatsapp, msgCancelamento({
      clienteNome: resultado.ag.cliente.nome,
      barbeiroNome: resultado.ag.barbeiro.nome,
      servicoNome: resultado.ag.servicoNome,
      inicio: resultado.ag.inicio,
      endereco: barbearia.endereco,
    }));
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -- tests/api-cancelar.test.ts
```

Esperado: PASSA, 6 testes.

- [ ] **Passo 6: Commit**

```bash
git add -A
git commit -m "Le e cancela agendamento com prazo conferido no servidor"
```

---

## Tarefa 16: Tela principal (wireframe 3b)

**Arquivos:**
- Substituir: `src/app/page.tsx`
- Criar: `src/components/FormAgendamento.tsx`

**Interfaces:**
- Consome: rotas das Tarefas 12 e 14; primitivos da Tarefa 11.

- [ ] **Passo 1: Escrever `src/app/page.tsx` (servidor)**

```tsx
import { barbeariaAtual } from '@/lib/tenant';
import { Frame, StatusBar, Sub, Sep } from '@/components/wf';
import { FormAgendamento } from '@/components/FormAgendamento';

export default async function Home() {
  const b = await barbeariaAtual();
  return (
    <Frame>
      <StatusBar />
      <h1 className="text-[17px] font-normal m-0">
        {b.nome} <span className="text-[11px] text-sub">barbearia</span>
      </h1>
      <Sub>{b.endereco} · {b.horarioResumo}</Sub>
      <Sep />
      <FormAgendamento />
      <Sep />
      <div className="text-[10px] text-lbl text-center">
        <a href="/painel">sou barbeiro · entrar no painel</a>
      </div>
    </Frame>
  );
}
```

- [ ] **Passo 2: Escrever `src/components/FormAgendamento.tsx` (cliente)**

Ordem exata de §11.3. Regras de encadeamento obrigatórias:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Row, Lbl, Sub, Avatar } from '@/components/wf';
import { formatar } from '@/lib/telefone';

type Barbeiro = { id: string; nome: string; fotoUrl: string | null };
type Servico = { id: string; nome: string; duracaoMin: number };
type Slot = { hora: string; inicio: string; barbeiroId: string; barbeiroNome: string };
type Dia = { data: string; rotulo: string; slots: Slot[] };

export function FormAgendamento() {
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [dias, setDias] = useState<Dia[]>([]);

  const [barbeiroId, setBarbeiroId] = useState<string>('qualquer');
  const [servicoId, setServicoId] = useState<string>('');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [nome, setNome] = useState('');
  const [whats, setWhats] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { fetch('/api/barbeiros').then(r => r.json()).then(d => setBarbeiros(d.barbeiros)); }, []);

  // Trocar barbeiro pode invalidar o serviço (Rael não faz pezinho).
  useEffect(() => {
    fetch(`/api/servicos?barbeiroId=${barbeiroId}`).then(r => r.json()).then(d => {
      setServicos(d.servicos);
      if (servicoId && !d.servicos.some((s: Servico) => s.id === servicoId)) setServicoId('');
    });
    setSlot(null);
  }, [barbeiroId]);

  // Trocar serviço muda a DURAÇÃO, logo muda a grade inteira.
  // Manter o horário selecionado garantiria 422 na confirmação.
  useEffect(() => {
    setSlot(null);
    if (!servicoId) { setDias([]); return; }
    fetch(`/api/horarios?barbeiroId=${barbeiroId}&servicoId=${servicoId}&dias=2`)
      .then(r => r.json()).then(d => setDias(d.dias));
  }, [servicoId, barbeiroId]);

  const servico = servicos.find(s => s.id === servicoId);
  const pronto = servicoId && slot && nome.trim().length >= 2 && whats.replace(/\D/g, '').length >= 10;

  async function confirmar() {
    if (!pronto || enviando) return;
    setEnviando(true); setErro('');
    const r = await fetch('/api/agendamentos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        barbeiroId: slot!.barbeiroId, servicoId, inicio: slot!.inicio, nome, whatsapp: whats,
      }),
    });
    const corpo = await r.json();
    if (r.ok) { window.location.href = `/agendamento/${corpo.codigo}`; return; }
    setErro(corpo.erro);
    setEnviando(false);
    if (r.status === 409) {
      // Recarrega a lista mantendo nome e telefone preenchidos.
      setSlot(null);
      fetch(`/api/horarios?barbeiroId=${barbeiroId}&servicoId=${servicoId}&dias=2`)
        .then(x => x.json()).then(d => setDias(d.dias));
    }
  }

  return (
    <>
      <Lbl>1. Barbeiro</Lbl>
      <Row>
        {barbeiros.map(b => (
          <Box key={b.id} variante={barbeiroId === b.id ? 'sel' : 'normal'}
               className="flex gap-1.5 items-center cursor-pointer"
               onClick={() => setBarbeiroId(b.id)}>
            <Avatar />{b.nome}
          </Box>
        ))}
      </Row>
      <Chip ativo={barbeiroId === 'qualquer'} className="self-start"
            onClick={() => setBarbeiroId('qualquer')}>tanto faz</Chip>

      <Lbl>2. Serviço</Lbl>
      <Row wrap>
        {servicos.map(s => (
          <Chip key={s.id} ativo={servicoId === s.id} onClick={() => setServicoId(s.id)}>
            {s.nome} · {barbeiroId === 'qualquer' ? `a partir de ${s.duracaoMin}min` : `${s.duracaoMin}min`}
          </Chip>
        ))}
      </Row>

      <Lbl>3. Próximos horários livres</Lbl>
      {!servicoId && <Sub>Escolhe o serviço pra ver os horários.</Sub>}
      {dias.map(d => (
        <div key={d.data} className="flex flex-col gap-2">
          <Lbl className="text-[#444]">{d.rotulo}</Lbl>
          {d.slots.length === 0 ? <Sub>sem vaga nesse dia</Sub> : (
            <Row wrap>
              {d.slots.map(s => (
                <Chip key={s.inicio} ativo={slot?.inicio === s.inicio} onClick={() => setSlot(s)}>
                  {s.hora}
                </Chip>
              ))}
            </Row>
          )}
        </div>
      ))}
      <Lbl>só aparece o que está livre</Lbl>

      <a href={servicoId ? `/calendario?barbeiroId=${barbeiroId}&servicoId=${servicoId}` : '#'}>
        <Box className="flex justify-between items-center">
          <span>escolher outro dia</span><Lbl>calendário ›</Lbl>
        </Box>
      </a>

      <Lbl>4. Seus dados</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="Seu nome"
               value={nome} onChange={e => setNome(e.target.value)} />
      </Box>
      <Box variante={whats ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" inputMode="numeric"
               placeholder="WhatsApp (11) 9 ____-____" value={whats}
               onChange={e => {
                 const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                 setWhats(d.length >= 10 ? formatar(d) : d);
               }} />
      </Box>

      {erro && <Sub className="text-acento">{erro}</Sub>}

      <Box variante={pronto && !enviando ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={confirmar}>
        {slot && servico
          ? `confirmar ${servico.nome.toLowerCase()} ${slot.hora} com ${slot.barbeiroNome}`
          : 'confirmar'}
      </Box>
      <Sub className="text-center">confirmação chega no seu zap</Sub>
    </>
  );
}
```

- [ ] **Passo 3: Verificar no navegador**

```bash
docker compose up -d
```

Abrir `http://brutus.localhost:3000`. Conferir, um a um:
- trocar de barbeiro **limpa** o horário selecionado
- trocar de serviço **muda os horários** (Corte 40min vs Pezinho 15min produzem listas diferentes)
- escolher Rael **remove** Pezinho da lista de serviços
- o botão fica `mut` até tudo estar preenchido
- abrir `http://dontony.localhost:3000` mostra **Dom Tony**, com outros barbeiros e outros serviços

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "Monta a tela de agendamento do cliente"
```

---

## Tarefa 17: Mini-calendário (wireframe 4c)

**Arquivos:**
- Criar: `src/app/calendario/page.tsx`, `src/components/MiniCalendario.tsx`

- [ ] **Passo 1: Escrever a página**

```tsx
import { Frame, StatusBar, Lbl } from '@/components/wf';
import { MiniCalendario } from '@/components/MiniCalendario';

export default async function Calendario({
  searchParams,
}: { searchParams: Promise<{ barbeiroId?: string; servicoId?: string }> }) {
  const { barbeiroId = 'qualquer', servicoId } = await searchParams;
  if (!servicoId) {
    return <Frame><Lbl>Escolhe o serviço antes.</Lbl><a href="/">‹ voltar</a></Frame>;
  }
  return (
    <Frame>
      <StatusBar />
      <a href="/" className="text-[11px] text-lbl">‹ voltar</a>
      <h1 className="text-[17px] font-normal m-0">Escolher outro dia</h1>
      <MiniCalendario barbeiroId={barbeiroId} servicoId={servicoId} />
    </Frame>
  );
}
```

- [ ] **Passo 2: Escrever `src/components/MiniCalendario.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Box, Chip, Row, Lbl } from '@/components/wf';

const CABECALHO = ['s', 't', 'q', 'q', 's', 's', 'd']; // semana começa na segunda

export function MiniCalendario({ barbeiroId, servicoId }: { barbeiroId: string; servicoId: string }) {
  const hoje = new Date();
  const [mes, setMes] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`);
  const [comVaga, setComVaga] = useState<number[]>([]);
  const [dia, setDia] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ hora: string; inicio: string; barbeiroNome: string }[]>([]);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dias-com-vaga?barbeiroId=${barbeiroId}&servicoId=${servicoId}&mes=${mes}`)
      .then(r => r.json()).then(d => setComVaga(d.dias));
    setDia(null); setSlots([]); setEscolhido(null);
  }, [mes, barbeiroId, servicoId]);

  useEffect(() => {
    if (!dia) return;
    fetch(`/api/horarios?barbeiroId=${barbeiroId}&servicoId=${servicoId}&de=${dia}&dias=1`)
      .then(r => r.json()).then(d => setSlots(d.dias[0]?.slots ?? []));
  }, [dia, barbeiroId, servicoId]);

  const [ano, m] = mes.split('-').map(Number);
  const totalDias = new Date(ano, m, 0).getDate();
  // getDay(): 0=domingo. A grade começa na segunda, então domingo vira 6.
  const deslocamento = (new Date(ano, m - 1, 1).getDay() + 6) % 7;

  const irPara = (delta: number) => {
    const d = new Date(ano, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <>
      <Row className="items-center">
        <button onClick={() => irPara(-1)} className="text-[11px] text-lbl">‹</button>
        <div className="flex-1 text-center text-sm">{mes}</div>
        <button onClick={() => irPara(1)} className="text-[11px] text-lbl">›</button>
      </Row>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {CABECALHO.map((d, i) => <div key={i} className="text-[10px] text-lbl">{d}</div>)}
        {Array.from({ length: deslocamento }).map((_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map(d => {
          const data = `${mes}-${String(d).padStart(2, '0')}`;
          const tem = comVaga.includes(d);
          return (
            <button key={d} disabled={!tem} onClick={() => setDia(data)}
              className={`text-xs rounded-full ${
                !tem ? 'text-[#ccc]'
                     : dia === data ? 'border-[2px] border-traco' : 'border-[1.5px] border-traco'}`}>
              {d}
            </button>
          );
        })}
      </div>
      <Lbl>círculo = tem vaga · apagado = lotado ou fechado</Lbl>

      {dia && (
        <>
          <Lbl className="text-[#444]">{dia}</Lbl>
          <Row wrap>
            {slots.map(s => (
              <Chip key={s.inicio} ativo={escolhido === s.inicio} onClick={() => setEscolhido(s.inicio)}>
                {s.hora}
              </Chip>
            ))}
          </Row>
          {escolhido && (
            <a href={`/?barbeiroId=${barbeiroId}&servicoId=${servicoId}&inicio=${encodeURIComponent(escolhido)}`}>
              <Box variante="fill">
                usar {slots.find(s => s.inicio === escolhido)?.hora}
              </Box>
            </a>
          )}
        </>
      )}
    </>
  );
}
```

- [ ] **Passo 3: Verificar no navegador**

Abrir `http://brutus.localhost:3000/calendario?barbeiroId=qualquer&servicoId=<id do Corte>`.
Conferir: dias com vaga circulados, dias sem vaga apagados e não clicáveis, navegação de mês funcionando, e que **trocar o serviço para Corte + Barba (60min) reduz os dias circulados**.

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "Adiciona o mini-calendario do mes"
```

---

## Tarefa 18: Tela de confirmado (wireframe 1b)

**Arquivos:**
- Criar: `src/app/agendamento/[codigo]/page.tsx`, `src/components/Confirmado.tsx`

- [ ] **Passo 1: Escrever a página**

```tsx
import { notFound } from 'next/navigation';
import { barbeariaAtual, comBarbearia } from '@/lib/tenant';
import { PRAZO_CANCELAMENTO_MIN } from '@/lib/config';
import { formatar } from '@/lib/telefone';
import { Frame, StatusBar } from '@/components/wf';
import { Confirmado } from '@/components/Confirmado';

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const b = await barbeariaAtual();

  // O RLS garante que um código de outra barbearia não aparece aqui.
  const ag = await comBarbearia(b.id, (tx) =>
    tx.agendamento.findFirst({
      where: { codigo },
      include: { barbeiro: { select: { nome: true } }, cliente: { select: { nome: true } } },
    }),
  );
  if (!ag) notFound();

  const minutosAte = (ag.inicio.getTime() - Date.now()) / 60_000;

  return (
    <Frame>
      <StatusBar />
      <Confirmado
        codigo={ag.codigo}
        clienteNome={ag.cliente.nome}
        barbeiroNome={ag.barbeiro.nome}
        servicoNome={ag.servicoNome}
        inicioIso={ag.inicio.toISOString()}
        fimIso={ag.fim.toISOString()}
        status={ag.status}
        podeCancelar={ag.status === 'CONFIRMADO' && minutosAte > PRAZO_CANCELAMENTO_MIN}
        endereco={b.endereco}
        whatsappBarbearia={formatar(b.whatsappContato)}
      />
    </Frame>
  );
}
```

- [ ] **Passo 2: Escrever `src/components/Confirmado.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';

type Props = {
  codigo: string; clienteNome: string; barbeiroNome: string; servicoNome: string;
  inicioIso: string; fimIso: string; status: string; podeCancelar: boolean;
  endereco: string; whatsappBarbearia: string;
};

export function Confirmado(p: Props) {
  const [status, setStatus] = useState(p.status);
  const [erro, setErro] = useState('');

  const quando = new Date(p.inicioIso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric',
    month: 'short', hour: '2-digit', minute: '2-digit',
  });

  async function cancelar() {
    const r = await fetch(`/api/agendamentos/${p.codigo}/cancelar`, { method: 'POST' });
    const corpo = await r.json();
    if (r.ok) setStatus('CANCELADO_CLIENTE'); else setErro(corpo.erro);
  }

  function baixarIcs() {
    const fmt = (s: string) => s.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `UID:${p.codigo}@barbearia`,
      `DTSTART:${fmt(p.inicioIso)}`, `DTEND:${fmt(p.fimIso)}`,
      `SUMMARY:${p.servicoNome} com ${p.barbeiroNome}`,
      `LOCATION:${p.endereco}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'agendamento.ics';
    a.click();
  }

  if (status !== 'CONFIRMADO') {
    return (
      <>
        <h1 className="text-[17px] font-normal">Horário cancelado.</h1>
        <Sub>Esse agendamento não está mais valendo.</Sub>
        <a href="/"><Box variante="fill">marcar outro horário</Box></a>
      </>
    );
  }

  return (
    <>
      <div className="h-5" />
      <div className="w-[52px] h-[52px] border-2 border-traco rounded-full
                      flex items-center justify-center text-[22px]">✓</div>
      <h1 className="text-[17px] font-normal m-0">Tá marcado, {p.clienteNome.split(' ')[0]}.</h1>
      <Box className="flex flex-col gap-1.5">
        <div className="text-[15px]">{quando}</div>
        <Sub>{p.servicoNome.toLowerCase()} · com {p.barbeiroNome} · {p.endereco}</Sub>
      </Box>
      <Sub>Mandamos o lembrete no WhatsApp 1h antes.</Sub>
      <Box variante="fill" className="cursor-pointer" onClick={baixarIcs}>salvar no calendário</Box>

      {p.podeCancelar ? (
        <Box className="text-center cursor-pointer" onClick={cancelar}>cancelar meu horário</Box>
      ) : (
        <>
          <Box variante="mut" className="text-center">cancelar meu horário</Box>
          <Lbl>passou do prazo — chama no zap: {p.whatsappBarbearia}</Lbl>
        </>
      )}
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Sep />
      <Lbl>dá pra cancelar até 1h antes. depois disso, só chamando a barbearia.</Lbl>
    </>
  );
}
```

- [ ] **Passo 3: Verificar ponta a ponta**

Agendar pelo `http://brutus.localhost:3000`, ser redirecionado para a tela de confirmado, baixar o `.ics`, cancelar. Depois:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://dontony.localhost:3000/agendamento/<codigo-da-brutus>"
```

Esperado: **404**. É o teste do código global atravessando tenant.

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "Monta a tela de agendamento confirmado"
```

---

## Tarefa 19: Painel stub, página institucional e lembretes

**Arquivos:**
- Criar: `src/app/painel/page.tsx`
- Criar: `src/app/institucional/page.tsx`
- Criar: `src/app/api/cron/lembretes/route.ts`

- [ ] **Passo 1: Escrever o stub do painel**

```tsx
import { Frame, Lbl, Box } from '@/components/wf';

export default function Painel() {
  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Painel do barbeiro</h1>
      <Lbl>Chega na próxima etapa.</Lbl>
      <a href="/"><Box variante="fill">← voltar para agendar um corte</Box></a>
    </Frame>
  );
}
```

- [ ] **Passo 2: Escrever a página institucional**

`src/app/institucional/page.tsx` — servida quando o `Host` é o domínio nu:

```tsx
export default function Institucional() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 40, maxWidth: 560 }}>
      <h1>Agenda para barbearias</h1>
      <p>Seu cliente marca sozinho pelo celular. Você vê o dia inteiro numa tela.</p>
      <p>Cada barbearia tem o próprio endereço: <code>suabarbearia.seuapp.com.br</code></p>
    </main>
  );
}
```

Ajustar `src/middleware.ts` para reescrever a raiz do domínio nu para `/institucional`:

```ts
if (!slug && req.nextUrl.pathname === '/') {
  return NextResponse.rewrite(new URL('/institucional', req.url));
}
```

- [ ] **Passo 3: Escrever a rota de lembretes**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { comBarbearia } from '@/lib/tenant';
import { enviarTexto } from '@/lib/whatsapp';
import { msgLembrete } from '@/lib/mensagens';
import { LEMBRETE_ANTECEDENCIA_MIN } from '@/lib/config';

export async function POST(req: Request) {
  const esperado = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== esperado) {
    return NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  }

  const limite = new Date(Date.now() + LEMBRETE_ANTECEDENCIA_MIN * 60_000);
  const barbearias = await prisma.barbearia.findMany({ where: { ativo: true } });

  let enviados = 0;
  for (const b of barbearias) {
    const pendentes = await comBarbearia(b.id, (tx) =>
      tx.agendamento.findMany({
        where: {
          status: 'CONFIRMADO', lembreteEnviadoEm: null,
          inicio: { gt: new Date(), lte: limite },
        },
        include: { barbeiro: { select: { nome: true } }, cliente: true },
      }),
    );

    for (const ag of pendentes) {
      // Marca ANTES de enviar: cron que dispara duas vezes não manda
      // dois lembretes. Perder um lembrete é melhor que duplicar.
      await comBarbearia(b.id, (tx) =>
        tx.agendamento.update({
          where: { id: ag.id }, data: { lembreteEnviadoEm: new Date() },
        }),
      );
      void enviarTexto(ag.cliente.whatsapp, msgLembrete({
        clienteNome: ag.cliente.nome, barbeiroNome: ag.barbeiro.nome,
        servicoNome: ag.servicoNome, inicio: ag.inicio, endereco: b.endereco,
      }));
      enviados += 1;
    }
  }

  return NextResponse.json({ enviados });
}
```

- [ ] **Passo 4: Verificar**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://brutus.localhost:3000/api/cron/lembretes
```

Esperado: `401`.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Adiciona stub do painel, institucional e rota de lembretes"
```

---

## Tarefa 20: Fechamento — suíte completa e README

**Arquivos:**
- Criar: `README.md`
- Modificar: `package.json` (script `test:ci`)

- [ ] **Passo 1: Rodar a suíte inteira**

```bash
npm test
```

Esperado: **todos** os arquivos passam. Total aproximado: 78 testes.

Se algum falhar, corrigir antes de seguir. Não comitar suíte vermelha.

- [ ] **Passo 2: Reconferir que o teste de vazamento pela pool não é decorativo**

Trocar `true` por `false` no `set_config` de `src/lib/tenant.ts`:

```bash
npm test -- tests/isolamento.test.ts
```

Esperado: **FALHA**. Reverter e confirmar que volta ao verde. Este é o teste que impede o pior bug do sistema — vale confirmar que ele morde.

- [ ] **Passo 3: Escrever o `README.md`**

````markdown
# BRUTUS — agenda para barbearias

Agendamento multi-tenant: cada barbearia tem o próprio subdomínio.

## Subir

```bash
cp .env.example .env
docker compose up
docker compose exec app npm run seed
```

- `http://brutus.localhost:3000`
- `http://dontony.localhost:3000`

`*.localhost` resolve sozinho no Chrome e no Firefox — não precisa mexer em DNS.

## Testar

```bash
docker compose up -d db
npm test
```

## O que saber antes de mexer

- **Nunca** consultar dado de barbearia fora de `comBarbearia()` — o RLS
  devolve zero linhas, e o bug parece "sumiu tudo".
- O runtime usa `DATABASE_URL_APP` (papel `brutus_app`). Apontar para
  `DATABASE_URL` desliga o isolamento: o dono da tabela ignora RLS.
- Conversão de fuso só em `src/lib/datas.ts`.
- Tabela nova com `barbeariaId` precisa de política de RLS. O teste
  `varredura estrutural` falha se você esquecer.

Spec: `docs/superpowers/specs/2026-08-05-brutus-agendamento-cliente-design.md`
````

- [ ] **Passo 4: Commit**

```bash
git add -A
git commit -m "Fecha a Etapa 1 com suite verde e README"
```

---

## Autorrevisão

**Cobertura do spec:**

| Seção | Tarefa |
|---|---|
| §2.1 Docker | 1 |
| §4 Constantes | 2 |
| §5.1 Modelos, papéis, unicidade por tenant | 2 |
| §5.2 RLS | 4 |
| §5.3 Código público | 14 |
| §5.4 Restrição de exclusão | 3 |
| §5.5 Seed | 5 |
| §6 Motor de slots | 9 |
| §7 Fuso | 6 |
| §8 Telefone | 7 |
| §9.1 Privacidade | 12, 15 |
| §9.2 Rotas | 12, 14, 15 |
| §9.3 Transação | 14 |
| §9.4 Tenant por subdomínio | 10 |
| §9.5 Auth do barbeiro | **fora do escopo — Etapa 2** (colunas criadas na Tarefa 2) |
| §10.1–10.4 Evolution | 13 |
| §10.5 Verificação de número | 13, 14 |
| §11 Telas | 11, 16, 17, 18 |
| §12 Testes | distribuídos |
| §13 Variáveis de ambiente | 1 |

**Lacunas conhecidas e conscientes:**
- `tests/cenarios.ts` é referenciado pelas Tarefas 14 e 15 e criado na 14. Quem executar a 15 primeiro precisa criá-lo antes.
- A Tarefa 16 recebe `?inicio=` vindo do calendário mas não o consome no estado inicial — vale acrescentar na revisão da Tarefa 17 se o fluxo de volta ficar quebrado.
- O `.ics` é gerado sem `DTSTAMP`; alguns clientes de calendário reclamam. Acrescentar se aparecer.

---

## Execução

Plano salvo. Duas formas de executar:

1. **Dirigida por subagentes (recomendada)** — um subagente novo por tarefa, revisão entre elas, iteração rápida.
2. **Execução inline** — tarefas nesta sessão, em lotes com checkpoints.
