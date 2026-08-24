# BRUTUS — Etapa 6, fatia 8: o Prisma sai e o admin fecha

## 1. O que esta fatia é, e o que ela não é

A fatia 0 (`2026-08-11-separar-front-back-design.md`, §8) prometeu: *"na fatia 8
o Prisma sai, o Django assume o DDL"*. O DDL **já mudou de dono** — o
`entrypoint.sh` do back roda `manage.py migrate --database=owner`, há quatro
migrations em `backend/tenant/migrations/`, e os models de `tenant/models.py`
não são mais `managed = False`. O que ficou para trás foi a **outra metade**: o
front continua carregando o Prisma, a Evolution e as credenciais do admin que
ninguém mais lê.

Esta fatia é, quase inteira, uma **deleção**. Das 34 rotas de `src/app/api/`, 33
já são código morto: `MIGRADAS` desvia o tráfego para o Django antes de o
handler existir. Elas não são apagadas porque incomodam — são apagadas porque
**são a única razão de o front ainda precisar de `DATABASE_URL` e
`EVOLUTION_*`**.

O que esta fatia **não** é:

- **Não é um port do admin.** O admin já está no Django inteiro
  (`admin_senha.py`, `admin_sessao.py`, `admin_autenticacao.py`,
  `admin_barbearias.py`), e `MIGRADAS` já contém `/admin`. Tirar o admin do
  Next é apagar o lado que sobrou.
- **Não cria tabela de admin.** A conta continua única e vinda do ambiente, como
  `admin_senha.py:7` já documenta. Decisão confirmada, não herdada por omissão.
- **Não mexe no proxy.** A guarda de sessão continua no Edge do Next. Ver §5.

---

## 2. O bug que esta fatia conserta primeiro

`backend/app/services/admin_senha.py` lê `ADMIN_USUARIO` e
`ADMIN_SENHA_HASH_B64`. `backend/app/services/admin_sessao.py` lê
`ADMIN_JWT_SECRET` e **levanta `RuntimeError` sem ela**, de propósito — um
fallback aceitaria cookie assinado com segredo público.

Nenhuma das três está no `.env.example` do back. Nenhuma das três está no
`environment:` do serviço `api` no `docker-compose.yml` do back.

**O login do admin no Django estoura 500 hoje.** Ninguém percebeu porque o
`MIGRADAS` já aponta `/admin` para lá e o caminho não é exercitado por teste que
suba o contêiner com o ambiente real. Este é o primeiro passo da implementação,
e ele é independente de todo o resto: vale sozinho, mesmo que a deleção pare no
meio.

---

## 3. O que sai do front

### 3.1 Os route handlers

Os 33 handlers cobertos por `MIGRADAS`, e mais o `/cron/lembretes`, que é o
único fora da lista.

`/cron/lembretes` pode ir junto porque o Django já serve `cron/lembretes`
(`router.py:181`) exigindo o mesmo Bearer, e porque o disparo **agendado** já
não passa por HTTP desde a fatia 7 — é a tarefa de beat `app.tasks.lembretes`
chamando o serviço direto. A rota HTTP sobrevive no back como gancho manual.
Quem chamava o endpoint do Next por fora precisa passar a chamar o do Django, na
porta 8000: é a mudança que o §9 da fatia 0 avisou que teria de acontecer no
mesmo commit.

### 3.2 Os módulos de `src/lib/`

`db.ts`, `agenda.ts`, `equipe-rota.ts`, `sessao-painel.ts`, `whatsapp.ts`,
`admin-senha.ts`.

Todos têm importadores **exclusivamente** dentro de `src/app/api/` — conferido
arquivo por arquivo. Saem com os handlers, sem nada a resolver.

`lib/tenant.ts` é a exceção e tem seção própria (§4).

`lib/slug.ts` **fica intocado**. O `proxy.ts` o importa, e ele nunca importou o
Prisma — foi separado de `tenant.ts` exatamente para isso. A menção a `tenant`
dentro dele é um comentário, não um import.

### 3.3 Os scripts

`scripts/hash-senha.ts`, `scripts/whatsapp-qr.ts`, `scripts/whatsapp-estado.ts`,
e as entradas `admin:hash`, `whatsapp:qr`, `whatsapp:estado`, `seed` do
`package.json`.

`hash-senha.ts` não pode simplesmente sumir: ele é a **única** forma de gerar o
`ADMIN_SENHA_HASH_B64`. O substituto está no §6.

