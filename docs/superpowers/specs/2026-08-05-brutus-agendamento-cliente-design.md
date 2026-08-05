# BRUTUS — Sistema de agendamento · Etapa 1 (fluxo do cliente)

**Data:** 2026-08-05
**Origem do design:** projeto Claude Design `CRM sistema agendamento barbearia`, arquivo `Brutus Agendamento.dc.html`
**Status:** aprovado para implementação

---

## 1. Contexto

O design de origem é um **wireframe** — 12 telas em estilo rascunho (fonte manuscrita, escala de cinza) que definem estrutura, fluxo e regras de negócio, não identidade visual.

O sistema tem duas áreas que nunca se cruzam:

| Área | URL | Login |
|---|---|---|
| Cliente | `/` | não |
| Barbeiro / dono | `/painel` | sim |

Esta Etapa 1 entrega **apenas o fluxo do cliente**. O painel do barbeiro é a Etapa 2; equipe e cadastro de barbeiro são a Etapa 3.

### Multi-tenant desde a fundação

O produto não é o site de uma barbearia — é um serviço vendido a várias. Cada barbearia é um **tenant**, alcançado por subdomínio:

```
brutus.seuapp.com.br     → tenant "brutus"
dontony.seuapp.com.br    → tenant "dontony"
```

**Isolamento por linha, com Row Level Security do Postgres.** Toda tabela carrega `barbeariaId` e toda consulta passa por uma política de RLS que filtra **no banco**, antes do SQL da aplicação. Um `WHERE` esquecido devolve zero linhas em vez de vazar dado de outro cliente.

**Por que não um schema por barbearia.** O recurso `multiSchema` do Prisma serve a schemas fixos, conhecidos no build — não cria schema quando entra cliente novo. Fazer schema-por-tenant com Prisma exige um `PrismaClient` (e uma pool de conexões) por barbearia, migração rodando em laço com risco de divergir na metade, e não sobrevive a serverless. O ganho seria isolamento físico, exigência de banco e hospital — não de barbearia.

**O que a Etapa 1 entrega da multi-tenancy:** o encanamento inteiro — modelo, RLS, resolução de subdomínio, testes de vazamento. **O que não entrega:** cadastro de barbearia nova pela tela. As duas do `seed` bastam para desenvolver e provar o isolamento; onboarding é etapa própria (§14).

O encanamento vem agora porque `barbeariaId` em toda tabela é barato hoje e é migração em toda tabela depois.

### Decisão de visual

O visual reproduz o wireframe **literalmente**: fonte `Architects Daughter`, paleta cinza/branco, caixas de contorno. Isso é intencional para esta fase — permite validar o fluxo antes de investir em identidade visual. O CSS do wireframe é portado tal qual e encapsulado em componentes primitivos, de modo que a troca para um visual definitivo depois seja uma mudança de CSS, não de estrutura.

---

## 2. Stack

- **Next.js** (App Router) + **TypeScript**
- **PostgreSQL** + **Prisma**
- **Tailwind CSS v4**
- **Vitest** para testes
- **date-fns** + **date-fns-tz** para datas
- **Evolution API** para WhatsApp

### Como manter fidelidade ao wireframe usando Tailwind

O wireframe usa valores que não existem na escala padrão do Tailwind: borda de `1.5px` (e `2.5px` no estado selecionado), raio de `6px`, sombra sólida sem blur `2px 2px 0`, e uma paleta própria.

Escrever isso como valor arbitrário espalhado (`border-[1.5px] border-[#2a2a2a]`) daria o resultado certo e um código impossível de retemar depois — que é justamente o objetivo da Etapa 4.

Então os valores do wireframe viram **tokens de tema** no `@theme` do Tailwind v4 (§11.1), e os componentes consomem os tokens. Trocar o visual na Etapa 4 vira editar o bloco `@theme`, não caçar hex pelos componentes.

---

## 2.1 Ambiente — Docker

Banco e aplicação sobem juntos por `docker compose`. Nada precisa ser instalado na máquina além do Docker Desktop.

### Serviços

| Serviço | Imagem | Porta (host) | Papel |
|---|---|---|---|
| `db` | `postgres:16-alpine` | `5433` | Postgres, com volume nomeado `pgdata` |
| `app` | build local, target `dev` | `3000` | Next.js em modo dev com hot reload |

A porta do Postgres é publicada em **5433**, não 5432, para não colidir com um Postgres que já exista instalado na máquina.

### `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: brutus
      POSTGRES_PASSWORD: brutus
      POSTGRES_DB: brutus
    ports: ["5433:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U brutus -d brutus"]
      interval: 5s
      timeout: 3s
      retries: 10

  app:
    build: { context: ., target: dev }
    command: sh -c "npx prisma migrate deploy && npm run dev"
    environment:
      DATABASE_URL:     postgresql://brutus_owner:owner@db:5432/brutus  # migração (§5.2)
      DATABASE_URL_APP: postgresql://brutus_app:app@db:5432/brutus      # runtime, com RLS
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

### Decisões que não são óbvias

**`healthcheck` + `condition: service_healthy`.** `depends_on` sozinho só espera o contêiner *iniciar*, não o Postgres aceitar conexão. Sem o healthcheck, a primeira subida quebra na migração em uma corrida difícil de diagnosticar.

**Volumes anônimos em `/app/node_modules` e `/app/.next`.** O bind mount `.:/app` sobrepõe a pasta inteira do contêiner com a do host. Sem os dois volumes anônimos, o `node_modules` instalado na imagem some — e, no Windows, os binários instalados no host são de outra plataforma que a imagem Alpine não executa.

**`WATCHPACK_POLLING=true`.** Eventos de arquivo do sistema de arquivos do Windows não atravessam o bind mount até o contêiner Linux. Sem polling, o hot reload simplesmente não dispara.

**`openssl` no Dockerfile.** O engine do Prisma exige `openssl` — a imagem `node:22-alpine` não traz. Falta dele produz erro de engine que não menciona openssl em lugar nenhum.

**Duas `DATABASE_URL` diferentes.** Dentro do Compose o host é `db:5432`; da máquina (Prisma Studio, Vitest rodando no host) é `localhost:5433`. O `.env` documenta as duas — §13.

**`init-db.sql`.** Script de inicialização que cria, na primeira subida do volume:

- os papéis `brutus_owner` (dono, roda migração) e `brutus_app` (runtime, sujeito ao RLS) — §5.2
- o banco `brutus_test`, para os testes de integração (§12) não sujarem o de desenvolvimento

Roda **uma única vez**, quando o volume `pgdata` é criado. Mexer nele depois exige `docker compose down -v` — o que apaga o banco. Vale saber antes de passar meia hora sem entender por que a alteração não pegou.

### `Dockerfile`

Multi-stage com dois alvos:

- **`dev`** — `node:22-alpine` + `openssl`, `npm ci`, roda `next dev`. É o que o Compose usa.
- **`prod`** — build com `next build` e `output: 'standalone'`, imagem final sem dependências de desenvolvimento. Não é usado nesta etapa, mas fica pronto para o deploy.

Acompanha `.dockerignore` com `node_modules`, `.next`, `.git`, `.env`.

### Comandos do dia a dia

| O quê | Comando |
|---|---|
| Subir tudo | `docker compose up` |
| Recriar o banco do zero | `docker compose down -v && docker compose up` |
| Rodar migração | `docker compose exec app npx prisma migrate dev` |
| Popular o seed | `docker compose exec app npm run seed` |
| Ver o banco | `docker compose exec app npx prisma studio` |
| Logs do banco | `docker compose logs -f db` |

---

## 3. Estrutura de arquivos

```
Barbearia/
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
├── docker/
│   └── init-db.sql          # papéis brutus_owner/brutus_app + banco de teste
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   │   └── <ts>_indice_unico_parcial/migration.sql   # índice parcial (ver §5.3)
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                          # tela 3b
│   │   ├── calendario/page.tsx               # tela 4c
│   │   ├── agendamento/[codigo]/page.tsx     # tela 1b
│   │   ├── painel/page.tsx                   # stub (Etapa 2)
│   │   └── api/
│   │       ├── barbeiros/route.ts
│   │       ├── horarios/route.ts
│   │       ├── dias-com-vaga/route.ts
│   │       ├── agendamentos/route.ts
│   │       ├── agendamentos/[codigo]/route.ts
│   │       ├── agendamentos/[codigo]/cancelar/route.ts
│   │       └── cron/lembretes/route.ts
│   ├── components/wf/                        # primitivos do wireframe
│   │   ├── Box.tsx  Chip.tsx  Row.tsx  Lbl.tsx
│   │   ├── Sep.tsx  Avatar.tsx  StatusBar.tsx  Frame.tsx
│   │   └── index.ts
│   ├── components/
│   │   ├── SeletorBarbeiro.tsx
│   │   ├── SeletorServico.tsx
│   │   ├── ListaHorarios.tsx
│   │   ├── FormDados.tsx
│   │   └── MiniCalendario.tsx
│   ├── middleware.ts        # subdomínio → x-barbearia-slug
│   ├── lib/
│   │   ├── db.ts            # cliente Prisma singleton
│   │   ├── tenant.ts        # slug → Barbearia, e o comBarbearia() do RLS
│   │   ├── slots.ts         # motor de horários livres (função pura)
│   │   ├── servicos.ts      # resolve duração por barbeiro+serviço, valida o mínimo
│   │   ├── datas.ts         # helpers de fuso e conversão
│   │   ├── telefone.ts      # normalização e validação de WhatsApp
│   │   ├── whatsapp.ts      # Evolution API
│   │   ├── mensagens.ts     # textos das mensagens de WhatsApp
│   │   └── config.ts        # constantes
│   └── app/globals.css      # @import tailwind + bloco @theme com os tokens do wireframe
├── tests/
│   ├── slots.test.ts
│   ├── telefone.test.ts
│   └── api-agendamentos.test.ts
├── .env.example
└── docs/superpowers/specs/
```

