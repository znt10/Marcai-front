# Admin do Django como superfície de inspeção — design

**Decidido em 06/09/2026.** Ativa `django.contrib.admin` no `Marcai-back` como
ferramenta do **dono da plataforma**, para ler e corrigir dado de uma barbearia
por vez, sem furar o isolamento entre elas e sem desmontar o painel da
plataforma que já existe.

## O pedido, e o que ele NÃO é

O pedido foi "ativar o admin do Django". A investigação mostrou que substituir
o painel atual pelo admin do Django perderia cinco coisas concretas, e por isso
o escopo foi cortado ao meio: **o admin do Django inspeciona; o painel custom
continua dono do ciclo de vida da barbearia.**

O que **fica** no painel custom (`admin.<domínio>`, rotas `/api/admin/*`), e por quê:

| O que | Por que não migra |
|---|---|
| Criar barbearia | É *uma* transação atômica que cria a barbearia, define `app.barbearia_id` dentro dela e cria o barbeiro DONO com token de convite (`app/services/admin_barbearias.py`). O formulário "adicionar" do Django faz um `INSERT` numa tabela e mais nada — o resultado seria **barbearia órfã**, sem dono e sem convite, em que ninguém consegue entrar. |
| Convite do dono, e a reemissão do link | Não existe como ação de ModelAdmin sem ser reescrito. |
| Trava por IP no login | Backoff exponencial + 10 min de castigo, desenhada porque só existe **uma** conta de admin ("travar por conta deixaria qualquer um trancar o dono do site fora do próprio painel"). O admin do Django não tem trava nenhuma. |
| Contagem de barbeiros/agendamentos por barbearia | `listar_com_contagem` faz um laço tenant a tenant porque `brutus_admin` também está sob RLS. |
| Ativar/desativar barbearia | Precisa da conexão `admin`: `brutus_app` tem `REVOKE INSERT/UPDATE/DELETE` em `tenant_barbearia`. |

## Quem usa, e como isso é garantido

**O admin do Django é do dono da plataforma. Barbeiro não alcança.** Três
camadas, e a primeira é posicional — não é permissão que alguém pode esquecer
de checar:

1. **Host.** De qualquer host de barbearia, `/admin/django/*` levanta `Http404`
   no `BarreiraAdminMiddleware` **antes de qualquer roteamento**, e o
   `proxy.ts` do front faz o mesmo. A rota não existe daquele host.
2. **Cookie.** Do host do admin, exige `sessao_admin` válido — a sessão do
   login que tem a trava por IP.
3. **Login do Django** atrás disso.

A camada 2 é o que responde ao pedido literal ("só para o admin do projeto"):
barbeiro não tem esse cookie e não tem como obter um.

## Arquitetura

### Onde mora: `/admin/django/`

Não é estética. O `BarreiraAdminMiddleware` já tem `PREFIXOS = ("/admin",
"/api/admin")`; pendurar o admin do Django sob `/admin/` herda a barreira
posicional **sem escrever regra nova**. É o padrão que o repo já usa: "rota
nova sob este prefixo nasce protegida sem que ninguém decida nada".

Montar num prefixo próprio (`/painel-django/`) exigiria uma barreira nova, que
é uma coisa a mais para alguém esquecer.

### Como o RLS é respeitado — imposição, não escolha

A política é:

```sql
USING (barbearia_id::text = current_setting('app.barbearia_id', true))
```

Com o `true`, variável não definida devolve `NULL`, e `x = NULL` não é
verdadeiro — **nenhuma linha**. As tabelas têm `FORCE ROW LEVEL SECURITY`, e a
conexão `default` é `brutus_app`, sujeita à política.

Portanto: o admin do Django, sem mais nada, mostraria **listas vazias em todo
model de tenant**. Ele funcionaria e não mostraria nada.

Só há dois jeitos de sair disso, e um deles está descartado:

- **Descartado:** rodar como `brutus_owner` (que tem `owner_irrestrito USING
  (true)`). Isso mostra todas as barbearias juntas e desliga a fronteira mais
  forte do sistema.
- **Adotado:** um middleware define `app.barbearia_id` por requisição, na
  conexão `default` (menor privilégio: `brutus_app` não pode escrever em
  `tenant_barbearia`, e não precisa).

**Consequência que precisa ficar dita:** o isolamento continua no BANCO. Não é
um `get_queryset().filter(...)` que um ModelAdmin novo pode esquecer de aplicar
— um ModelAdmin que alguém acrescente amanhã sem pensar nisso nasce vendo só a
barbearia escolhida, porque quem filtra é a política do Postgres.

