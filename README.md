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

## Painel do barbeiro

`http://brutus.localhost:3000/painel` — agenda do dia, marcar cliente na mão e
cancelar. Entra com o celular e a senha; no seed, Téo (`11911112222`), Rael
(`11933334444`) e Tony (`11977778888`, na Dom Tony) nascem com `123456`. Duda
nasce **sem** senha de propósito: é o convite pendente, e quem não tem
`senhaHash` não entra.

O dono vê a agenda de todos e pode filtrar por barbeiro; o barbeiro vê só a
dele. Quem decide isso é `filtroDoBarbeiro()` — **nenhuma consulta do painel
monta esse filtro por fora**, e a garantia vale exatamente enquanto isso for
verdade. Barbeiro que manda `?barbeiroId=` do colega continua vendo a agenda
dele.

Ação sobre agendamento de outro barbeiro responde **404**, nunca 403 — 403
confirmaria que o registro existe.

Cinco erros de senha travam **aquela conta** por 15 minutos. É diferente da
trava do admin, que é por IP: a barbearia inteira sai do mesmo IP, e travar o
IP derrubaria a equipe junto.

`SESSAO_JWT_SECRET` é **diferente** de `ADMIN_JWT_SECRET` de propósito: é isso
que faz cookie de admin não abrir o painel, e vice-versa, sem nenhuma checagem
escrita para esse fim.

Depois de `npm run seed`, o primeiro login pode falhar por até um minuto: o
seed recria a barbearia com um uuid novo e o processo ainda guarda o antigo por
`TTL_CACHE_TENANT_MS`. O sintoma é "celular ou senha inválidos" com a senha
certa.

## Equipe (só o dono)

`/painel/equipe` — cadastrar barbeiro, corrigir nome, celular e papel, reemitir
convite, desativar e reativar. Barbeiro que abrir a rota recebe **403**, e o
link nem aparece no painel dele.

O convite vai por **dois caminhos**: pelo WhatsApp e na tela, uma vez só. O
envio é fire-and-forget, então API fora do ar não pode deixar o barbeiro sem
convite — e o token só existe em hash no banco, então perdido não se recupera:
reemite.

**Quem entra agora não aparece para o cliente.** Sem serviço vinculado e sem
expediente, a agenda dele é vazia e ele desaparece da tela pública em silêncio.
A lista avisa isso em destaque; preencher os dois é a Etapa 3 fatia B e C.

**Três recusas**, todas para não deixar a barbearia sem saída:

- desativar quem tem horário marcado no futuro (mostra a contagem e a data);
- desativar ou rebaixar o **último dono ativo**;
- desativar a si mesmo.

**Trocar papel ou celular derruba a sessão** daquela pessoa na hora — o `papel`
viaja no token, então rebaixar sem invalidar deixaria alcance de dono valendo
por até 12 h. Trocar só o nome não derruba nada.

Reemitir convite **é** o reset de senha: `senhaHash` volta a nulo.

## Horários (cada um no seu)

`/painel/horarios` — expediente por dia da semana, folgas e pausas. **Dono mexe
no de todos, barbeiro só no seu**; expediente de colega responde 404. É
diferente da equipe, que é só do dono: lá se decide quem é da casa, aqui quando
cada um trabalha.

**Fechar um dia é apagar a linha** de `HorarioTrabalho`. A ausência já é a
representação de "não trabalho" — o motor devolve agenda vazia na primeira
linha —, e ter uma segunda forma de dizer isso (jornada de duração zero) daria
dois jeitos de expressar o mesmo estado.

**Um intervalo por dia.** Jornada partida se escreve como expediente 9h–20h mais
um bloqueio semanal de 12h–13h, que é como o seed já monta o almoço.

**Bloqueio é semanal ou pontual, nunca os dois.** Mandar os dois conjuntos de
campos é 422: o motor lê um formato ou o outro, e uma linha com os dois teria
interpretação dependente de qual campo alguém leu primeiro.

**Encurtar o expediente por cima de horário vendido é permitido** — e a tela
lista o que ficou pendurado, com o botão de cancelar (que avisa o cliente). É de
propósito diferente da recusa ao desativar barbeiro: fechar a agenda é o que se
faz agora, com o braço quebrado, e recusar deixaria o cliente batendo numa porta
fechada.

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