### 3.4 O Prisma

`prisma/` inteiro (schema, migrations, seed), `prisma.config.ts`, e o
`npx prisma generate && npx prisma migrate deploy` do `command:` do compose.

**Apagar `prisma/migrations/` é a decisão consciente aqui.** O Django é dono do
DDL e tem o histórico dele; manter o do Prisma preservaria um registro que
nenhum comando lê e que, pior, o compose ainda executa. Um
`prisma migrate deploy` rodando contra um schema que o Django aplica é, na
melhor das hipóteses, redundante — e na pior, duas ferramentas disputando a
tabela `_prisma_migrations` numa subida concorrente.

### 3.5 As dependências

`@prisma/client`, `@prisma/adapter-pg`, `prisma`, `pg`, `@node-rs/argon2`, e o
bloco `allowScripts` que existe só para elas.

`@node-rs/argon2` sai junto porque o único consumidor é `admin-senha.ts`. O back
já confere argon2id com `argon2-cffi` — os dois lados leem o hash um do outro
porque o formato codificado carrega os próprios parâmetros.

---

## 4. `lib/tenant.ts`, e o único endpoint novo desta fatia

Três Server Components chamam `barbeariaAtual()`, e eles **não** são código
morto:

| Página | Precisa de |
|---|---|
| `src/app/page.tsx` | a barbearia do tenant |
| `src/app/convite/[token]/page.tsx` | a barbearia do tenant |
| `src/app/agendamento/[codigo]/page.tsx` | a barbearia **e** o agendamento pelo código |

Hoje `barbeariaAtual()` resolve `slug -> Barbearia` com
`prisma.barbearia.findFirst`. O agendamento por código o Django já serve. **A
barbearia pública, não**: o router tem `painel/barbearia`, que exige sessão de
barbeiro, e nada equivalente sem autenticação.

**A terceira linha da tabela se resolve sozinha.** O
`AgendamentoDetalheSerializer` do Django já devolve `endereco` e
`whatsappBarbearia` — a view os mistura no dict a partir de
`request.barbearia` — e ainda `podeCancelar` computado no servidor. A página
do código passa a fazer **uma** chamada em vez de duas, e deixa de consumir
`barbeariaAtual()`. Some junto a conta local de `minutosAte`, que rodava sobre
o relógio do Next enquanto a rota de cancelar decidia pelo do Django: duas
contas em dois relógios são a janela em que a tela oferece cancelar e a API
recusa.

Sobram **duas** páginas consumindo `barbeariaAtual()`: a home e o convite.

Então esta fatia escreve **um** endpoint — o único acréscimo à API do produto
aqui; o resto do código novo (§6) é ferramenta de linha de comando:

```
GET /api/barbearia   ->   a barbearia do tenant atual
```

Sem parâmetro de slug, pelo mesmo motivo que todo o resto do back: **aqui o
tenant é o Host**. Um `?slug=` seria um seletor de barbearia por querystring — o
defeito exato que o `baseDe()` do `client.ts` existe para não cometer. A view
resolve pelo Host como as outras, e o prefixo `/barbearia` entra em `MIGRADAS`.

`Barbearia` é lida **fora do RLS** de propósito, como o comentário de
`buscarPorSlug` registra: ela é lida *antes* de existir tenant. A view nova
herda essa propriedade — ela não pode exigir `app.barbearia_id` porque é ela
quem o determina.

Com isso `lib/tenant.ts` encolhe para um `fetch` mais o `cache()` do React, e
`comBarbearia`/`comBarbeariaAdmin` — as duas funções de RLS — somem com o
Prisma. O RLS continua existindo: ele é do banco, não do framework (fatia 0,
§6), e quem passou a setá-lo é o Django.

**Um detalhe que morde:** `barbeariaAtual()` roda em Server Component, e
`origemDoTenant()` do `client.ts` lança se não houver `window`. O fetch dessas
três páginas **não pode passar por `pedir()`** — precisa montar a origem a
partir do header `x-barbearia-slug`/`host` que o proxy já injeta. Ignorar isso
troca o erro alto do `client.ts` por uma página que não renderiza.

---

## 5. O proxy fica como está

`src/proxy.ts` confere os dois JWT no Edge antes de qualquer rota rodar. Isso
**não muda**: o front mantém `ADMIN_JWT_SECRET` e `SESSAO_JWT_SECRET`.

