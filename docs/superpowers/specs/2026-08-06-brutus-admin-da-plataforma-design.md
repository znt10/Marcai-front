# BRUTUS — Admin da plataforma · Design

> Complementa `2026-08-05-brutus-agendamento-cliente-design.md`. As referências `§N` sem prefixo apontam para **este** documento; as com prefixo `cliente §N`, para aquele.

## 1. O problema

O encanamento multi-tenant está pronto: subdomínio vira tenant, RLS isola o banco, o seed cria duas barbearias. Falta a **porta de entrada** — hoje uma barbearia nova só nasce editando o `prisma/seed.ts` ou abrindo o `psql`.

Pior: o runtime é **incapaz** de criar uma. A migração de RLS fez

```sql
REVOKE INSERT, UPDATE, DELETE ON "Barbearia" FROM brutus_app;
```

de propósito (cliente §5.2). Qualquer desenho de admin precisa dizer como contorna isso sem desfazer a garantia.

## 2. Os três papéis

| Papel | Alcance | Onde está especificado |
|---|---|---|
| **Admin da plataforma** | todas as barbearias; cria, ativa e desativa | **este documento** |
| **Dono** (`PapelBarbeiro.DONO`) | tudo da barbearia dele | cliente §9.5 — Etapas 2 e 3 |
| **Barbeiro** (`PapelBarbeiro.BARBEIRO`) | só a própria agenda | cliente §9.5 — Etapa 2 |

Os dois últimos já estão desenhados em detalhe: JWT `jose`/HS256 em cookie `httpOnly`, `bid` conferido contra o `Host`, `tokenVersion` para revogação, argon2id, trava de força bruta, convite por WhatsApp e o choke-point `filtroDoBarbeiro`. **Nada disso é redesenhado aqui.**

O admin é um papel **acima** dos dois, e não cabe no modelo existente: `Barbeiro.barbeariaId` é `NOT NULL` com FK, então não existe linha de barbeiro sem tenant. Forçar o admin ali exigiria uma barbearia-fantasma — estado inventado para caber num molde errado.

**É uma pessoa só: o dono do site.** Não há convite de admin, não há lista de admins, não há papel de admin no banco. Se um dia houver dois, isto vira uma tabela — mas nasce como uma pessoa, de propósito.

## 3. Onde mora

`admin.<NEXT_PUBLIC_DOMINIO_BASE>` — em desenvolvimento, `admin.localhost:3000`.

O subdomínio `admin` **já está em `SUBDOMINIOS_RESERVADOS`** (cliente §9.4), então nenhuma barbearia pode tomá-lo e `extrairSlug()` já devolve `null` para ele.

### A armadilha do proxy

`extrairSlug()` devolve `null` para **dois** casos diferentes:

| Host | `extrairSlug` | O que deve acontecer |
|---|---|---|
| `seuapp.com.br` (domínio nu) | `null` | institucional |
| `admin.seuapp.com.br` | `null` (reservado) | painel de admin |
| `brutus.seuapp.com.br` | `'brutus'` | tenant |

Hoje o `proxy.ts` reescreve `/` para `/institucional` sempre que o slug é nulo — o que faria `admin.seuapp.com.br` servir a vitrine do produto. O proxy passa a distinguir os dois com um helper novo em `src/lib/slug.ts`:

```ts
export function ehHostAdmin(host: string, dominioBase: string): boolean;
```

Mesmo módulo sem dependência de banco que `extrairSlug`, pelo mesmo motivo: o proxy o importa.

### Por que subdomínio e não `/painel-secreto`

O caminho secreto é ofuscação, não defesa — quem protege é o login. Mas o subdomínio dá três coisas que o caminho não dá:

1. **O cookie fica preso.** Cookie emitido em `admin.seuapp.com.br` sem atributo `Domain` é *host-only*: o navegador nunca o envia para `brutus.seuapp.com.br`. Um XSS numa barbearia não alcança a sessão de admin.
2. **Dá para fechar por fora.** Bloqueio por IP, VPN ou um `allowlist` no proxy reverso se aplicam a um host inteiro, sem tocar no resto do sistema.
3. **Varredura não acha.** `/admin`, `/login`, `/wp-admin` no domínio nu não existem.

## 4. Autenticação do admin

### Credenciais fora do banco

```
ADMIN_USUARIO="..."
ADMIN_SENHA_HASH="$argon2id$v=19$m=..."   # hash, nunca a senha
ADMIN_JWT_SECRET="..."                    # 32+ bytes, distinto do JWT_SECRET
```

Sendo uma pessoa só, uma tabela `Admin` seria estado a mais para migrar, proteger e testar, em troca de um "trocar a senha pela tela" que se resolve editando o `.env`.

O argumento decisivo é outro: **a credencial da plataforma inteira nunca toca o banco dos tenants.** Um vazamento do Postgres — dump, backup mal guardado, SQL injection em qualquer rota — não entrega a conta que enxerga todas as barbearias.

