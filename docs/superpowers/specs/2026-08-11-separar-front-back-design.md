# BRUTUS — Etapa 6, fatia 0: a fronteira entre front e back

## 1. O que esta fatia é, e o que ela não é

O backlog decidiu em 10/08 separar o produto em **back Django e front Next**.
Isto aqui não migra rota nenhuma. Esta fatia decide **onde passa a linha** — e
só isso.

O motivo de ela existir sozinha: as sete fatias seguintes (fundação, horários,
auth, público, painel, admin, WhatsApp) são todas escritas *contra* respostas
que ainda não existem. Onde mora cada repositório. Como o navegador alcança o
Django. O que acontece com o cookie `httpOnly` quando o processo que o emite
deixa de ser o processo que serve a página. Quem resolve subdomínio → barbearia
depois que o `proxy.ts` sai do caminho. Especificar qualquer uma delas antes
destas respostas é escrever duas vezes.

**A referência é o SIGEVI** (`D:\Estagio\sigevi` e `D:\Estagio\sigevi-front`),
que já é exatamente esta forma: dois repositórios, Django de um lado, Next do
outro, `lib/api/` centralizado. O `src/lib/api/` do Brutus saiu de lá. Onde o
SIGEVI e o Brutus divergem, a divergência está registrada abaixo com o motivo —
copiar a forma não é copiar as decisões de segurança.

---

## 2. Dois repositórios

```
C:\Users\jc970\Desktop\barba\
  front\   .git atual, história preservada, permanece Next
  back\    .git novo, Django
```

Espelha `sigevi` / `sigevi-front`. Os nomes `back` e `front` ficam como estão:
não aparecem em configuração nenhuma, e renomear para `brutus` / `brutus-front`
seria movimentação sem retorno.

**Cada repositório com o seu compose.** O `back/docker-compose.yml` fica com
toda a infraestrutura — `db`, `redis`, `evolution`, `zelador`, `agendador` e o
próprio Django. O `front/docker-compose.yml` fica só com o `app`. O
`docker/init-db.sql`, que é onde nascem os papéis `brutus_app` e `brutus_owner`,
vai junto com o banco para o `back/`.

As specs e o `docs/backlog.md` **ficam no front**, junto dos commits que os
geraram. Não há repositório de orquestração.

### A rede compartilhada

Durante a travessia o Prisma e o Django batem no **mesmo Postgres**. Com dois
composes, isso exige uma rede docker externa:

```bash
docker network create brutus   # uma vez, na máquina
```

Os dois composes a declaram como `external: true`. Sem isso o `app` do front
não enxerga o `db` do back, e o sintoma é um erro de conexão que não diz nada
sobre redes.

---

## 3. As duas origens, e por que o cookie sobrevive

| | dev |
|---|---|
| Front | `brutus.localhost:3000`, `dontony.localhost:3000`, `admin.localhost:3000` |
| Back | `brutus.localhost:8000`, `dontony.localhost:8000`, `admin.localhost:8000` |

O Django atende nos **mesmos curingas** que o Next, porque é do `Host` que ele
tira o tenant. `*.localhost` resolve sozinho no Chrome e no Firefox — a mesma
propriedade que o README já explora, sem mexer em DNS.

O `client.ts` de hoje carrega este comentário:

> Sem axios de propósito. Aqui as rotas são do próprio Next, na mesma origem:
> não há gateway, header de autorização nem baseURL para configurar — o cookie
> viaja sozinho porque é `httpOnly` e same-origin.

Separar os processos parecia derrubar essa frase inteira. Não derruba, e o
motivo é preciso: **os cookies do Brutus são host-only** — `httpOnly`,
`sameSite: 'lax'`, sem atributo `domain` (`src/app/api/auth/login/route.ts:76`
e `src/app/api/admin/auth/login/route.ts:40`). E **cookie ignora porta**. Front
e back dividem o mesmo *host* e diferem só na porta, então o cookie emitido em
`brutus.localhost:8000` é enviado para `brutus.localhost:3000` e vice-versa,
sem `Domain=.localhost`, sem `SameSite=None`, sem `Secure` em desenvolvimento.