---

## 4. Constantes (`src/lib/config.ts`)

```ts
export const FUSO = 'America/Sao_Paulo';

// Limites de duração de serviço — regra da barbearia, valem para todo serviço
export const DURACAO_MINIMA_MIN = 10;       // nada mais curto que 10min
export const DURACAO_MAXIMA_MIN = 60;       // nenhum serviço passa de 1h

export const GRANULARIDADE_MIN = 30;        // de quanto em quanto tempo um horário pode começar (§6.2.1)
export const ANTECEDENCIA_MINIMA_MIN = 0;   // quanto antes do horário ainda dá pra marcar
export const PRAZO_CANCELAMENTO_MIN = 60;   // cliente cancela até 1h antes (wireframe 1b)
export const DIAS_NA_HOME = 2;              // "hoje" e "amanhã" (wireframe 3b)
export const JANELA_MAXIMA_DIAS = 60;       // limite de consulta de agenda futura
export const LEMBRETE_ANTECEDENCIA_MIN = 60;

// Multi-tenant (§9.4)
export const SUBDOMINIOS_RESERVADOS = [
  'www', 'api', 'app', 'admin', 'painel', 'static', 'assets', 'cdn', 'mail',
] as const;
export const TTL_CACHE_TENANT_MS = 60_000;
export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/;
```

Todo número mágico do wireframe vira constante nomeada aqui. Nada de `60` solto no código.

---

## 5. Banco de dados

O schema contempla as três etapas desde já — campos que só a Etapa 2/3 usa ficam presentes mas não são escritos por esta entrega. Isso evita migração destrutiva depois.

### 5.1 Modelos

**`Barbearia`** — **a tabela de tenant**. Uma linha por cliente do produto.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `slug` | String @unique | o subdomínio: `brutus` → `brutus.seuapp.com.br` |
| `nome` | String | `"BRUTUS"` |
| `endereco` | String | `"Rua Aurora, 88"` |
| `horarioResumo` | String | `"seg a sáb, 9h–20h"` — texto de exibição do cabeçalho |
| `whatsappContato` | String | usado no aviso "passou do prazo — chama no zap" |
| `ativo` | Boolean @default(true) | barbearia inadimplente ou cancelada sai do ar sem perder dado |
| `criadoEm` | DateTime @default(now()) | |

`slug` é a única coluna do sistema com unicidade **global** — é o que identifica o tenant antes de existir tenant resolvido. Validação: `^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$` — minúsculas, dígitos e hífen, sem hífen nas pontas, 3 a 32 caracteres.

`ativo = false` derruba o subdomínio (§9.4) mas preserva os dados. Cancelar cliente nunca é `DELETE`.

Esta é a **única tabela sem `barbeariaId`** — ela *é* a barbearia — e a única fora do RLS (§5.2).

`horarioResumo` é texto livre de exibição, deliberadamente **não** derivado dos `HorarioTrabalho`. Derivar uma frase curta a partir da união das agendas de todos os barbeiros produz resultado ruim quando as agendas divergem; o dono edita a frase na Etapa 3.

#### Regra: `barbeariaId` em toda tabela

**Todas** as demais tabelas — `Barbeiro`, `Servico`, `BarbeiroServico`, `HorarioTrabalho`, `Bloqueio`, `Cliente`, `Agendamento` — carregam:

```prisma
barbeariaId String
barbearia   Barbearia @relation(fields: [barbeariaId], references: [id], onDelete: Restrict)
@@index([barbeariaId])
```

Inclusive quando a coluna é redundante. `BarbeiroServico` já saberia sua barbearia via `Barbeiro`; `Bloqueio` também. A coluna vai lá do mesmo jeito, porque **a política de RLS é por tabela** — uma política que precisasse de `JOIN` para achar o tenant seria lenta e frágil. Denormalização deliberada, paga em disco, comprada em segurança.

A integridade dessa redundância (o `barbeariaId` do `Bloqueio` sempre bate com o do seu `Barbeiro`) é garantida por chave estrangeira composta:

```sql
FOREIGN KEY ("barbeariaId", "barbeiroId")
  REFERENCES "Barbeiro" ("barbeariaId", "id")
```

Isso exige `@@unique([barbeariaId, id])` em `Barbeiro` — redundante como chave, necessária como alvo da FK composta. O banco passa a recusar um bloqueio da barbearia A apontando para um barbeiro da barbearia B. Sem isso, a denormalização seria uma segunda fonte de verdade capaz de divergir em silêncio.

#### Regra: unicidade é por tenant, nunca global

Toda restrição `@unique` do modelo original vira composta com `barbeariaId`:

| Antes | Depois | Por quê |
|---|---|---|
| `Barbeiro.whatsapp @unique` | `@@unique([barbeariaId, whatsapp])` | o mesmo barbeiro pode trabalhar em duas barbearias |
| `Cliente.whatsapp @unique` | `@@unique([barbeariaId, whatsapp])` | cada barbearia é dona da própria lista de clientes |
| `Servico` | `@@unique([barbeariaId, nome])` | cada barbearia tem o próprio catálogo |

Esquecer isso é o bug clássico de multi-tenant: o segundo cliente do produto tenta cadastrar um barbeiro e recebe "WhatsApp já existe" por causa de um barbeiro de **outra** barbearia, que ele não pode nem ver.

**Duas exceções, ambas propositais:**

- `Barbearia.slug` — global por definição (§5.1).
- `Agendamento.codigo` — global. É token de URL pública; unicidade global elimina qualquer chance de um código valer em dois tenants.

**`Barbeiro`**

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `barbeariaId` | String | FK |
| `nome` | String | como aparece pro cliente |
| `whatsapp` | String | dígitos apenas; vira o login na Etapa 2. Único **por barbearia** |
| `senhaHash` | String? | nulo = convite enviado, sem senha ainda |
| `fotoUrl` | String? | |
| `ativo` | Boolean @default(true) | desativado some da área do cliente |
| `ehDono` | Boolean @default(false) | Etapa 3 |
| `podeVerAgendaDosOutros` | Boolean @default(false) | Etapa 2 |
| `ordem` | Int @default(0) | ordem de exibição |
| `desativadoEm` | DateTime? | |
| `criadoEm` | DateTime @default(now()) | |

**`Servico`** — o catálogo da barbearia. Corte, barba, pezinho.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `barbeariaId` | String | FK — cada barbearia tem o próprio catálogo |
| `nome` | String | `"Corte"`, `"Barba"`, `"Corte + Barba"` |
| `duracaoMinimaMin` | Int | **piso deste serviço** — nenhum barbeiro pode marcar abaixo disso |
| `duracaoSugeridaMin` | Int | valor pré-preenchido ao habilitar o serviço para um barbeiro |
| `ativo` | Boolean @default(true) | serviço fora de linha some sem apagar histórico |
| `ordem` | Int @default(0) | ordem de exibição |

`duracaoMinimaMin` é uma regra da barbearia ("barba decente não sai em menos de 15 minutos"), não do barbeiro. Por isso vive aqui e não na tabela de junção.

#### Os dois tetos e o piso

São três limites diferentes, e confundi-los produz bug silencioso:

| Limite | Onde vive | Vale para |
|---|---|---|
| `DURACAO_MINIMA_MIN` = 10 | constante | **todo** serviço, sem exceção |
| `DURACAO_MAXIMA_MIN` = 60 | constante | **todo** serviço, sem exceção |
| `Servico.duracaoMinimaMin` | banco, por serviço | só aquele serviço (barba ≥ 15, corte ≥ 20…) |

Encadeamento obrigatório:

```
10 ≤ duracaoMinimaMin ≤ duracaoSugeridaMin ≤ 60
10 ≤ BarbeiroServico.duracaoMin ≤ 60
BarbeiroServico.duracaoMin ≥ Servico.duracaoMinimaMin
```

As duas primeiras linhas são de tabela única, então viram `CHECK` no Postgres — o banco recusa dado inválido mesmo que algum código futuro esqueça de validar:

```sql
ALTER TABLE "Servico" ADD CONSTRAINT servico_duracao_valida CHECK (
  "duracaoMinimaMin"  BETWEEN 10 AND 60 AND
  "duracaoSugeridaMin" BETWEEN "duracaoMinimaMin" AND 60
);

ALTER TABLE "BarbeiroServico" ADD CONSTRAINT barbeiro_servico_duracao_valida CHECK (
  "duracaoMin" BETWEEN 10 AND 60
);
```

A terceira linha cruza duas tabelas — `CHECK` não alcança. Fica em `lib/servicos.ts`, e é testada (§12).

Os números 10 e 60 aparecem literalmente no SQL porque `CHECK` não lê constante de TypeScript. É duplicação real: se `DURACAO_MAXIMA_MIN` mudar, a migração tem que mudar junto. Um comentário no `config.ts` aponta para a migração, e um teste confere que constante e banco concordam — assim a divergência falha em teste, não em produção.