Rotacionar a senha é editar a variável e reiniciar. Trocar `ADMIN_JWT_SECRET` derruba a sessão na hora: é o botão de pânico.

### Sessão

Mesmo desenho do barbeiro (cliente §9.5), com três diferenças:

| | Barbeiro | Admin |
|---|---|---|
| Cookie | `sessao` | `sessao_admin` |
| Segredo | `JWT_SECRET` | `ADMIN_JWT_SECRET` |
| Validade | 12 h | **2 h** |
| Carga | `{ sub, bid, papel, tv }` | `{ sub: 'admin', iat, exp }` |

Segredos separados **de propósito**: o cliente §15 já registra que `JWT_SECRET` é o ponto único de colapso da autenticação de barbeiro. Se fosse o mesmo, vazá-lo passaria a forjar também o admin — a falha de uma fronteira derrubaria as duas.

Duas horas em vez de doze porque a sessão de admin é usada em rajadas curtas (cadastrar uma barbearia), não durante um turno de trabalho.

### Força bruta — a assimetria que importa

O barbeiro trava **por conta**: cinco erros, 15 minutos parado (cliente §9.5). Aplicar isso ao admin seria um convite: como só existe **uma** conta, qualquer um travaria o dono do site fora do próprio painel, para sempre, com cinco requisições — negação de serviço trivial.

Então o admin trava **por IP**, com espera exponencial: 1s, 2s, 4s, 8s… até um teto de 60s por IP. O `verify` do argon2 roda sempre, mesmo com usuário errado, contra um hash descartável — pelo mesmo motivo do §9.5 do cliente: o relógio não pode denunciar se o usuário existe.

A trava é por IP aqui e por conta lá porque **o que se protege é diferente**: lá, uma barbearia inteira sai pelo mesmo IP e travar o IP derrubaria a equipe; aqui, a conta é uma e travá-la derruba o dono.

## 5. O terceiro papel do Postgres

Nasce `brutus_admin`: **os mesmos grants de `brutus_app`, mais `INSERT` e `UPDATE` em `Barbearia`**.

```sql
CREATE ROLE brutus_admin LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO brutus_admin;
-- DML nas tabelas de tenant, exatamente como brutus_app (sujeito a RLS)
-- e, só para ele, a porta de entrada:
GRANT INSERT, UPDATE ON "Barbearia" TO brutus_admin;
```

**Sem `BYPASSRLS`.** É a decisão central deste documento. O admin ganha exatamente uma capacidade nova — criar e editar a linha de `Barbearia` — e continua sujeito ao RLS em todo o resto. Consequências práticas:

- **Criar o primeiro dono** acontece dentro de `comBarbearia(novaBarbeariaId, tx => tx.barbeiro.create(...))`. O RLS carimba e confere o tenant como em qualquer outra escrita.
- **Contar barbeiros e agendamentos** na listagem é feito **tenant a tenant**, num laço de `comBarbearia()` — exatamente o que `src/app/api/cron/lembretes/route.ts` já faz hoje. Uma consulta agregada única devolveria zero: o RLS não deixaria enxergar nada.

Custo: N+1 consultas na listagem, com N = número de barbearias. Com dezenas de barbearias é irrelevante; se um dia doer, a saída é uma view materializada de contagens, não afrouxar o RLS.

`src/lib/db.ts` ganha um segundo cliente, `prismaAdmin`, sobre `DATABASE_URL_ADMIN`, e `src/lib/tenant.ts` ganha `comBarbeariaAdmin()` — o mesmo `set_config` com `is_local = true`, sobre o outro cliente. O `prisma` de runtime **não muda**, e o teste que confere que ele conecta como `brutus_app` continua valendo.

## 6. As quatro capacidades

### 6.1 Criar barbearia + primeiro dono

**Uma transação só**, com o tenant apontado no meio dela:

```ts
prismaAdmin.$transaction(async (tx) => {
  const nova = await tx.barbearia.create({ slug, nome, endereco, horarioResumo, whatsappContato });
  // Só agora o RLS tem para onde apontar — a barbearia acabou de existir.
  await tx.$executeRaw`SELECT set_config('app.barbearia_id', ${nova.id}, true)`;
  return tx.barbeiro.create({
    data: { barbeariaId: nova.id, nome, whatsapp, papel: 'DONO',
            senhaHash: null, conviteTokenHash, conviteExpiraEm },
  });
});
```

Não são duas transações encadeadas: se a criação do dono falhar, a barbearia **não pode** sobrar. Barbearia sem dono é órfã — ninguém consegue entrar nela para cadastrar ninguém, e ela só sairia de lá pelo `psql`.

Por isso este caso **não** usa `comBarbeariaAdmin()`: aquele helper abre a própria transação, e o `set_config` precisa acontecer *dentro* desta, depois do `create` da barbearia.

O dono nasce **sem senha**, com convite de 48 h — o fluxo do cliente §9.5, reusado sem alteração. O link em claro aparece **uma vez** na tela e vai pelo WhatsApp via `enviarTexto()`.