Esta é a razão de não termos ido para o caminho que o SIGEVI tomou aqui. Ele
guarda o JWT em `localStorage` e manda `Authorization: Bearer`
(`stores/authStore.ts:114`), e o `proxy.ts` dele documenta a consequência:

> A verificação de autenticação será feita no lado cliente pelo
> SystemLayoutClient que tem acesso ao localStorage.

O SIGEVI é single-tenant e pode pagar esse preço. No Brutus a propriedade
central é *a barbearia A não enxerga a B*, e um token legível por qualquer
script na página é uma troca ruim quando a alternativa custa zero.

> **Restrição, não preferência: o token nunca é guardado em `localStorage`,
> `sessionStorage` ou qualquer lugar que o JavaScript da página alcance.** A
> sessão vive em cookie `httpOnly` e só. Isso vale para as fatias 3 (auth), 5
> (painel) e 6 (admin), e vale para o PWA do backlog — service worker não muda
> nada aqui, porque quem não pode ler o token é o script da página, e o
> `httpOnly` continua sendo o que garante isso. Qualquer fatia que precise
> contrariar esta linha muda **esta spec** antes de escrever código.

**O `client.ts` continua sem axios.** Ganha `credentials: 'include'` e um
`baseDe()` (§9). Não ganha interceptador, store nem dependência nova.

---

## 4. CORS, e o buraco que ele abre

Mesmo host, portas diferentes: é **cross-origin** — CORS se aplica — e é
**same-site** — `SameSite=Lax` não bloqueia. As duas coisas ao mesmo tempo, e a
segunda é a que exige atenção.

- `Access-Control-Allow-Origin` **ecoado a partir de uma allowlist** derivada de
  `DOMINIO_BASE`. Não pode ser fixo: a origem varia por barbearia. Não pode ser
  `*`: `*` é incompatível com credenciais.
- `Access-Control-Allow-Credentials: true`.
- `credentials: 'include'` em todo pedido do `client.ts`.

**O CSRF precisa de resposta explícita, e é dívida nova.** Hoje o `Lax` sozinho
basta porque tudo é same-origin. Depois da separação, 3000 e 8000 são same-site
— e entre origens same-site o `Lax` **não protege**. A proteção passa a ser a
allowlist estrita somada a um header customizado exigido em `POST`, `PATCH`,
`PUT` e `DELETE` — `X-Brutus-Cliente: web` — que força preflight: uma origem
hostil não consegue fazer o navegador mandar o pedido com credenciais se o
preflight for recusado. Pedido que escreve e chega sem esse header é recusado
com **403**, e o `client.ts` passa a mandá-lo em todo verbo que não é `GET`.

O CSRF de cookie/token do Django **não entra**. Ele foi desenhado para form de
template renderizado pelo próprio Django, e a sessão aqui é JWT em cookie
emitido por uma rota de API.

---

## 5. O tenant, refeito do zero no Django

Porte de `src/lib/slug.ts` — `extrairSlug(host, dominioBase)` e
`ehHostAdmin(host, dominioBase)`. É função pura sobre string; porta direto e
ganha os mesmos casos de teste.

Um middleware resolve `request.get_host()` → slug → `Barbearia`, com cache de
TTL espelhando `TTL_CACHE_TENANT_MS`, e anexa o resultado em
`request.barbearia`. Host que não resolve responde **404**, como hoje.

**Nenhum header de entrada é confiado.** `USE_X_FORWARDED_HOST` fica
**desligado** em desenvolvimento. É isso — e só isso — que mantém o back
deployável sozinho: um Django que dependesse de um `x-barbearia-slug` injetado
pelo Next não subiria, não rodaria teste e não iria para produção sem o front na
frente. Em produção, quando houver um proxy único na frente dos dois, ele é
ligado apontando para esse proxy conhecido.