**`BarbeiroServico`** — quais serviços cada barbeiro faz, e em quanto tempo.

| Campo | Tipo | Nota |
|---|---|---|
| `barbeiroId` | String | FK, `onDelete: Cascade` |
| `servicoId` | String | FK, `onDelete: Restrict` |
| `duracaoMin` | Int | a duração **deste** barbeiro neste serviço |
| `ativo` | Boolean @default(true) | barbeiro pode não oferecer um serviço |

`@@id([barbeiroId, servicoId])` — chave composta, sem `id` próprio.

**Invariante que o banco não alcança:** `duracaoMin >= Servico.duracaoMinimaMin`. Cruza duas tabelas, então fica em `lib/servicos.ts`:

```ts
function validarDuracao(duracaoMin: number, servico: Servico): void;
// lança se < DURACAO_MINIMA_MIN, > DURACAO_MAXIMA_MIN, ou < servico.duracaoMinimaMin
// chamado em todo caminho de escrita
```

O validador confere os três limites, não só o do serviço — mesmo os dois que o `CHECK` já cobre. Redundância proposital: a mensagem de erro do validador é legível pro barbeiro na tela da Etapa 3; a do `CHECK` é um despejo do Postgres. O `CHECK` é a rede embaixo, não a porta da frente.

Nada escreve nessa tabela na Etapa 1 (as durações vêm do seed), mas o validador é escrito e testado agora, para a tela de edição da Etapa 3 já nascer protegida.

A ausência de linha em `BarbeiroServico` significa "este barbeiro não faz este serviço" — não existe fallback para uma duração padrão. Um barbeiro sem nenhum serviço ativo simplesmente não aparece na área do cliente.

**`HorarioTrabalho`** — expediente semanal do barbeiro.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `barbeiroId` | String | FK, `onDelete: Cascade` |
| `diaSemana` | Int | 0=domingo … 6=sábado |
| `minutosInicio` | Int | minutos desde meia-noite, hora local (540 = 09:00) |
| `minutosFim` | Int | 1200 = 20:00 |

`@@unique([barbeiroId, diaSemana])` — um bloco de expediente por dia.

`CHECK ("minutosInicio" >= 0 AND "minutosFim" <= 1440 AND "minutosFim" > "minutosInicio")` — expediente que termina antes de começar não entra no banco.

Horários são guardados como **minutos desde a meia-noite local**, não como `DateTime`. Um expediente é uma regra recorrente ("das 9 às 20"), não um instante; guardar como instante obriga a carregar um fuso que não significa nada.

#### Regra: nada é aberto por padrão

**A agenda de um barbeiro só existe depois que ele declara que horas entra e que horas sai.** Não há expediente padrão da barbearia, não há fallback, não há "se estiver vazio assume 9h–18h".

Consequências, todas intencionais:

- Dia sem `HorarioTrabalho` → `slotsLivres` devolve `[]`. Não é caso de erro; é o estado normal de um dia que o barbeiro não abriu.
- Barbeiro recém-cadastrado tem agenda **vazia** até preencher o expediente. Não aparece para o cliente enquanto isso (§9.2, `GET /api/barbeiros`).
- `Barbearia.horarioResumo` (`"seg a sáb, 9h–20h"`) é **texto de vitrine**, não regra. Nenhum cálculo o consulta. Se divergir do expediente real dos barbeiros, quem manda é o expediente.

O risco que isso troca: um barbeiro sem expediente some da tela do cliente em silêncio. É o comportamento certo — melhor sumir do que oferecer horário que ninguém vai atender — mas a tela de equipe da Etapa 3 precisa mostrar isso em destaque, senão o dono não entende por que o funcionário novo não recebe cliente.

#### Mudança pontual de horário

Barbeiro que num dia específico entra mais tarde ou sai mais cedo **não** edita o expediente — cria um `Bloqueio` pontual (chegou 11h em vez de 9h → bloqueio das 9h às 11h). O expediente semanal continua sendo a regra; o bloqueio é a exceção do dia.

É o que o wireframe 1f já desenha, com os chips `almoço · folga · pessoal` e o toggle `repetir toda semana`. Não entra tabela de exceção de data nenhuma — `Bloqueio` já resolve.

**`Bloqueio`** — almoço, folga, compromisso pessoal.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `barbeiroId` | String | FK, `onDelete: Cascade` |
| `motivo` | Enum `MotivoBloqueio` | `ALMOCO \| FOLGA \| PESSOAL \| OUTRO` |
| `observacao` | String? | |
| `repeteSemanalmente` | Boolean | discriminador |
| `diaSemana` | Int? | preenchido ⇔ `repeteSemanalmente = true` |
| `minutosInicio` | Int? | idem |
| `minutosFim` | Int? | idem |
| `inicio` | DateTime? | preenchido ⇔ `repeteSemanalmente = false` |
| `fim` | DateTime? | idem |
| `criadoEm` | DateTime @default(now()) | |

**Invariante:** exatamente um dos dois conjuntos está preenchido.
- `repeteSemanalmente = true` → `diaSemana`, `minutosInicio`, `minutosFim` não-nulos; `inicio`/`fim` nulos.
- `repeteSemanalmente = false` → `inicio`, `fim` não-nulos; os três primeiros nulos.

A invariante é garantida por um `CHECK` na migração SQL, e a leitura em `slots.ts` valida de novo antes de usar (defesa em camadas — dado inválido no banco deve falhar alto, não gerar agenda errada em silêncio).

**`Cliente`**

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `barbeariaId` | String | FK |
| `nome` | String | |
| `whatsapp` | String | dígitos apenas, com DDD. Único **por barbearia** |
| `criadoEm` | DateTime @default(now()) | |

O cliente é identificado pelo WhatsApp. Ao agendar, faz-se `upsert`: se o número já existe, o `nome` é **atualizado** para o informado agora (a pessoa pode ter digitado o nome diferente ou corrigido).

**`Agendamento`**

| Campo | Tipo | Nota |
|---|---|---|
| `id` | String @id @default(uuid()) | |
| `barbeariaId` | String | FK |
| `codigo` | String @unique | 10 caracteres, URL pública — único **globalmente** |
| `barbeiroId` | String | FK |
| `clienteId` | String | FK |
| `servicoId` | String | FK, `onDelete: Restrict` |
| `servicoNome` | String | nome do serviço no momento da marcação |
| `inicio` | DateTime | UTC |
| `fim` | DateTime | UTC |
| `duracaoMin` | Int | duração no momento da marcação |
| `status` | Enum `StatusAgendamento` | `CONFIRMADO \| CANCELADO_CLIENTE \| CANCELADO_BARBEIRO` |
| `criadoEm` | DateTime @default(now()) | |
| `canceladoEm` | DateTime? | |
| `lembreteEnviadoEm` | DateTime? | evita lembrete duplicado se o cron rodar duas vezes (§9.2) |

`duracaoMin` e `servicoNome` são **cópias**, não leituras via join na hora de exibir. Se o Téo mudar a barba de 30 para 45 min, ou o dono renomear "Corte" para "Corte masculino", os agendamentos já marcados não podem mudar retroativamente — o cliente combinou o que estava escrito naquele dia. O `servicoId` continua lá para relatório e filtro; o nome guardado é o que a tela mostra.

Índices: `@@index([barbeiroId, inicio])`, `@@index([clienteId])`, `@@index([servicoId])`.

### 5.2 Row Level Security

O isolamento entre barbearias vive **no banco**, não na aplicação. Se todo o código de consulta fosse reescrito errado amanhã, o Postgres continuaria não entregando linha de outro tenant.

#### Dois papéis, e por que isso não é opcional

```sql
-- dono do schema: roda migração, é dono das tabelas
CREATE ROLE brutus_owner LOGIN PASSWORD '...';

-- papel da aplicação: só DML, jamais dono de nada
CREATE ROLE brutus_app LOGIN PASSWORD '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO brutus_app;
```

**O dono de uma tabela ignora RLS por padrão.** Se a aplicação conectar com o papel que rodou a migração — o comportamento normal de um projeto Prisma com uma `DATABASE_URL` só — todas as políticas abaixo são decorativas, e o vazamento passa por todos os testes que não testarem isolamento.

Por isso: `DATABASE_URL` (migração, `brutus_owner`) e `DATABASE_URL_APP` (runtime, `brutus_app`) são conexões **diferentes**, com papéis diferentes. O `docker/init-db.sql` cria os dois.

Como segunda camada, toda tabela leva `FORCE ROW LEVEL SECURITY`, que aplica as políticas até ao dono. Cinto e suspensório: se alguém um dia apontar a aplicação para a `DATABASE_URL` errada, ainda não vaza.

#### As políticas

Para cada tabela com `barbeariaId`:

```sql
ALTER TABLE "Agendamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agendamento" FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Agendamento"
  USING      ("barbeariaId" = current_setting('app.barbearia_id', true))
  WITH CHECK ("barbeariaId" = current_setting('app.barbearia_id', true));
```

Três detalhes que carregam o peso todo:

**`USING` e `WITH CHECK`, os dois.** `USING` filtra o que sai (SELECT, UPDATE, DELETE). `WITH CHECK` valida o que entra (INSERT, UPDATE). Só `USING` deixaria a barbearia A **gravar** linha carimbada como B — e depois não conseguir enxergar o que criou.