### O seletor de barbearia

A barbearia escolhida vive na **sessão do Django**, não na URL. Uma página
simples sob `/admin/django/` lista as barbearias (lidas na conexão `admin`,
que é quem enxerga `tenant_barbearia`) e grava a escolha.

Sem barbearia escolhida, o middleware **não** define a variável — e o admin
mostra listas vazias, que é o comportamento correto e legível: "você não
escolheu de quem está falando".

### A transação

O middleware **só age sob `/admin/django/*`** — fora dali sai na primeira
linha. Envolver toda requisição da API numa transação seria uma mudança de
comportamento que ninguém pediu.

Sob aquele prefixo, ele abre `transaction.atomic` na conexão `default` e roda
`set_config('app.barbearia_id', <escolhida>, true)`. O `true` (is_local) é
obrigatório pelo mesmo motivo de sempre: a variável tem de morrer com a
transação, ou a conexão volta para a pool carregando o tenant.

**Não reusa `com_barbearia`**: aquele helper usa `atomic(durable=True)`, que
estoura de propósito se aninhado, e um request de admin pode passar por
caminhos que o abram. O middleware do admin abre a sua própria transação, sem
`durable`, e isso é deliberado — está anotado no código.

### O conflito com `ClienteMiddleware`, e como se resolve

**Achado na investigação, e sem ele o admin não funcionaria de jeito nenhum:**
`ClienteMiddleware` devolve **403 em todo POST/PATCH/PUT/DELETE** que não traga
o header `X-Brutus-Cliente`. O admin do Django faz POST de formulário HTML
comum, sem header nenhum — **o login dele já falharia**, e toda gravação junto.

Aquele header existe por uma razão específica e continua válida para a API:
front e back dividem o mesmo host e diferem só na porta, então é cross-origin
*e* same-site, e o `SameSite=Lax` não protege nada nesse arranjo. Exigir um
header fora da lista de cabeçalhos simples obriga preflight, e preflight
recusado impede o navegador de mandar o pedido com credenciais.

Para o admin do Django esse arranjo não se aplica: o formulário é servido pela
**mesma origem** que o recebe. A proteção certa ali é a de sempre, o token
CSRF do Django — que hoje não está ligada, porque `CsrfViewMiddleware` não
está na lista.

Portanto:

1. **`CsrfViewMiddleware` entra** na `MIDDLEWARE`. O admin exige, e é a
   proteção correta para formulário de mesma origem.
2. **`ClienteMiddleware` passa a ignorar `/admin/django/*`**, porque ali quem
   protege é o token CSRF, não o header.

**Ponto que a implementação precisa PROVAR, não supor:** ligar
`CsrfViewMiddleware` globalmente não pode quebrar a API. A expectativa é que
não quebre, porque `APIView.as_view()` do DRF já embrulha a view em
`csrf_exempt` e, com `DEFAULT_AUTHENTICATION_CLASSES: []`, o DRF não reativa a
checagem por dentro (quem reativaria seria `SessionAuthentication`). A rota
`/api/saude` é função pura de GET, e CSRF não se aplica a GET.

Isso é raciocínio, não evidência. A suíte inteira do back (475 testes, com
cobertura densa de POST em agendamento, bloqueio, equipe e admin) é o que
transforma em evidência — e ela roda **antes** de qualquer outra coisa desta
etapa. Se algum POST da API passar a dar 403, a saída não é `csrf_exempt`
espalhado: é pôr o `CsrfViewMiddleware` só no caminho do admin.

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `backend/backend/settings.py` | **Modificar.** Os 5 apps (`admin`, `auth`, `contenttypes`, `sessions`, `messages`); os middleware do Django (`SessionMiddleware`, `AuthenticationMiddleware`, `MessageMiddleware`, `CsrfViewMiddleware`); o bloco `TEMPLATES` (hoje inexistente, e o admin não sobe sem ele); e o middleware novo. Atualizar os dois comentários que hoje dizem que esses apps foram excluídos — eles estão certos sobre o passado e passariam a mentir sobre o presente. |
| `backend/backend/urls.py` | **Modificar.** `path("admin/django/", admin.site.urls)`. |
| `backend/tenant/middleware.py` | **Modificar.** `BarreiraAdminDjangoMiddleware`: exige `sessao_admin` válido sob `/admin/django/*`, e define `app.barbearia_id` da barbearia escolhida na sessão. E `ClienteMiddleware` passa a ignorar esse prefixo (ver o conflito, acima). |
| `backend/app/admin.py` | **Criar.** Os `ModelAdmin`. Fica em `app/`, não em `tenant/`: `tenant/` é o pacote dos models e do RLS, e `app/` é a superfície. |
| `backend/app/api/v1/views/admin_django_tenant.py` | **Criar.** A página do seletor de barbearia. |
| `tests/test_admin_django.py` | **Criar.** Ver "Testes". |
| `tests/test_varredura.py` | **Modificar.** Passa a cobrir `backend/app/admin.py`. |