`ALLOWED_HOSTS` aceita `.localhost` em dev e `.DOMINIO_BASE` em produção.

---

## 6. O RLS é do banco, não do framework

O isolamento entre barbearias são 436 linhas de SQL bruto espalhadas por oito
migrations, e a parte que importa está em `20260805221500_rls`,
`20260806170000_admin_grants` e `20260806173000_admin_rls`: dois papéis
(`brutus_app` e `brutus_owner`), `ENABLE` + `FORCE ROW LEVEL SECURITY` em sete
tabelas, políticas amarradas `TO brutus_app` para falhar fechado, e a
`Barbearia` deliberadamente fora do RLS, protegida por `REVOKE` porque precisa
ser lida antes de existir tenant.

**Nada disso é traduzido para o ORM do Django, nunca.** É SQL de banco, e
sobrevive à troca de linguagem de graça. Na fatia 8, quando o Prisma sair, esses
arquivos são **copiados** para um `RunSQL` — não reescritos.

O que o Django precisa construir é o outro lado: o equivalente de
`comBarbearia()`. Um context manager que abre transação e roda

```sql
SELECT set_config('app.barbearia_id', %s, true)
```

O terceiro argumento `true` é `is_local`: a variável morre com a **transação**.
Com `false` ela viveria na **sessão**, e como a conexão volta para a pool o
próximo pedido herdaria o tenant anterior — vazamento cruzado intermitente e
dependente de temporização. O `src/lib/tenant.ts` já documenta isso em letras
garrafais e a razão não muda de lado.

Isto tem uma armadilha específica do Django: o `set_config` precisa rodar na
**mesma transação** das consultas, então a interação com `ATOMIC_REQUESTS`, com
autocommit e com a pool de conexões é parte do desenho, não detalhe de
implementação.

**A `varredura estrutural` ganha par em pytest.** O teste de hoje existe para
garantir que *toda* consulta passe pelo wrapper, e a garantia vale exatamente
enquanto isso for verdade. Um teste que lê o código e falha quando um model de
tenant é consultado fora do context manager é parte da entrega desta fatia, não
da fatia 1.

A restrição de exclusão (`23P01`), que é a única garantia real contra
agendamento duplo, é do banco também. Atravessa sem trabalho nenhum.

---

## 7. A barreira posicional passa a existir duas vezes

O `proxy.ts` protege `/admin` e `/api/admin/*` **por posição**: a partir de
qualquer host que não seja o `admin.`, eles respondem 404, antes de qualquer
rota rodar. Rota nova sob aquele prefixo nasce protegida sem ninguém decidir
nada. O backlog registra o risco com precisão — essa propriedade é fácil de
perder na migração, e perdê-la é silencioso.

A resposta é não escolher entre os dois lados. Durante a travessia:

- o **`proxy.ts` fica**, guardando as páginas e as rotas ainda servidas pelo Next;
- o **Django aplica a mesma regra** às suas: qualquer caminho sob `/admin` ou
  `/api/admin` responde 404 quando `ehHostAdmin(host)` for falso.

São duas execuções independentes da mesma regra, em duas bordas. Uma rota que
atravessa não fica desprotegida em nenhum instante, porque o lado que a recebe
já a protege por posição.

Isto contraria a linha do backlog que diz que "o `proxy.ts` sai de cena". Ele
sai — na fatia 8, junto com `src/app/api/**`, e não antes.

---

## 8. Quem é dono do schema durante a travessia

O banco pode nascer do zero: não há dado que importe, o `prisma/seed.ts` é a
fonte de verdade do estado, e derrubar e recriar é livre sempre que os dois
lados discordarem.

Isso remove a migração de dados. **Não remove a compatibilidade de
nomenclatura** — e essa distinção é o ponto desta seção. O estrangulamento faz
Prisma e Django dividirem as **mesmas tabelas** enquanto durar, então:

- **o Prisma continua dono do DDL até a fatia 8.** `prisma migrate` segue sendo
  o único que cria e altera tabela. O Django nunca escreve DDL no banco
  compartilhado.
- **os models do Django nascem `managed = False`**, com `db_table` e
  `db_column` **explícitos em todo campo** — `"Barbearia"`, `"barbeariaId"`.
  Um `db_column` esquecido não quebra o Django: quebra o lado que ainda é
  Prisma, e o sintoma aparece longe da causa.
- **`INSTALLED_APPS` fica mínimo: sem `django.contrib.admin` e sem
  `django.contrib.auth`.** A autenticação do produto é `Barbeiro`; instalar as
  tabelas do Django num banco de que ele não é dono só cria estrutura para
  gerenciar e migration para conciliar.

Na fatia 8 o Prisma sai, o Django assume o DDL com uma migration inicial
consolidada mais o `RunSQL` do §6, e os `db_table`/`db_column` podem então cair.

---

## 9. O interruptor da travessia é um array

As 34 rotas mantêm **caminho e payload idênticos** dos dois lados. Os módulos de
`src/lib/api/` (`publicoAPI`, `painelAPI`, `adminAPI`) não mudam de forma: a
tela continua chamando `painelApi.agenda(dia)`, sem saber quem atende.

Em `client.ts`, `const BASE = '/api'` vira `baseDe(caminho)`:

```
prefixo em MIGRADAS  ->  `${NEXT_PUBLIC_API_URL}/api`
senão                ->  '/api'
```

**Uma lista é o painel de controle da travessia inteira.** Cada fatia acrescenta
os seus prefixos, e voltar atrás é remover uma linha. É também o único lugar
onde alguém precisa olhar para responder "quem serve isto hoje?".

O `agendador` do compose bate direto em `POST /api/cron/lembretes` com o
`CRON_SECRET` — ele não passa pelo `client.ts` e por isso não enxerga a lista.
Quando os lembretes migrarem (fatia 7), o alvo dele muda no compose, e é uma
mudança que precisa acontecer no mesmo commit.

---

## 10. Os testes

O back roda **pytest + pytest-django**. Os 30 arquivos de Vitest seguem verdes
até a fatia deles atravessar; então o teste equivalente entra e o antigo sai **no
mesmo commit** que vira o interruptor — nunca antes, para não existir janela sem
cobertura, e nunca depois, para não existir teste que afirma coisa sobre código
morto.

Esta fatia entrega três testes:

1. **host → barbearia**: subdomínio resolve, host desconhecido dá 404, host do
   admin é reconhecido.
2. **o wrapper de RLS escopa de verdade**: consulta dentro do context manager
   com o tenant A não enxerga linha do tenant B.
3. **a varredura estrutural** (§6).

---

## 11. O canário

O fim desta fatia é verificável em um comando e uma rota:

```bash
cd back && docker compose up
```

e `GET /api/saude` respondendo em `brutus.localhost:8000`, chamado **a partir
de** `brutus.localhost:3000`. Ele prova três coisas de uma vez:

1. **o `Host` virou tenant** — a resposta traz o slug e o nome da barbearia
   resolvidos pelo middleware, e `dontony.localhost:8000` traz outros;
2. **o RLS escopou** — a rota conta uma tabela de tenant dentro do context
   manager, e o número muda entre as duas barbearias;
3. **o cookie atravessa o CORS** — a rota emite um cookie descartável
   (`saude`, `httpOnly`, host-only) e informa se recebeu um na entrada. A
   primeira chamada diz que não recebeu; a segunda diz que sim.

O ponto 3 precisa desse cookie de brinquedo porque **não há login nesta fatia**
— a autenticação é a fatia 3. O que está sendo verificado aqui é o caminho, não
a sessão: se um cookie emitido na porta 8000 volta a partir da 3000, o raciocínio
do §3 está certo, e o login de verdade vai andar sobre trilho já testado.