**O `true` em `current_setting(..., true)`** é `missing_ok`. Sem ele, qualquer consulta feita antes de a variável ser definida derruba com erro. Com ele, retorna `NULL`, e `"barbeariaId" = NULL` é `NULL` — que o RLS trata como falso. **Zero linhas.** Falha fechada: esquecer de definir o tenant não vaza tudo, não retorna nada.

**`Barbearia` fica fora do RLS.** Precisa ser lida *antes* de existir tenant, para traduzir subdomínio em id. O acesso é restrito por `GRANT`: `brutus_app` só recebe `SELECT` nela, nunca `INSERT`/`UPDATE`/`DELETE` — cadastro de barbearia é operação de `brutus_owner`.

#### Definindo o tenant a cada requisição

```ts
// lib/tenant.ts
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

**O terceiro argumento `true` de `set_config` é o detalhe mais perigoso deste documento.**

`true` = `is_local`: a variável vale só até o fim **da transação**. `false` valeria pela **sessão** — e como a conexão volta para a pool ao final da requisição, o próximo cliente a pegar aquela conexão herdaria o tenant do anterior. Vazamento cruzado intermitente, dependente de temporização de pool, praticamente impossível de reproduzir em desenvolvimento.

Por isso **toda** consulta de dado de tenant acontece dentro de `comBarbearia`. Nunca `prisma.agendamento.findMany()` direto — fora da transação não há variável definida, e o RLS devolve zero linhas. É desconfortável de propósito: o jeito errado não funciona em silêncio, ele não funciona.

#### Ordem da migração

O `prisma migrate` gera as tabelas; RLS e papéis não cabem no schema do Prisma. A migração é criada com `--create-only` e recebe, à mão e **nesta ordem**:

1. `CREATE ROLE` / `GRANT` (ou, se os papéis já vieram do `init-db.sql`, só os `GRANT` das tabelas novas)
2. `ENABLE` + `FORCE ROW LEVEL SECURITY` por tabela
3. `CREATE POLICY` por tabela
4. as chaves estrangeiras compostas de §5.1

**Tabela nova criada depois sem política é tabela que vaza.** Um teste varre `pg_class` e falha se existir tabela com coluna `barbeariaId` sem `rowsecurity` ligado (§12) — a checagem que impede o esquecimento de virar incidente.

### 5.3 Código público do agendamento

`codigo` usa `nanoid(10)` com alfabeto sem caracteres ambíguos (sem `0/O`, `1/l/I`). É a única credencial da tela 1b — quem tem o link cancela. Isso é aceitável porque o dano máximo é cancelar o próprio corte, e o wireframe não prevê login de cliente. 10 caracteres em alfabeto de 32 dão espaço suficiente contra tentativa às cegas.

### 5.4 Restrição de exclusão (proteção contra sobreposição)

Migração SQL escrita à mão:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Agendamento"
  ADD CONSTRAINT agendamento_sem_sobreposicao
  EXCLUDE USING gist (
    "barbeiroId" WITH =,
    tstzrange("inicio", "fim", '[)') WITH &&
  )
  WHERE (status = 'CONFIRMADO');
```

Prisma não expressa isso no schema, então a migração é criada com `prisma migrate dev --create-only` e editada à mão.

**Por que não um índice único em `(barbeiroId, inicio)`.** Um índice único só pega agendamentos que começam no *mesmo instante*. Com durações variáveis por serviço (§5.1) e grade de 30 min (§6.2.1), a sobreposição perigosa não começa junto: um corte de 40 min às 16:00 termina 16:40 e colide com uma barba às 16:30 — dois `inicio` diferentes, índice único satisfeito, e o barbeiro com dois clientes na cadeira.

A restrição de exclusão compara **intervalos**, não instantes. `&&` é o operador de sobreposição de ranges; `[)` é o range semiaberto — o mesmo `[início, fim)` de §6.2, então um corte que acaba 16:40 e outro que começa 16:40 continuam convivendo.

O `WHERE (status = 'CONFIRMADO')` mantém a restrição parcial: um horário cancelado volta a ficar livre em vez de ficar preso para sempre.

`btree_gist` é necessário porque o GiST puro não sabe indexar igualdade de `text` — a extensão é padrão do Postgres, sem instalação externa.

Esta é a **única** garantia real contra dupla marcação. A revalidação de §9.3 existe para dar mensagem de erro decente; o banco é quem impede.

**Não leva `barbeariaId`.** A restrição já se ancora em `barbeiroId`, que é UUID global — um barbeiro pertence a exatamente uma barbearia, então dois agendamentos com o mesmo `barbeiroId` são necessariamente do mesmo tenant. Acrescentar `barbeariaId` só engordaria o índice.

Vale saber que **restrições de unicidade e exclusão enxergam a tabela inteira, ignorando RLS.** É o comportamento correto aqui — a garantia tem que valer sempre. Mas é a razão pela qual as unicidades de §5.1 precisaram virar compostas na mão: o RLS não as escopa sozinho.

### 5.5 Seed

**Duas barbearias, não uma.** Uma só esconderia todo bug de isolamento — com um tenant, código sem filtro nenhum funciona perfeitamente. A segunda existe para que o vazamento apareça na tela, não em produção.

| slug | nome | papel no seed |
|---|---|---|
| `brutus` | BRUTUS | o cenário do wireframe, completo |
| `dontony` | Dom Tony | barbearia-controle: outros barbeiros, outros serviços, outros clientes, outros horários |

Nenhum dado é compartilhado entre as duas — nem nome de barbeiro, nem telefone de cliente, nem catálogo. Assim qualquer linha da Dom Tony aparecendo em `brutus.localhost:3000` é evidência imediata de furo.

Em desenvolvimento, `brutus.localhost:3000` e `dontony.localhost:3000` funcionam sem configurar nada — Chrome e Firefox resolvem `*.localhost` para 127.0.0.1 nativamente.

O conteúdo da **BRUTUS** reproduz o wireframe:

- `Barbearia` — BRUTUS, Rua Aurora 88, seg a sáb 9h–20h
- `Barbeiro` **Téo** — dono, seg–sáb, 9h–20h
- `Barbeiro` **Rael** — ter–sáb, 10h–19h
- `Bloqueio` de almoço 12:00–13:00, `repeteSemanalmente = true`, para ambos
- Alguns `Agendamento` de exemplo no dia corrente, para a tela não nascer vazia

`Servico` — o catálogo:

| Serviço | mínimo | sugerido |
|---|---|---|
| Corte | 20 | 40 |
| Barba | 15 | 30 |
| Corte + Barba | 40 | 60 |
| Pezinho | 10 | 15 |

Todos dentro de 10–60. `Corte + Barba` encosta no teto e `Pezinho` encosta no piso — de propósito: o seed exercita as duas bordas, então uma migração que erre o `CHECK` falha já no `npm run seed`, não meses depois.

`BarbeiroServico` — durações propositalmente **diferentes entre os dois barbeiros**:

| | Corte | Barba | Corte + Barba | Pezinho |
|---|---|---|---|---|
| **Téo** | 40 | 30 | 60 | 15 |
| **Rael** | 30 | 45 | 60 | — |

Rael não faz pezinho (linha ausente), é mais rápido no corte e mais lento na barba. No combo os dois batem no teto de 60 — não dá pra diferenciar sem estourar a regra.

Com esse seed, a grade de horários muda visivelmente ao trocar de barbeiro ou de serviço. Se algum bug fizer a duração ser ignorada, aparece na primeira tela que você abrir — não em produção.

Os números são chute plausível. O dono ajusta na Etapa 3; o que importa aqui é a forma.

---

## 6. Motor de horários livres (`src/lib/slots.ts`)

O núcleo do sistema. **Função pura** — recebe dados já carregados, não toca no banco. Isso é o que a torna testável sem subir Postgres.

### 6.1 Assinatura

```ts
type Slot = { inicio: Date; fim: Date; barbeiroId: string };

type EntradaSlots = {
  barbeiroId: string;
  duracaoMin: number;   // do BarbeiroServico — quanto ESTE barbeiro leva NESTE serviço
  expediente: { diaSemana: number; minutosInicio: number; minutosFim: number }[];
  bloqueios: Bloqueio[];
  agendamentos: { inicio: Date; fim: Date }[];  // só CONFIRMADO
  dia: string;      // 'YYYY-MM-DD' no fuso local
  agora: Date;      // injetado, nunca `new Date()` dentro da função
};

function slotsLivres(e: EntradaSlots): Slot[];
```

Duas escolhas deliberadas na assinatura:

**`duracaoMin` é parâmetro, não é buscado.** A função não conhece `Servico` nem `BarbeiroServico` — quem chama resolve a duração e entrega pronta. Isso mantém a função pura e faz o teste de "barba de 30 min gera grade diferente de corte de 40" ser uma linha, sem montar catálogo nenhum.

**`agora` é parâmetro, não `new Date()` interno.** Sem isso, todo teste de "horário que já passou" vira refém do relógio da máquina.

### 6.2 Algoritmo

1. Achar o `HorarioTrabalho` do `diaSemana` correspondente ao `dia`. Não achou → retorna `[]` (barbeiro não atende nesse dia).
2. Gerar candidatos de `minutosInicio` até `minutosFim`, **passo `GRANULARIDADE_MIN`**. Cada slot ocupa `[t, t + duracaoMin)`. Descartar slot cujo fim ultrapasse `minutosFim` — não adianta oferecer 19:40 para um serviço de 60 min num expediente que fecha às 20h.
3. Converter cada candidato de (dia local + minutos) para instante UTC — ver §7.
4. Remover slots que colidem com bloqueio. Bloqueio semanal só se aplica se `diaSemana` bate; bloqueio pontual se aplica se cai no dia.
5. Remover slots que colidem com agendamento confirmado.
6. Remover slots com `inicio < agora + ANTECEDENCIA_MINIMA_MIN`.