Validação do slug: `SLUG_REGEX` e `SUBDOMINIOS_RESERVADOS`, os mesmos de `extrairSlug()`. Slug já existente responde 409 com a mensagem explícita — aqui não há por que ser evasivo, é o próprio dono do site quem lê.

**Toda barbearia nasce com ao menos um dono**, o que satisfaz a invariante do cliente §5.1 desde o primeiro segundo. Não existe caminho neste painel que crie uma barbearia órfã.

### 6.2 Listar

Slug, nome, `ativo`, contagem de barbeiros e de agendamentos confirmados. Ordenada por data de criação.

### 6.3 Ativar e desativar

`prismaAdmin.barbearia.update({ where: { id }, data: { ativo } })`. É o botão de inadimplência que o cliente §14 dizia ser "na mão".

**Consequência a registrar:** `buscarPorSlug()` guarda o tenant em cache por `TTL_CACHE_TENANT_MS` (60s). Desativar uma barbearia leva **até um minuto** para tirá-la do ar, e o efeito é por instância do processo. Aceito: um minuto de tolerância num corte comercial não é problema, e invalidação distribuída de cache custa muito mais do que resolve. Fica documentado para não virar um bug misterioso.

### 6.4 Reenviar convite / resetar senha do dono

Dentro de `comBarbeariaAdmin(barbeariaId, …)` — é escrita em `Barbeiro`, tabela sob RLS: gera token novo, grava só o hash, zera `senhaHash` e **incrementa `tokenVersion`**, o que derruba na hora qualquer sessão ativa daquele dono (cliente §9.5). Sem o incremento, quem tomou a conta continuaria dentro por até 12 h depois do reset.

## 7. Rotas e telas

| Rota | O quê |
|---|---|
| `POST /api/admin/auth/login` | usuário + senha → cookie `sessao_admin` |
| `POST /api/admin/auth/logout` | apaga o cookie |
| `GET  /api/admin/barbearias` | lista com contagens |
| `POST /api/admin/barbearias` | cria barbearia + dono, devolve o link de convite |
| `PATCH /api/admin/barbearias/[id]` | `{ ativo: boolean }` |
| `POST /api/admin/barbearias/[id]/convite` | novo convite para o dono |

**Toda rota `/api/admin/*` exige a sessão de admin, verificada no proxy**, antes de chegar perto do banco. Uma rota de admin sem essa checagem é a falha inteira, então a defesa é posicional, não por lembrança de quem escreve a rota: o proxy barra o prefixo, e o handler reconfere.

As telas reusam os primitivos de `@/components/wf`, sem `Frame largo` — é conteúdo estreito.

## 8. Testes

Além do que o cliente §12 já cobre:

- login com senha errada responde igual a usuário errado, e demora o mesmo
- a espera exponencial cresce por IP e **não** trava a conta
- cookie de barbeiro **não** abre rota de admin, e vice-versa (segredos distintos)
- `admin.localhost` não resolve tenant nenhum e não serve a institucional
- `brutus.localhost/api/admin/barbearias` responde 404 — o admin não existe fora do host dele
- criar barbearia nasce com exatamente um `DONO`, `senhaHash` nulo e convite válido
- `prismaAdmin` **não** consegue ler barbeiro de tenant nenhum fora de `comBarbeariaAdmin()` — a mesma varredura de falha-fechada do cliente §12
- resetar o convite do dono invalida token já emitido dele

## 9. Variáveis de ambiente

```
DATABASE_URL_ADMIN="postgresql://brutus_admin:admin@db:5432/brutus"
DATABASE_URL_ADMIN_HOST="postgresql://brutus_admin:admin@localhost:5433/brutus"
DATABASE_URL_ADMIN_TEST="postgresql://brutus_admin:admin@localhost:5433/brutus_test"
ADMIN_USUARIO=""
ADMIN_SENHA_HASH=""
ADMIN_JWT_SECRET=""
```

As três URLs seguem a convenção que já existe: a de dentro do Compose aponta para `db:5432`, e as `_HOST`/`_TEST` para `localhost:5433`, porque **os testes rodam do host**, fora do contêiner.

Nenhuma delas versionada; entram no `.env.example` vazias. `docker/init-db.sql` passa a criar `brutus_admin` para que um ambiente novo já nasça com os três papéis — o banco existente precisa do `CREATE ROLE` aplicado à mão, ou de `docker compose down -v`.

## 10. Fora do escopo

| Item | Por quê |
|---|---|
| Mais de um admin, convite de admin, papéis de admin | é uma pessoa; vira tabela quando forem duas |
| 2FA no login do admin | aditivo; a senha longa e a espera por IP dão a primeira camada |
| Auto-cadastro de barbearia pela própria barbearia | a porta de entrada é comercial, não pública |
| Cobrança, plano, inadimplência automática | `ativo` na mão é o suficiente por ora (§6.3) |
| Editar serviços, horários ou barbeiros de uma barbearia pelo admin | é trabalho do dono; o admin cria e desativa, não opera |
| Log de auditoria das ações do admin | com um só admin, o `git log` do banco é o próprio admin |