A alternativa — perguntar ao Django a cada navegação — custaria um hop de rede
por page load e um endpoint `/admin/auth/eu` que não existe. A outra — não
guardar nada no Edge — pisca painel vazio antes de expulsar.

Vale separar duas coisas que o proxy faz, porque só uma usa segredo:

- **a barreira posicional** (404 para `/admin` fora do host do admin) usa
  `ehHostAdmin`, não usa JWT, e é a garantia de que *"uma rota nova sob
  `/api/admin` nasce protegida sem que ninguém decida nada"*;
- **a conferência de sessão** usa o segredo.

Depois desta fatia não haverá mais rota sob `/api/admin` para nascer protegida —
mas a barreira continua valendo para as **páginas** `/admin/*`, que continuam
sendo do Next.

O que os segredos deixam de fazer no front é **emitir**: `admin-sessao.ts`
perde `emitirSessao()` (quem emite agora é o `AdminLoginView` do Django) e fica
só com `lerSessao()`. Segredo de leitura, não de assinatura.

---

## 6. O que entra no back

### 6.1 As três variáveis

No `.env.example`, com os comentários que explicam o que não é óbvio — o mesmo
padrão dos que já estão lá:

- por que o hash vai em **base64** (em claro ele tem `$`, que o Compose expande
  como variável e entrega truncado, e o sintoma é um "usuário ou senha
  inválidos" que não explica nada);
- por que `ADMIN_JWT_SECRET` é **diferente** de `SESSAO_JWT_SECRET` (um cookie
  de admin apresentado ao painel do barbeiro falha na assinatura sem que ninguém
  escreva uma checagem para isso);
- que `ADMIN_JWT_SECRET` precisa ser **igual** à do front, porque o Django
  emite e o proxy lê.

No `docker-compose.yml`, passadas ao serviço `api`. `ADMIN_JWT_SECRET` vai com
`:?`, como `DJANGO_SECRET_KEY` e `SESSAO_JWT_SECRET` já vão: o código já levanta
`RuntimeError` sem ela, e falhar no `up` é mais barato de diagnosticar que
falhar no login.

`ADMIN_USUARIO` e `ADMIN_SENHA_HASH_B64` vão **sem** `:?`. Sem elas o login
apenas nega — `conferir_senha` já roda o argon2 contra um hash descartável e
devolve `False` — e é assim que se sobe o back sem admin configurado.

`worker` e `beat` **não** recebem as três: nenhuma tarefa de Celery toca o
admin.

### 6.2 O pacote de management commands

O back **não tem nenhum** hoje: não há `management/commands/` em lugar nenhum de
`backend/`, nem fixture, nem qualquer equivalente de seed. Os dois comandos
abaixo são os primeiros, e o primeiro deles paga o scaffolding
(`management/__init__.py`, `management/commands/__init__.py`).

### 6.3 `manage.py admin_hash`

Substitui o `npm run admin:hash` que o §3.3 apaga. Recebe a senha, devolve a
linha pronta:

```
ADMIN_SENHA_HASH_B64="<base64 do hash argon2id>"
```

Mora no back porque é lá que o argon2 passa a viver, e porque a variável que ele
gera é lida por `admin_senha.py`. Sem ele, depois desta fatia não há como girar
a senha do admin sem escrever Python à mão.

### 6.4 `manage.py semear`

`prisma/seed.ts` (145 linhas) some no §3.4, e ele é **a única forma de popular
um banco novo**. A fatia 0, §8, apoiou nele a liberdade de derrubar e recriar o
banco sempre que os dois lados discordassem — *"o `prisma/seed.ts` é a fonte de
verdade do estado"*. Apagá-lo sem substituto não deixa um teste vermelho: deixa
um banco vazio e uma tela em branco, que é bem mais caro de diagnosticar.

Porta o mesmo estado que o seed do Prisma monta. Idempotente, como aquele: rodar
duas vezes não pode duplicar barbearia nem serviço.

Este comando é **pré-requisito do passo 6** do §9, não uma melhoria posterior.

---

## 7. Estado final das variáveis

| Variável | Front | Back |
|---|---|---|
| `DATABASE_URL` e as 8 irmãs | sai | — (o back usa `PG*`) |
| `EVOLUTION_API_KEY` / `_URL` / `_INSTANCE` | sai | já tem |
| `ADMIN_USUARIO` | sai | **entra** |
| `ADMIN_SENHA_HASH_B64` | sai | **entra** |
| `CRON_SECRET` | sai | já tem |
| `ADMIN_JWT_SECRET` | fica (só o proxy lê) | **entra** |
| `SESSAO_JWT_SECRET` | fica (só o proxy lê) | já tem |
| `NEXT_PUBLIC_DOMINIO_BASE` | fica | espelhada em `DOMINIO_BASE` |
| `NEXT_PUBLIC_API_URL` | fica | — |
| `NEXT_PUBLIC_URL_BASE` | fica | espelhada em `URL_BASE` |

O front termina com **cinco** variáveis. Nenhuma delas é credencial de serviço:
duas leem cookie, três dizem onde as coisas moram.

**As duplicadas continuam duplicadas, e continuam tendo que bater**:
`ADMIN_JWT_SECRET`, `SESSAO_JWT_SECRET`, `DOMINIO_BASE`/`NEXT_PUBLIC_DOMINIO_BASE`
e `URL_BASE`/`NEXT_PUBLIC_URL_BASE`. Esta fatia **não** conserta isso — só
diminui a lista de quatro pares para quatro pares com menos companhia.

---

## 8. Os testes

### 8.1 O que acontece com os 31 arquivos de teste do front

Contados por importação do código que o §3 apaga:

- **20 saem junto com o código que testam.** Manter teste de código deletado é
  manter o código.
- **11 sobrevivem**, e dois deles com trabalho: `tenant.test.ts` e
  `admin-tenant.test.ts` cobrem comportamento de `lib/tenant.ts`, que muda no
  §4. `tenant.test.ts` hoje só exercita `extrairSlug` — que é reexportado de
  `slug.ts` e não muda —, então provavelmente só o import se move.
  `client-base.test.ts` cobre `baseDe()`/`MIGRADAS` e ganha o caso
  `/barbearia`.

### 8.2 `ambiente.test.ts` já é o teste do §7

`tests/ambiente.test.ts` é uma varredura estrutural: **toda variável que o
código lê tem que estar declarada no `.env.example`**. Ele existe justamente
contra o modo de falha desta fatia — variável esquecida faz o código ler
`undefined`, o `if (!url)` desviar para o caminho silencioso, e o sintoma vira
"mensagem que não chega", sem log e sem teste vermelho.

Consequência prática: **o estado final da tabela do §7 é verificado sozinho**.
Apagar `EVOLUTION_API_KEY` do `.env.example` enquanto algum código do front
ainda a lê fica vermelho; apagar o código e esquecer a variável no
`.env.example` também. Não é preciso escrever teste novo para a limpeza de
ambiente do lado do front — é preciso **rodá-lo**, e tratar o vermelho dele
como a lista de pendências da fatia.

O back tem um `tests/test_ambiente.py`, mas ele **não é estrutural**: são
asserções sobre strings específicas do `docker-compose.yml` (a chave da
Evolution, os flags do banco dela, o volume da sessão). Nada varre o código
atrás do que ele lê. O §2 existe por isso — as três variáveis do admin ficaram
fora do `.env.example` e do compose sem nada reclamar.

Pior: `pytest.ini` define `D:ADMIN_JWT_SECRET=segredo-admin-so-de-teste`. A
suíte **fabrica** a variável que o ambiente real não entrega, então o teste de
login do admin passa contra um mundo onde o §2 não existe. Não é um defeito do
`pytest.ini` — o comentário dele explica que segredo real nunca pode virar
default em arquivo versionado, e está certo. É a razão de o item 3 abaixo ter de
ser uma varredura de **arquivos**, não um teste que roda o código: qualquer
coisa que dependa do ambiente do processo herda a fabricação.

O molde já existe no repo: `tests/test_varredura.py` faz exatamente esse tipo de
prova por AST, para consultas de tenant fora do wrapper de RLS. O gêmeo do
`ambiente.test.ts` segue aquele estilo, e mora no `test_ambiente.py` que já
está lá.

### 8.3 O que precisa ser escrito

1. **No back, para `GET /api/barbearia`**: responde a barbearia do Host, 404
   para host que não é tenant, 404 para barbearia inativa (`ativo: false` — o
   `findFirst` de hoje filtra por ele, e perder esse filtro publicaria barbearia
   desativada).
2. **No front, para as três páginas vivas**: renderizam sem Prisma. É o teste
   que pega o erro do §4 — o `pedir()` chamado de Server Component.
3. **No back, o gêmeo do `ambiente.test.ts`**: varre `backend/` atrás de
   `os.environ[...]`/`os.environ.get(...)` e exige que cada nome esteja no
   `.env.example` do back — e, para as que o compose precisa entregar, no
   `environment:` do serviço. É o teste que teria pego o §2 no dia em que ele
   nasceu, e o único item desta lista que protege contra a classe inteira do
   defeito em vez de contra uma instância dele.
**O comportamento do login do admin já está coberto e não precisa de teste
novo.** `tests/test_admin_auth.py` exercita `conferir_senha` (usuário certo,
senha errada, usuário errado, ambiente vazio), a emissão e leitura do cookie, a
recusa de token assinado com outro segredo, a trava por IP, e até
`test_emitir_sem_segredo_no_ambiente_estoura`. Todos com `monkeypatch`.

E é justamente por isso que o §2 sobreviveu: **um teste que define a variável que
vai ler nunca descobre que ninguém a entrega.** A cobertura de comportamento
estava completa o tempo todo; o que faltava era a prova de fiação, e ela não é
um teste de comportamento — é o item 3.

---

## 9. Ordem, e o que é reversível

A fatia inteira é reversível por `git revert`, mas os passos têm valor
independente e ordem obrigatória:

1. **§2/§6.1 — as três variáveis no back.** Conserta um 500 vivo. Não depende de
   nada e não quebra nada se o resto parar aqui.
2. **§6.2/§6.3 — o pacote de commands e `manage.py admin_hash`.** Precisa
   existir *antes* de `hash-senha.ts` ser apagado, senão há uma janela sem como
   gerar o hash.
3. **§6.4 — `manage.py semear`, e conferir o banco que ele produz contra o do
   `prisma/seed.ts`.** Os dois ainda coexistem aqui, e é a única janela em que a
   comparação é possível (§10).
4. **§4 — `GET /api/barbearia` no back, e `MIGRADAS` ganha `/barbearia`.**
   Precisa existir *antes* de `lib/tenant.ts` mudar.
5. **§4 — `lib/tenant.ts` passa a falar com o Django.** As três páginas param de
   tocar o banco.
6. **§3.1/§3.2/§3.3 — a deleção dos handlers, dos módulos e dos scripts.** Só
   aqui, e só depois de 4 e 5, o Prisma pode sair sem deixar página quebrada.
7. **§3.4/§3.5 — `prisma/`, `prisma.config.ts`, o `command:` do compose e as
   dependências.**

O passo 6 é o único irreversível na prática: depois dele, `MIGRADAS` deixa de
ser um interruptor. Voltar uma linha da lista passa a apontar para um handler
que não existe mais — 404 mudo, longe da causa. **`MIGRADAS` deixa de ser o
painel de controle da travessia e vira uma lista de prefixos que o Django
atende.** Vale um comentário no topo dela dizendo isso, senão a próxima pessoa
tenta reverter por lá.

---

## 10. Riscos abertos

- **A fidelidade do `manage.py semear` (§6.4) não tem como ser testada contra o
  original.** O `prisma/seed.ts` é apagado na mesma fatia que o substitui, então
  divergência entre os dois estados não aparece como teste vermelho — aparece
  como tela que renderiza errado. Vale portar o seed e conferir o banco
  resultante **antes** de apagar o original, e não no mesmo commit.
- **A porta 5433 deixa de ter uso no front, mas não deixa de existir.** O
  compose do back continua publicando o Postgres, e as `DATABASE_URL_*_HOST` do
  `.env.example` do front eram o que documentava para que serve. Some a
  documentação junto com a variável.
- **`allowScripts` no `package.json`** cobre `@prisma/engines`, `esbuild` e
  `prisma`. Remover a entrada do `esbuild` junto seria fácil e errado — ele é do
  `vitest`, que fica.
- **Este Next não é o Next que se conhece de cor.** O `AGENTS.md` da raiz manda
  ler `node_modules/next/dist/docs/` antes de escrever código, e esta fatia mexe
  em Server Component, em `proxy.ts` (que no 16 substituiu o `middleware.ts`) e
  em `cache()` — três áreas que mudaram. O `node_modules` não existe no host
  hoje; ele mora na imagem `marcai-front-app`. Ou se instala local, ou se lê de
  dentro do contêiner.