**Teste de colisão** (uma só função, usada nos passos 4 e 5):

```ts
const colide = (aIni: Date, aFim: Date, bIni: Date, bFim: Date) =>
  aIni < bFim && aFim > bIni;
```

Intervalos são semiabertos `[início, fim)`. Um corte que termina 16:40 e outro que começa 16:40 **não** colidem.

### 6.2.1 Por que o passo é a granularidade, e não a duração

O passo da grade (`GRANULARIDADE_MIN`, 30) é **independente** da duração do serviço. São coisas diferentes: o passo diz *de quanto em quanto tempo um horário pode começar*; a duração diz *quanto tempo ele ocupa*.

Se o passo fosse a duração, a agenda se fragmentaria: uma barba de 30 min nunca caberia na brecha entre dois cortes de 40, porque a grade da barba só ofereceria múltiplos de 30 a partir da abertura, ignorando onde as brechas reais estão.

É também o que o wireframe 3b desenha: `15:30 · 16:00 · 17:00 · 18:30`. Esses intervalos irregulares só existem se os horários vierem das brechas da agenda, não de uma grade fixa.

Consequência aceita: horários oferecidos podem se sobrepor entre si. Com corte de 40 min, tanto 16:00 quanto 16:30 aparecem livres, e marcar um remove o outro. É o comportamento correto — e é exatamente por isso que a revalidação dentro da transação (§9.3) existe.

A grade é ancorada na **abertura do expediente**, não no relógio. Expediente das 9h com passo 30 dá 9:00, 9:30, 10:00. Expediente das 8h45 daria 8:45, 9:15, 9:45 — intencional: o barbeiro que abre às 8h45 quer atender às 8h45.

### 6.3 "Tanto faz"

Quando o cliente não escolhe barbeiro, roda `slotsLivres` para **cada barbeiro ativo que oferece o serviço escolhido** — cada um com a sua própria `duracaoMin` — e faz a união, agrupando por horário.

Se dois barbeiros têm 16:00 livre, aparece **um** chip 16:00, atribuído ao de menor `ordem`. O `barbeiroId` resolvido viaja no payload, e o botão mostra o nome (`confirmar 16:00 com Téo`) — o cliente nunca marca com "ninguém".

Com durações diferentes, a união fica assimétrica de propósito: se o Rael faz corte em 30 e o Téo em 40, um 16:30 pode existir só na agenda do Rael. Isso está certo — o horário existe de verdade, com aquele barbeiro. O que o cliente vê é a disponibilidade real da barbearia, não a interseção.

---

## 7. Fuso horário (`src/lib/datas.ts`)

Regra única: **o banco guarda UTC, a tela mostra `America/Sao_Paulo`, e a conversão acontece só nesses dois helpers.**

```ts
localParaUtc(dia: string, minutos: number): Date   // '2026-08-05', 960 → instante UTC
utcParaLocal(d: Date): { dia: string; minutos: number };
formatarHora(d: Date): string;                     // '16:00'
formatarDiaLongo(d: Date): string;                 // 'qua 5 ago'
rotuloRelativo(dia: string, hoje: string): string; // 'hoje' | 'amanhã' | 'qua 5'
```

Nenhum outro arquivo chama `date-fns-tz` diretamente. Espalhar conversão de fuso é o jeito mais rápido de produzir bug de agenda que só aparece em outubro.

O Brasil não tem horário de verão desde 2019, mas os helpers usam a base de fusos da IANA em vez de deslocamento fixo `-03:00`, para o dia em que voltar.

---

## 8. Telefone (`src/lib/telefone.ts`)

```ts
normalizar(entrada: string): string | null;  // '(11) 9 7777-1234' → '11977771234'
formatar(digitos: string): string;           // '11977771234' → '(11) 9 7777-1234'
```

Regras de validação:
- Só dígitos após limpeza; aceita `+55` opcional no início e o remove.
- 11 dígitos (DDD + 9 + 8 dígitos) ou 10 dígitos (fixo, DDD + 8).
- DDD entre 11 e 99.
- Inválido → `null`, e a API responde 422 com mensagem em português.

O mesmo formato normalizado (só dígitos, sem `+55`) é gravado em `Cliente.whatsapp` e `Barbeiro.whatsapp`. O `+55` é acrescentado só na hora de falar com a Evolution API.

---

## 9. API

Todas as rotas respondem JSON. Erro tem o formato `{ erro: string }` com mensagem em português, pronta pra exibir.

### 9.1 Contrato de privacidade

> As rotas públicas **nunca** retornam nome de cliente, telefone de cliente, motivo de bloqueio, nem quais horários estão ocupados. Retornam exclusivamente o que está livre — e sempre dentro de um único tenant.

A única exceção é `GET /api/agendamentos/[codigo]`, que devolve os dados do próprio agendamento a quem tem o código.

São dois contratos empilhados, com mecanismos diferentes:

| Contrato | Protege de | Onde é imposto |
|---|---|---|
| Privacidade | um cliente ver dado de outro cliente **da mesma** barbearia | forma da resposta, no código da rota |
| Isolamento | uma barbearia ver dado de **outra** barbearia | RLS, no Postgres (§5.2) |

O de cima depende de disciplina e é testado por regressão; o de baixo o banco garante. Nenhum substitui o outro: o RLS não sabe que "nome do cliente das 16h" não pode aparecer para quem marcou as 17h.

Toda rota resolve o tenant pelo `Host` (§9.4) e roda dentro de `comBarbearia`.

Isso é requisito, não detalhe de implementação: o wireframe 3b diz explicitamente *"horário ocupado, bloqueio e nome de outro cliente não entram nesta tela"*. Filtrar no front não basta — o dado não pode sair do servidor.

### 9.2 Rotas

**`GET /api/barbeiros`**
```json
{ "barbeiros": [{ "id": "...", "nome": "Téo", "fotoUrl": null }] }
```
Só `ativo = true` **e com pelo menos um serviço ativo**, ordenado por `ordem`.

**`GET /api/servicos?barbeiroId=<id|qualquer>`**
```json
{ "servicos": [{ "id": "...", "nome": "Corte", "duracaoMin": 40 }] }
```
Com `barbeiroId`, devolve os serviços daquele barbeiro com a duração **dele**. Com `qualquer`, devolve a união dos serviços oferecidos por algum barbeiro ativo, e `duracaoMin` traz a **menor** duração entre eles — é o que a tela mostra como estimativa (`Corte · a partir de 30min`), já que o barbeiro só é resolvido na escolha do horário.

**`GET /api/horarios?barbeiroId=<id|qualquer>&servicoId=<id>&de=YYYY-MM-DD&dias=<n>`**
```json
{ "dias": [
  { "data": "2026-08-05", "rotulo": "hoje · qua 5",
    "slots": [{ "hora": "15:30", "inicio": "2026-08-05T18:30:00Z",
                "fim": "2026-08-05T19:10:00Z",
                "barbeiroId": "...", "barbeiroNome": "Téo", "duracaoMin": 40 }] }
]}
```
`servicoId` é **obrigatório** — sem serviço não existe duração, e sem duração não existe grade. `dias` limitado a `JANELA_MAXIMA_DIAS`. Dia sem vaga vem com `slots: []` — a tela decide se esconde.

**`GET /api/dias-com-vaga?barbeiroId=<id|qualquer>&servicoId=<id>&mes=YYYY-MM`**
```json
{ "dias": [5, 6, 7, 8, 10, 12, 13, 15] }
```
Alimenta o mini-calendário (4c): dia na lista = círculo, fora da lista = apagado. Depende do serviço — um dia pode ter vaga para pezinho de 15 min e nenhuma para corte + barba de 60.

**`POST /api/agendamentos`**
```json
{ "barbeiroId": "...", "servicoId": "...", "inicio": "2026-08-05T19:00:00Z",
  "nome": "Marcos Vinícius", "whatsapp": "(11) 9 7777-1234" }
```
→ `201 { "codigo": "k7m2xq9pdt" }`

O servidor **ignora** qualquer duração que venha do cliente e resolve `duracaoMin` a partir de `BarbeiroServico`. Duração enviada pelo navegador é sugestão de atacante, não dado.

Erros:
| Código | Quando | Mensagem |
|---|---|---|
| 422 | nome vazio ou WhatsApp inválido | `"Confere o WhatsApp — parece faltar dígito."` |
| 409 | slot foi ocupado no meio do caminho | `"Esse horário acabou de ser pego. Escolhe outro?"` |
| 422 | slot não existe na grade (fora do expediente, bloqueado, no passado) | `"Esse horário não está mais disponível."` |
| 422 | barbeiro não oferece o serviço (sem `BarbeiroServico` ativo) | `"Esse barbeiro não faz esse serviço."` |