### Models registrados

Editáveis: `Barbeiro`, `Servico`, `BarbeiroServico`, `HorarioTrabalho`,
`Bloqueio`, `Cliente`, `Agendamento`.

**`Barbearia` entra somente-leitura.** É preciso vê-la para escolher e para ter
contexto; criar continua no painel custom, senão as órfãs voltam por outra
porta.

### Tabelas novas

`auth_user`, `auth_group`, `auth_permission`, `django_content_type`,
`django_session`, `django_admin_log` — criadas pelas migrations dos apps
contrib.

**Não precisam de `GRANT` novo:** `docker/init-db.sql` já tem `ALTER DEFAULT
PRIVILEGES FOR ROLE brutus_owner ... GRANT SELECT, INSERT, UPDATE, DELETE ON
TABLES TO brutus_app`, e as migrations rodam como `brutus_owner`. Conferido.

**Essas tabelas ficam FORA do RLS**, e é certo: elas não têm `barbearia_id` e
não pertencem a tenant nenhum.

## A dívida que este design paga de propósito

`tests/test_varredura.py` hoje lê só `backend/tenant/`. Um `app/admin.py` fora
do alcance dela seria a regra "toda consulta a model de tenant dentro de
`com_barbearia`" deixando de ser testada **justamente na superfície nova**.

A varredura passa a cobrir `backend/app/admin.py`, com a isenção documentada
para o que o próprio `ModelAdmin` faz por baixo (o `get_queryset` do Django
chama o ORM, e quem garante o escopo ali é a política do banco, não o wrapper).

## Testes

O que importa, em ordem de importância:

1. **Isolamento.** Logado, com a barbearia A escolhida, o admin não enxerga
   cliente, barbeiro nem agendamento da barbearia B. **Se este teste não
   existir, o resto não vale nada.**
2. **Sem escolha, sem dado.** Sessão sem barbearia escolhida devolve listas
   vazias, e não dado de alguém.
3. **A barreira de host.** `/admin/django/` de um host de barbearia devolve
   404, não 403 e não a tela de login.
4. **A barreira de cookie.** Do host do admin, sem `sessao_admin` válido,
   devolve 404.
5. **`Barbearia` é somente-leitura** — o admin não expõe "adicionar".
6. **A API não quebrou.** Os 475 testes existentes continuam passando depois
   de `CsrfViewMiddleware` entrar — em especial os POST de agendamento,
   bloqueio, equipe e admin. Este não é um teste novo; é a suíte inteira
   usada como rede, e ela roda ANTES de qualquer outro passo da etapa.
7. **O admin grava.** Um POST do admin do Django (que não traz
   `X-Brutus-Cliente`) não leva 403 do `ClienteMiddleware`.

## Fora de escopo, deliberadamente

- Substituir o painel custom (decidido: não).
- Servir estático de produção para o admin. Hoje o `CMD` do Dockerfile é
  `runserver`, que serve o estático sozinho. No dia em que houver gunicorn, é
  problema daquele dia — e é problema do deploy inteiro, não deste admin.
- Backend de autenticação custom (um login só). Foi considerado e recusado:
  economiza um login e cria código de autenticação novo, que é onde bug de
  segurança mora.
- Registrar `Barbearia` como editável.

## Riscos

**O maior:** um ModelAdmin futuro registrado sem pensar em tenant. O design
mitiga isso estruturalmente — quem filtra é o Postgres, não o ModelAdmin — mas
a mitigação vale enquanto o middleware estiver no lugar. O teste 2 ("sem
escolha, sem dado") é o que segura isso.

**O segundo:** o admin do Django permite **apagar**. `Agendamento` e `Cliente`
têm `on_delete=RESTRICT` de um lado, mas apagar um `Cliente` com histórico é
uma ação destrutiva a um clique de distância, sem confirmação de negócio. A
decisão para a implementação: `has_delete_permission = False` por padrão nos
ModelAdmin, ligando caso a caso só onde houver razão.
