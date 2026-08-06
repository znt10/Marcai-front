# BRUTUS — agenda para barbearias

Agendamento multi-tenant: cada barbearia tem o próprio subdomínio.

## Subir

```bash
cp .env.example .env
docker compose up
npm run seed
```

- `http://brutus.localhost:3000`
- `http://dontony.localhost:3000`

`*.localhost` resolve sozinho no Chrome e no Firefox — não precisa mexer em DNS.

O seed roda do **host**, não de dentro do contêiner: ele lê `DATABASE_URL_HOST`,
e o `dotenv -e .env` carrega essa variável nos dois lugares — dentro do
contêiner ela aponta para um `localhost:5433` que não existe lá.

## Admin da plataforma

`http://admin.localhost:3000` — cria barbearias com o primeiro dono, lista o
que está no ar, liga e desliga cada uma, e reemite o convite do dono.

Antes da primeira vez, gerar a credencial:

```bash
npm run admin:hash -- "uma senha longa"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Colar as duas saídas em `ADMIN_SENHA_HASH_B64` e `ADMIN_JWT_SECRET` no `.env`,
e escolher um `ADMIN_USUARIO`. As três nunca vão para o versionamento.

O hash viaja em **base64** por um motivo específico: em claro ele é
`$argon2id$v=19$m=...`, e tanto o `@next/env` quanto o Docker Compose expandem
`$` como início de variável — o valor chegaria truncado ao processo, e o
sintoma seria um "usuário ou senha inválidos" que não explica nada.

O painel só existe no host `admin.`. Em qualquer subdomínio de barbearia,
`/admin` e `/api/admin/*` respondem **404** — a barreira está no `proxy.ts`,
então rota nova sob esse prefixo nasce protegida.

Cinco erros de senha do mesmo IP bloqueiam aquele IP por **10 minutos**. A
trava é por IP e não por conta de propósito: a conta é uma só, e travá-la
deixaria qualquer um trancar você fora do próprio painel.

**Desativar uma barbearia leva até um minuto** para fazer efeito: o tenant
fica em cache por `TTL_CACHE_TENANT_MS`.

## Testar

```bash
docker compose up -d db
npm test
```

Os testes rodam do host contra o banco `brutus_test`. Em máquina nova, aplicar
as migrações nele antes da primeira rodada:

```bash
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
```

## O que saber antes de mexer

- **Nunca** consultar dado de barbearia fora de `comBarbearia()` — ou de
  `comBarbeariaAdmin()`, no painel. O RLS devolve zero linhas, e o bug parece
  "sumiu tudo".
- **Papel novo no Postgres precisa ser nomeado nas políticas de RLS.** Elas
  são `TO brutus_app, brutus_admin`; um papel fora dessa lista não casa com
  política nenhuma e não enxerga linha alguma.
- O `proxy.ts` roda no runtime **Edge**: o que ele importa entra no bundle
  dele. Por isso `slug.ts` não importa o Prisma e `admin-sessao.ts` não
  importa o argon2 — binário nativo não roda lá.
- O runtime usa `DATABASE_URL_APP` (papel `brutus_app`). Apontar para
  `DATABASE_URL` desliga o isolamento: o dono da tabela ignora RLS.
- Conversão de fuso só em `src/lib/datas.ts`.
- Tabela nova com `barbeariaId` precisa de política de RLS. O teste
  `varredura estrutural` falha se você esquecer.
- Arquivo de rota criado com `docker compose up` já rodando não é enxergado
  pelo watcher do Turbopack através do bind mount do Windows: a rota responde
  404 até `docker compose restart app`.

Specs:
- `docs/superpowers/specs/2026-08-05-brutus-agendamento-cliente-design.md`
- `docs/superpowers/specs/2026-08-06-brutus-admin-da-plataforma-design.md`