**`GET /api/agendamentos/[codigo]`** — alimenta a tela 1b.
```json
{ "codigo": "...", "clienteNome": "Marcos", "barbeiroNome": "Téo",
  "servicoNome": "Corte", "duracaoMin": 40,
  "inicio": "...", "fim": "...", "status": "CONFIRMADO",
  "podeCancelar": true, "endereco": "Rua Aurora, 88",
  "whatsappBarbearia": "(11) 9 8888-7777" }
```
`podeCancelar` é calculado no servidor. A tela não recalcula prazo — só obedece.

**`POST /api/agendamentos/[codigo]/cancelar`**
→ `200 { "ok": true }` ou `422 { "erro": "Passou do prazo de 1h. Chama a barbearia no zap: (11) 9 8888-7777" }`

O prazo é reconferido no servidor mesmo com `podeCancelar: false` na tela. Botão desabilitado não é controle de acesso.

**`POST /api/cron/lembretes`** — protegida por header `Authorization: Bearer ${CRON_SECRET}`. Busca agendamentos `CONFIRMADO` que começam dentro de `LEMBRETE_ANTECEDENCIA_MIN` e têm `lembreteEnviadoEm = null`, dispara a mensagem e marca a coluna. A marcação é o que torna a rota **idempotente** — cron que dispara duas vezes não manda dois lembretes. A rota fica pronta nesta etapa; **ligar o agendador é trabalho de deploy, fora do escopo**.

### 9.3 Transação de agendamento

```
BEGIN
  busca BarbeiroServico(barbeiroId, servicoId) ativo  → não achou: 422
  duracaoMin := BarbeiroServico.duracaoMin            (nunca o que veio do cliente)
  fim := inicio + duracaoMin
  upsert Cliente por whatsapp (atualiza nome)
  recarrega expediente/bloqueios/agendamentos do barbeiro para o dia
  recalcula slotsLivres(duracaoMin, agora = new Date())
  se `inicio` não está entre os livres → 422
  insert Agendamento status=CONFIRMADO, servicoNome e duracaoMin copiados
COMMIT
```

Se o insert violar `agendamento_sem_sobreposicao` (código Postgres **`23P01`**, `exclusion_violation` — não `23505`), captura e responde **409**.

Duas camadas, papéis diferentes: a revalidação do passo 6 pega o caso comum e produz mensagem boa; a restrição do banco pega a corrida de milissegundos e é a que **garante**. Nunca remover a segunda por achar que a primeira basta.

Tudo isso roda dentro de `comBarbearia` (§5.2) — a transação do RLS **é** a transação do agendamento, não uma segunda aninhada.

### 9.4 Resolução do tenant

Toda requisição precisa saber a que barbearia pertence antes de tocar em dado. A cadeia:

```
Host: brutus.seuapp.com.br
  → middleware extrai o subdomínio           "brutus"
  → header interno x-barbearia-slug          "brutus"
  → lib/tenant.ts traduz slug → Barbearia    { id, nome, endereco, ... }
  → comBarbearia(id, …) define o RLS         toda consulta filtrada
```

#### `middleware.ts`

Roda no Edge, **não** toca no banco. Só faz trabalho de string:

1. Lê o `Host`, tira a porta.
2. Extrai o primeiro rótulo se o host termina no domínio-base (`NEXT_PUBLIC_DOMINIO_BASE`, ex. `seuapp.com.br` ou `localhost`).
3. Sem subdomínio (o domínio nu) → página institucional do produto. Fora do escopo desta etapa: por ora, uma página estática explicando o que é o serviço.
4. Subdomínio reservado (`www`, `api`, `app`, `admin`, `painel`, `static`, `assets`, `mail`, `cdn`) → tratado como domínio nu, nunca como tenant.
5. Caso contrário, injeta `x-barbearia-slug` na requisição.

O middleware **apaga** qualquer `x-barbearia-slug` que venha de fora antes de escrever o seu. Sem isso, um `curl -H "x-barbearia-slug: dontony"` escolheria o tenant à mão — o header é canal interno, e tudo que vem do cliente é hostil até prova em contrário.

#### `lib/tenant.ts`

```ts
export const barbeariaAtual = cache(async (): Promise<Barbearia> => { … });
```

Envolvido no `cache()` do React: várias chamadas na mesma requisição batem no banco **uma vez**. A consulta usa o `PrismaClient` fora de `comBarbearia`, porque `Barbearia` está fora do RLS (§5.2) — é justamente a tabela que precisa ser lida antes de existir tenant.

Slug inexistente ou `ativo = false` → **404**, com página própria ("essa barbearia não está no ar"). Nunca cair na barbearia errada, nunca uma barbearia padrão.

#### Cache de subdomínio

A tradução slug → id é leitura quente, em toda requisição, de dado que quase nunca muda. Fica em memória com TTL curto (60 s), atrás de uma função só.

O custo aceito: desativar uma barbearia leva até 60 s para derrubar o subdomínio. Aceitável — inadimplência não é incidente de segurança. Não vale invalidação distribuída nesta etapa.

#### Ambiente de desenvolvimento

`NEXT_PUBLIC_DOMINIO_BASE=localhost` e os subdomínios funcionam direto: `brutus.localhost:3000`, `dontony.localhost:3000`. Chrome e Firefox resolvem `*.localhost` para 127.0.0.1 sem `hosts` nem DNS. Trocar de tenant durante o desenvolvimento é trocar a URL.

---

## 10. WhatsApp — Evolution API

### 10.1 Módulo (`src/lib/whatsapp.ts`)

```ts
async function enviarTexto(whatsappDigitos: string, mensagem: string): Promise<void>;
```

Chama `POST ${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}` com header `apikey: ${EVOLUTION_API_KEY}` e corpo `{ number: '55' + digitos, text: mensagem }`.

### 10.2 Regra de degradação

**O envio é fire-and-forget. Falha de WhatsApp nunca derruba um agendamento.**

A chamada acontece **depois** do `COMMIT`, com `.catch()` que registra o erro no log e segue. Timeout de 5 s. Se `EVOLUTION_API_URL` não estiver configurada, o módulo escreve a mensagem no console e retorna — assim dá pra desenvolver sem Docker rodando.

### 10.3 Mensagens (`src/lib/mensagens.ts`)

Textos isolados num módulo só, para ajuste sem caçar string no meio da lógica:

- **Confirmação** — inclui serviço, dia, hora, nome do barbeiro, endereço e o link `/agendamento/[codigo]` (é assim que o cliente reencontra a tela 1b para cancelar).
- **Cancelamento pelo cliente** — confirmação de que o horário foi liberado.
- **Lembrete** — disparado pelo cron.

### 10.4 Nota operacional

A Evolution API é não-oficial (baseada em Baileys). Exige instância própria em Docker e um número dedicado — o número da barbearia não deve ser usado, sob risco de bloqueio pela Meta. Configuração de infraestrutura está **fora do escopo desta etapa**; o `.env.example` documenta as variáveis e o sistema funciona sem elas (§10.2).

---

## 11. Telas

### 11.1 Tokens de tema (`src/app/globals.css`)

Os valores extraídos do wireframe, declarados uma vez:

```css
@import "tailwindcss";

@theme {
  /* traço — a cor de toda borda e todo preenchimento sólido */
  --color-traco:      #2a2a2a;
  --color-acento:     #5b46d9;   /* .acc — o roxo dos marcadores */

  /* texto */
  --color-sub:        #777;      /* .sub  — subtítulo */
  --color-lbl:        #888;      /* .lbl  — rótulo */
  --color-apagado:    #999;      /* .box.dash, .box.mut */

  /* superfícies e linhas */
  --color-mut:        #efefef;   /* fundo do .box.mut */
  --color-mut-borda:  #ccc;
  --color-linha:      #e2e2e2;   /* .sep */
  --color-regua:      #ddd;      /* .ln */

  --radius-wf:        6px;
  --shadow-sel:       2px 2px 0 #2a2a2a;   /* sombra sólida, sem blur */
}
```

A fonte `Architects Daughter` é carregada por `next/font/google` no `layout.tsx` e exposta como `--font-mao` via variável CSS — sem `<link>` para o Google no HTML, e sem flash de fonte trocando.

Larguras de borda (`1.5px`, `2.5px`) ficam como valor arbitrário nos componentes; são duas ocorrências, não vale token.

### 11.2 Primitivos (`src/components/wf/`)

Um componente por classe do wireframe, variantes como props. Toda a estilização é Tailwind consumindo os tokens acima:

| Componente | Wireframe | Implementação |
|---|---|---|
| `<Box variante="dash\|fill\|sel\|mut">` | `.box` e variantes | `border-[1.5px] border-traco rounded-wf px-2.5 py-2 text-xs bg-white` · `dash`: `border-dashed text-apagado` · `fill`: `bg-traco text-white text-center py-2.5` · `sel`: `border-[2.5px] shadow-sel` · `mut`: `bg-mut text-apagado border-mut-borda` |
| `<Chip ativo acento>` | `.chip`, `.chip.on`, `.chip.acc` | `border-[1.5px] border-traco rounded-full px-2.5 py-1 text-[11px] shrink-0` · `on`: `bg-traco text-white` · `acc`: `border-acento text-acento` |
| `<Row wrap>` | `.row`, `.row.wrap` | `flex gap-2 [&>*]:flex-1` · `wrap`: `flex-wrap` |
| `<Lbl>` / `<Sub>` | `.lbl`, `.sub` | `text-[11px] text-lbl` / `text-[11px] text-sub` |
| `<Sep>` | `.sep` | `h-px bg-linha my-0.5` |
| `<Avatar tamanho>` | `.avatar` | `rounded-full border-[1.5px] border-traco shrink-0`, tamanho por prop |
| `<Timeline>` | `.tl` | a grade horário + conteúdo da agenda |
| `<StatusBar>` | `.wf-status` | a barrinha `9:41 ▮▮▮` |
| `<Frame>` | `.wf` | container `w-[300px] font-mao text-traco p-3.5 flex flex-col gap-2.5` |