O front continua **idêntico em comportamento**, com o `baseDe()` no lugar e a
lista `MIGRADAS` vazia.

---

## 12. O que fica de fora

- **Qualquer uma das 34 rotas.** Nenhuma atravessa aqui. A `/api/saude` é
  canário e não existe do lado Next.
- **Os models além do necessário para o canário.** O mapeamento completo das 8
  tabelas é a fatia 1.
- **O proxy único de produção.** A forma final põe os dois atrás de uma origem
  só, e aí `USE_X_FORWARDED_HOST` é ligado. É configuração, não código, e não
  bloqueia nada agora.
- **PWA.** O `Unistock_Front` já tem PWA configurado e isso serve ao item do
  backlog, mas é outra etapa.
- **Qualquer tarefa Celery de verdade.** O `worker` e o `beat` entram nesta
  fatia (§14), mas só com uma tarefa `ping`. O lembrete, o healthcheck do
  WhatsApp e a poda do zelador são fatia 7.

---

## 14. O que o Unistock_Back decide por nós

`C:\Users\jc970\Desktop\Unistock` tem três repositórios — `Unistock_Back`,
`Unistock_Front` e um `Unistock_Umbrella` que os amarra por submódulo. É o
mesmo desenho que esta spec escolheu, com uma camada de orquestração a mais
que não conflita: o `Unistock_Back` também tem compose próprio.

**O que vem de lá:**

- **O layout.** `manage.py` na raiz, `backend/backend/` para o projeto e
  `backend/<app>/` para as apps, mais `entrypoint.sh`, `Dockerfile` e
  `requirements.txt` num arquivo só.
- **`django-cors-headers`** no lugar de middleware escrito à mão. Com uma
  adaptação obrigatória: o Unistock usa `CORS_ALLOWED_ORIGINS`, que é lista
  estática, e aqui a origem varia por barbearia — tem que ser
  `CORS_ALLOWED_ORIGIN_REGEXES`, derivado de `DOMINIO_BASE`.
- **DRF + drf-spectacular.** Isto encerra a pergunta que esta seção deixava em
  aberto: a camada de serialização é DRF, decidida pela referência e não pela
  primeira rota.
- **Celery + django-celery-beat + redis**, com os serviços `worker` e `beat`.

**O que NÃO vem, e o motivo:**

- **`mysqlclient`.** O Unistock é MySQL. Todo o isolamento entre barbearias
  daqui é PostgreSQL: `set_config`, `FORCE ROW LEVEL SECURITY`, políticas por
  papel, e a restrição de exclusão `23P01` que é a única garantia real contra
  agendamento duplo. Nenhum dos quatro existe em MySQL.
- **`djangorestframework_simplejwt` na forma padrão.** Ele é Bearer token em
  header, que é o desenho que o §3 proíbe por restrição. Se ele entrar algum
  dia, entra emitindo em cookie `httpOnly`.
- **`weasyprint`** e o resto do que serve ao domínio de estoque.

---

## 13. Riscos abertos

- **Django dev server e subdomínio curinga.** `*.localhost` resolve no
  navegador; falta confirmar que o `runserver` aceita e que `ALLOWED_HOSTS`
  com `.localhost` cobre `brutus.localhost` e `admin.localhost` juntos.
- **`set_config` e a pool.** É a parte de maior risco desta fatia. Se a
  transação do Django não for a mesma em que o `set_config` rodou, o RLS
  filtra tudo e o sintoma sai como "não encontrado" — longe da causa, igual ao
  que o `_limparCacheTenant()` documenta do lado Prisma.
- **Duas migrations, um banco.** Enquanto o `INSTALLED_APPS` ficar mínimo o
  Django não tem migration nenhuma para rodar. Se alguma app que precise de
  tabela entrar sem que se perceba, ela cria tabela num banco de que o Prisma é
  dono.