**Regra:** nenhuma tela usa cor, raio ou sombra fora desses primitivos. Se uma tela precisa de um visual que não existe aqui, entra um primitivo novo — não uma classe solta. É isso que faz a Etapa 4 ser barata.

As classes `dv-*` do arquivo de origem são do documento de design (cabeçalho, numeração das opções) e **não** entram no produto.

### 11.3 `/` — tela 3b

**Divergência assumida do wireframe:** ele desenha 3 passos (barbeiro → horário → dados). Com serviços separados, são **4**. O passo novo entra como `2. Serviço`, entre barbeiro e horário — mantendo o barbeiro na frente, como o wireframe decidiu. O visual do passo novo reusa exatamente o padrão dos chips que já existe; nenhum elemento novo é inventado.

Ordem final:

1. Cabeçalho com o `nome` da barbearia resolvida (`BRUTUS · barbearia`), subtítulo com `endereco` e `horarioResumo` — tudo de `barbeariaAtual()` (§9.4). Nenhum dado da barbearia é literal no código
2. `1. Barbeiro` — cards lado a lado com avatar e nome; selecionado ganha `.box.sel`. Abaixo, chip `tanto faz`
3. `2. Serviço` — chips (`Corte`, `Barba`, `Corte + Barba`, `Pezinho`), cada um com a duração em `.sub`: `Corte · 40min`. Com `tanto faz` selecionado, mostra `Corte · a partir de 30min`. Selecionado ganha `.chip.on`
4. `3. Próximos horários livres` — para cada um dos `DIAS_NA_HOME` dias: rótulo (`hoje · qua 5`, `amanhã · qui 6`) e chips de horário. Chip selecionado ganha `.chip.on`
5. Caixa `escolher outro dia` com `calendário ›` → navega para `/calendario`
6. `4. Seus dados` — campo nome e campo WhatsApp (`.box.dash` enquanto vazio), com máscara `(11) 9 ____-____`
7. Botão `.box.fill` — rótulo dinâmico: `confirmar corte 16:00 com Téo`. Desabilitado (`.box.mut`) até ter barbeiro, serviço, horário, nome e WhatsApp válido
8. Legenda `confirmação chega no seu zap`
9. Rodapé discreto `sou barbeiro · entrar no painel` → `/painel`

**Encadeamento entre os passos.** Trocar o barbeiro ou o serviço **invalida o horário já escolhido** — a grade muda de verdade quando a duração muda, e manter um chip selecionado que não existe mais na nova lista é o jeito garantido de produzir 422 na confirmação. Ao trocar qualquer um dos dois, o horário é limpo e a lista recarregada. Nome e WhatsApp nunca se perdem.

Trocar o barbeiro também pode invalidar o **serviço**, se o novo barbeiro não oferecer aquele (Rael não faz pezinho). Nesse caso o serviço é limpo junto.

**Estados obrigatórios** (o wireframe pede explicitamente): WhatsApp inválido mostra erro abaixo do campo; resposta 409 mostra aviso e recarrega a lista de horários, mantendo nome e telefone preenchidos.

Nenhum menu, nenhuma conta, nenhuma senha — regra do wireframe 3a.

### 11.4 `/calendario` — tela 4c

`‹ voltar`, navegação de mês, grade 7 colunas iniciando em segunda (`s t q q s s d`). Dia com vaga = círculo contornado; sem vaga = cinza claro sem contorno; dia selecionado = contorno grosso. Abaixo, os horários do dia escolhido e botão `usar 16:00`, que volta para `/` com dia e hora já selecionados.

Estado (barbeiro, **serviço**, dia, hora) viaja por query string, para o botão voltar do navegador funcionar. A tela chega com barbeiro e serviço já definidos pela home — não há como abrir o calendário sem eles, porque sem duração não existe grade.

### 11.5 `/agendamento/[codigo]` — tela 1b

Círculo com `✓`, `Tá marcado, <primeiro nome>.`, caixa com `qua 5 ago · 16:00` e `corte · com Téo · Rua Aurora, 88`, legenda do lembrete, botão `salvar no calendário` (gera `.ics` no cliente — sem dependência externa), e `cancelar meu horário`.

Se `podeCancelar = false`: botão em `.box.mut` e a legenda `passou do prazo — chama no zap: <whatsappBarbearia>`, exatamente como o wireframe mostra.

Se `status` já for cancelado: estado próprio, informando que o horário foi cancelado e oferecendo link para marcar de novo.

### 11.6 `/painel` — stub

Página mínima informando que o painel do barbeiro chega na próxima etapa, com link de volta. Existe só para o rodapé da home não levar a 404.

---

## 12. Testes (Vitest)

### `tests/slots.test.ts` — sem banco, só a função pura

- dia sem `HorarioTrabalho` → `[]` (barbeiro não declarou expediente — §5.1)
- barbeiro **sem nenhum** `HorarioTrabalho` → `[]` em qualquer dia consultado
- expediente 9h–20h, duração 40 → grade de 30 em 30 a partir das 9h
- bloqueio semanal de almoço remove exatamente os slots do intervalo
- bloqueio pontual só afeta o dia dele
- agendamento existente remove só os slots que ele cobre
- agendamento que termina às 16:40 não bloqueia o slot das 16:40 (fronteira semiaberta)
- com `agora` no meio do expediente, slots anteriores somem e posteriores ficam
- dia inteiro tomado → `[]`

Casos que só existem por causa dos serviços:

- **duração muda a grade** — mesmo dia, mesmo barbeiro, duração 30 vs 60 produz listas diferentes
- **último slot cabe inteiro** — expediente até 20h, duração 60: o último oferecido é 19:00, não 19:30
- **passo é independente da duração** — duração 40 com granularidade 30 gera 9:00, 9:30, 10:00 (não 9:00, 9:40)
- **brecha entre agendamentos** — com corte de 40 às 9:00 e outro às 10:30, uma barba de 30 é oferecida às 10:00; um corte + barba de 60 não é
- **"tanto faz"** — dois barbeiros com 16:00 livre → um único slot, atribuído ao de menor `ordem`
- **"tanto faz" com durações diferentes** — Rael (30) oferece 16:30 e Téo (40) não; o slot aparece, atribuído ao Rael
- **"tanto faz" ignora quem não faz o serviço** — pezinho não considera o Rael

### `tests/servicos.test.ts`

Os três limites de §5.1, cada um sozinho:

- exatamente 10 min passa; 9 min lança
- exatamente 60 min passa; 61 min lança
- duração igual ao `duracaoMinimaMin` do serviço passa; um minuto abaixo lança
- duração válida pelo serviço mas acima de 60 lança — o teto global vence o piso do serviço
- barbeiro sem `BarbeiroServico` ativo → resolução falha em vez de cair num padrão

E um teste de coerência entre as duas camadas:

- inserir `duracaoMin = 61` direto no banco, contornando o validador, é recusado pelo `CHECK` — prova que constante do TypeScript e restrição do Postgres não divergiram

### `tests/telefone.test.ts`

Formatos válidos (com e sem `+55`, com e sem máscara), curto demais, longo demais, DDD inválido, texto puro.

### `tests/api-agendamentos.test.ts` — com banco de teste

Roda contra o banco `brutus_test`, criado pelo `init-db.sql` (§2.1). Basta `docker compose up -d db`; não precisa do serviço `app` no ar.

Cada teste limpa as tabelas num `beforeEach` e recria as duas barbearias, para a ordem de execução não importar.

**Escrita de cenário usa `DATABASE_URL_TEST` (papel dono, sem RLS); o código sob teste usa `DATABASE_URL_APP_TEST` (papel da aplicação, com RLS).** Montar cenário de dois tenants pelo papel da aplicação seria impossível — ele só enxerga um por vez. Preparar com o dono e exercitar com o app é o que permite provar o isolamento em vez de assumi-lo.

- agendar horário livre → 201 e registro `CONFIRMADO`
- dois pedidos no mesmo slot → um 201, um 409, e só um registro no banco
- **sobreposição parcial** — corte de 40 min às 16:00 (vai até 16:40), depois barba de 30 às 16:30 → **409**. Inícios diferentes, intervalos colidindo: é o caso que o índice único antigo deixava passar (§5.3)
- **encosto exato** — corte de 40 às 16:00 e outro às 16:40 → ambos 201. A fronteira semiaberta tem que valer também no banco, não só na função pura
- agendar com duração forjada no corpo da requisição → o servidor usa a duração do `BarbeiroServico` e ignora a enviada
- agendar serviço que o barbeiro não faz → 422
- agendar horário bloqueado → 422
- agendar horário no passado → 422
- cancelar 61 min antes → 200, slot volta a aparecer em `/api/horarios`
- cancelar 59 min antes → 422, agendamento intacto
- cancelar duas vezes → segunda é idempotente, não quebra
- `GET /api/horarios` não vaza nome de cliente em nenhum campo da resposta

O último é teste de regressão do contrato de privacidade (§9.1) — a regra mais fácil de quebrar sem perceber numa refatoração.

### `tests/isolamento.test.ts` — multi-tenant

A suíte mais importante do projeto. Um furo aqui não é bug: é dado de um cliente pago aparecendo para outro.

Todos rodam com o `PrismaClient` do papel `brutus_app` (§5.2). Com o papel dono, **todos passariam** sem provar nada — o dono ignora RLS. O primeiro teste existe justamente para garantir isso.

**A base — o papel certo**
- a conexão de runtime está autenticada como `brutus_app`, não como `brutus_owner`
- `brutus_app` **não** é dono de nenhuma tabela do schema

**O RLS filtrando**
- dentro de `comBarbearia(brutus)`, `agendamento.findMany()` devolve só linhas da BRUTUS — mesmo sem nenhum `where`
- idem para barbeiros, serviços, clientes, bloqueios e horários de trabalho
- buscar pelo `id` de um agendamento da Dom Tony estando em `comBarbearia(brutus)` → `null`, não erro de permissão
- `update` e `delete` num registro de outro tenant afetam **zero** linhas

**Falha fechada**
- consulta **fora** de `comBarbearia` → zero linhas, nunca a tabela inteira. É o teste do `missing_ok` (§5.2)
- `INSERT` carimbado com `barbeariaId` de outro tenant dentro de `comBarbearia` → recusado pelo `WITH CHECK`

**Vazamento pela variável de sessão**
- duas chamadas `comBarbearia` seguidas, tenants diferentes, na mesma conexão da pool: a segunda **não** enxerga o tenant da primeira

  É o teste do `set_config(..., true)`. Trocar o terceiro argumento para `false` tem que fazer este teste falhar — se não fizer, o teste está errado, não o código.

**Unicidade por tenant**
- cadastrar o mesmo WhatsApp de barbeiro nas duas barbearias → as duas passam
- cadastrar o mesmo WhatsApp de cliente nas duas barbearias → duas linhas distintas, agendamentos não se misturam
- repetir o mesmo WhatsApp **dentro** da mesma barbearia → recusado

**A varredura estrutural**
- toda tabela que tem coluna `barbeariaId` tem `rowsecurity` ligado em `pg_class` e ao menos uma política em `pg_policies`

  Este é o teste que sobrevive a você. Tabela nova criada daqui a seis meses sem política faz a suíte falhar no mesmo dia, em vez de virar incidente (§5.2).

**Ponta a ponta, pelo HTTP**
- requisição com `Host: dontony.seuapp.com.br` não devolve nenhum dado da BRUTUS
- `x-barbearia-slug` forjado no cabeçalho da requisição é ignorado — vale o `Host` (§9.4)
- subdomínio inexistente → 404
- barbearia com `ativo = false` → 404
- subdomínio reservado (`www`, `api`) → nunca resolve como tenant

---

## 13. Variáveis de ambiente (`.env.example`)

```
# MIGRAÇÃO — papel dono. Ignora RLS. Só o prisma migrate usa. (§5.2)
DATABASE_URL="postgresql://brutus_owner:owner@db:5432/brutus"

# RUNTIME — papel da aplicação. Sujeito ao RLS. É o que o PrismaClient usa. (§5.2)
DATABASE_URL_APP="postgresql://brutus_app:app@db:5432/brutus"

# Da máquina (Prisma Studio, Vitest), a porta é 5433 (§2.1)
DATABASE_URL_HOST="postgresql://brutus_owner:owner@localhost:5433/brutus"
DATABASE_URL_APP_HOST="postgresql://brutus_app:app@localhost:5433/brutus"
DATABASE_URL_TEST="postgresql://brutus_owner:owner@localhost:5433/brutus_test"
DATABASE_URL_APP_TEST="postgresql://brutus_app:app@localhost:5433/brutus_test"

# Multi-tenant (§9.4) — em dev, `localhost` faz brutus.localhost:3000 funcionar
NEXT_PUBLIC_DOMINIO_BASE="localhost"

EVOLUTION_API_URL=""        # vazio = modo log, sem envio real
EVOLUTION_INSTANCE=""
EVOLUTION_API_KEY=""
CRON_SECRET=""              # protege /api/cron/lembretes
```

**Trocar `DATABASE_URL` por `DATABASE_URL_APP` no runtime desliga o isolamento inteiro** — o papel dono ignora RLS (§5.2). O `FORCE ROW LEVEL SECURITY` existe justamente como rede para esse erro, mas a separação dos papéis é a defesa principal. Os testes de §12 conferem que o `PrismaClient` de runtime está conectado como `brutus_app`.

O `.env` **não** vai para o versionamento; o `.env.example` vai. As credenciais do Postgres acima são de desenvolvimento local e propositalmente triviais — o banco só escuta em `localhost`.

---

## 14. Fora do escopo desta etapa

| Item | Etapa |
|---|---|
| Login do barbeiro (3c), agenda do dia (1d), detalhe (1e), reagendar (1g), bloquear (1f) | 2 |
| Equipe (3e), cadastro de barbeiro (3d), dashboard desktop (1h) | 3 |
| Visual definitivo substituindo o wireframe | 4 |
| Cadastro de barbearia nova pela tela (onboarding, escolha de slug, primeiro dono) | própria — o encanamento multi-tenant fica pronto agora, a porta de entrada não |
| Cobrança, plano, inadimplência (hoje é `Barbearia.ativo` na mão) | própria |
| Domínio próprio por barbearia (`brutus.com.br`, como o wireframe desenha) | própria — subdomínio primeiro |
| Página institucional do produto (o domínio nu) | própria — por ora, estática |
| Preço por serviço (exibição, total, forma de pagamento) | não previsto no wireframe — ver §15 |
| Tela do barbeiro para editar as durações dos próprios serviços | 3 (o validador já fica pronto — §5.1) |
| Instância da Evolution API (entra como terceiro serviço no `docker-compose.yml`) e agendador do cron | deploy |

---

## 15. Riscos conhecidos

**RLS protege o dado, não o custo.** O isolamento impede a barbearia A de **ver** a B. Não impede a A de consumir a CPU do banco que a B precisa. Com dezenas de barbearias num Postgres só, uma agenda gigante degrada todo mundo. Só vira problema real na casa das dezenas de clientes ativos; a saída na época é réplica de leitura ou banco dedicado para os grandes. Não vale antecipar nada disso agora.

**O `Agendamento.codigo` atravessa tenants por construção.** Ele é único globalmente e a rota `/agendamento/[codigo]` o resolve. Um código da BRUTUS acessado em `dontony.seuapp.com.br` **deve** dar 404 — o `comBarbearia` do tenant resolvido pelo Host garante isso, já que a consulta é filtrada pelo RLS. Está coberto pelos testes de §12, e é o ponto onde eu esperaria o primeiro furo se alguém otimizar essa rota "para não precisar do tenant".

**Um Postgres, um ponto de falha.** Banco fora do ar derruba todas as barbearias ao mesmo tempo. É a contrapartida direta do row-level, e é aceita conscientemente — schema-por-tenant no mesmo servidor teria exatamente o mesmo destino, com muito mais trabalho.

**Granularidade de 30 min desperdiça os serviços curtos.** Com o piso em 10 min, um pezinho de 15 min ainda só começa de 30 em 30 — ocupa 15 minutos e deixa 15 mortos. Baixar `GRANULARIDADE_MIN` para 15 recuperaria essas brechas.

Mantive 30 porque é o que o wireframe desenha: `15:30 · 16:00 · 17:00 · 18:30`, nada em `:15` ou `:45`. Adivinhar contra o desenho seria pior que perguntar.

É **uma constante** (§4) e a mudança não toca em modelo nem em migração — só produz mais chips na tela. Se na prática o pezinho virar volume, muda o número e pronto. Vale confirmar com o dono se ele quer horário quebrado na tela.

**Preço não está modelado.** `Servico` tem duração, não tem valor. O wireframe não mostra preço em tela nenhuma — nem na escolha, nem na confirmação, nem no painel — então não foi inventado. Se o dono quiser, entra `precoCentavos` em `Servico` (e possivelmente em `BarbeiroServico`, se barbeiro sênior cobra mais). É aditivo: coluna nova, nenhuma migração destrutiva. Vale perguntar antes da Etapa 2, porque a tela do painel provavelmente vai querer mostrar o total do dia.

**Serviços do wireframe são chute.** Corte, Barba, Corte + Barba e Pezinho, com os minutos do §5.4, são um catálogo plausível inventado aqui — o wireframe só diz "corte · 40min". A **forma** está certa; os itens e os números o dono ajusta na Etapa 3. Até lá, mudar é editar o seed.

**Combo como serviço próprio.** "Corte + Barba" é uma linha de `Servico` como outra qualquer, com duração própria — não uma soma de dois serviços marcados juntos. Isso mantém o modelo simples e reflete a realidade (o combo costuma sair mais rápido que os dois separados). O custo é que marcar dois serviços independentes numa tacada não existe; se virar necessidade, aí sim entra `AgendamentoServico` como tabela de junção.

**Cancelamento só pelo link.** Quem apagar a mensagem do WhatsApp perde o acesso à tela 1b. O wireframe não prevê "buscar meu agendamento pelo telefone". Aceito nesta etapa; se virar reclamação, uma busca por telefone + confirmação por código enviado no zap resolve.

**Evolution API não-oficial.** Risco de bloqueio do número pela Meta. Mitigado por número dedicado e pela degradação do §10.2, que garante que uma queda não impede agendamentos.
