# Admin do Django como superfície de inspeção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar `django.contrib.admin` no `Marcai-back` como ferramenta do dono da plataforma, para ler e corrigir dado de **uma barbearia por vez**, sem furar o isolamento entre elas e sem tocar no painel custom.

**Architecture:** O admin mora sob `/admin/django/`, herdando a barreira posicional que já 404-a `/admin*` fora do host do admin. Um middleware novo exige o cookie `sessao_admin` e define `app.barbearia_id` por requisição na conexão `default` — o isolamento continua sendo a política de RLS do Postgres, não um filtro de `get_queryset` que alguém pode esquecer.

**Tech Stack:** Django 5.2 + DRF + Postgres com Row Level Security. Repositório `Marcai-back`.

**Spec:** `Marcai-front/docs/superpowers/specs/2026-09-06-admin-do-django-design.md` — leia antes de começar. Ela explica por que o painel custom NÃO é substituído e por que o RLS não é negociável.

## Global Constraints

- **Repositório:** `/home/jose/Área de trabalho/marcai/Marcai-back`. O branch é criado no Passo 0.
- **Nunca `git add -A`, `git add .` ou `git commit -a`.** Todo commit lista os arquivos um a um.
- **Toda consulta a model de tenant dentro de `with com_barbearia(...)`** — exceto o próprio admin, cujo escopo vem do middleware desta etapa. `tests/test_varredura.py` é uma varredura de AST que reprova o build; a Task 5 a estende para o arquivo novo.
- **`com_barbearia` usa `atomic(durable=True)`** — aninhar dois estoura `RuntimeError`. O middleware desta etapa abre a **própria** transação, **sem** `durable`, de propósito.
- **Fuso é só `tenant/datas.py`.**
- **TDD:** escreva o teste, rode e veja falhar pelo motivo certo, implemente, rode e veja passar, commite.
- **Comentário em português**, explicando *por quê*, não *o quê*. Referência de tom: `backend/tenant/middleware.py`.
- **Mensagem de commit** minúscula, `área: frase em português`. Sem `feat:`/`fix:`. Rodapé obrigatório:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

### Rodar os testes

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-back"
docker compose run --rm api pytest -q                 # suíte inteira (475 hoje)
docker compose run --rm api pytest -q tests/test_admin_django.py
```

### Estado de partida

`master` está verde com **475 testes**. Qualquer número menor que isso ao fim de uma task é regressão sua.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `backend/backend/settings.py` | **Modificar.** Os 5 apps contrib, os 4 middleware do Django, o bloco `TEMPLATES`, e o middleware novo na ordem certa. |
| `backend/backend/urls.py` | **Modificar.** O seletor **antes** de `admin.site.urls` (a ordem decide quem atende). |
| `backend/tenant/middleware.py` | **Modificar.** `AdminDjangoMiddleware` (porta + escopo de tenant), e `ClienteMiddleware` passa a ignorar o prefixo. |
| `backend/app/admin.py` | **Criar.** Os `ModelAdmin`. Em `app/`, não em `tenant/`: `tenant/` é models e RLS, `app/` é superfície. |
| `backend/app/views_admin_django.py` | **Criar.** O seletor de barbearia. Fora de `api/v1/` porque não é rota de API — devolve HTML, não JSON. |
| `tests/test_admin_django.py` | **Criar.** Barreiras, escopo e o teste de isolamento. |
| `tests/test_varredura.py` | **Modificar.** Passa a cobrir `backend/app/admin.py`. |

---

## Passo 0: o branch

Antes da Task 1:

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-back"
git fetch origin
git checkout -b admin-do-django origin/master
```

A árvore está limpa neste ponto. Se `git status` mostrar arquivo modificado, **pare e reporte** — não é seu.

---

## Task 1: A infraestrutura, e a prova de que a API não quebrou

**Files:**
- Modify: `backend/backend/settings.py`
- Modify: `backend/backend/urls.py`

**Interfaces:**
- Produces: `/admin/django/` roteado para `admin.site.urls`; `INSTALLED_APPS` com os 5 apps contrib; `MIDDLEWARE` com `SessionMiddleware`, `CsrfViewMiddleware`, `AuthenticationMiddleware`, `MessageMiddleware`. A Task 2 acrescenta o middleware próprio nessa mesma lista.

### O risco desta task, e por que ele vem primeiro

`CsrfViewMiddleware` entra **global**. A expectativa é que não quebre a API porque `APIView.as_view()` do DRF já embrulha a view em `csrf_exempt`, e com `DEFAULT_AUTHENTICATION_CLASSES: []` o DRF não reativa a checagem por dentro. **Isso é raciocínio, não evidência.** Os 475 testes são o que transforma em evidência, e é por isso que esta task existe sozinha: se a API quebrar, você descobre aqui, com um diff de dois arquivos, e não no meio de outra coisa.

- [ ] **Step 1: Acrescentar os apps**

Em `backend/backend/settings.py`, `INSTALLED_APPS` (linha 75) passa a ser:

```python
INSTALLED_APPS = [
    # Os cinco de baixo entraram na etapa do admin do Django (spec de
    # 06/09/2026). O comentario logo acima desta lista dizia que eles foram
    # excluidos "por nao ter uso aqui" — estava certo ate' o admin existir, e
    # agora eles TEM consumidor. `admin` puxa os outros quatro: ele nao sobe
    # sem auth (usuario e permissao), contenttypes (o alvo generico das
    # permissoes), sessions (o login) e messages (o "salvo com sucesso").
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "tenant",
    # A superficie HTTP versionada (fatia 1). Sem model proprio: os models
    # managed=False continuam em `tenant`. Ver app/apps.py.
    "app",
]
```

Atualize também o comentário acima da lista (o que diz "Sem contrib.admin, contrib.auth, contrib.contenttypes nem sessions"): ele descreve um estado que deixou de valer. Substitua por uma frase dizendo que os quatro entraram com o admin, e que `django_celery_beat` continua fora pelo motivo original (o beat usa o agendador de arquivo).

- [ ] **Step 2: Acrescentar os middleware do Django**

`MIDDLEWARE` (linha 85) passa a ser:

```python
MIDDLEWARE = [
    # Primeiro de todos: ele responde o preflight OPTIONS e sai, sem passar
    # pela resolucao de tenant. Preflight nao carrega Host de barbearia.
    "corsheaders.middleware.CorsMiddleware",
    # Antes de tudo que le sessao do Django: `request.session` so existe
    # depois dele. O admin do Django e o unico consumidor.
    "django.contrib.sessions.middleware.SessionMiddleware",
    # Antes do TenantMiddleware de proposito: um POST sem o header e recusado
    # sem nem consultar o banco. Recusa barata vem antes de trabalho caro.
    "tenant.middleware.ClienteMiddleware",
    "tenant.middleware.TenantMiddleware",
    "tenant.middleware.BarreiraAdminMiddleware",
    # CSRF entrou com o admin do Django, e e' a protecao CERTA para ele: o
    # formulario e' servido pela MESMA origem que o recebe. A API nao muda de
    # comportamento — `APIView.as_view()` do DRF ja embrulha toda view em
    # `csrf_exempt`, e sem classe de autenticacao configurada nada reativa a
    # checagem por dentro. Os 475 testes sao a prova disso, nao este comentario.
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    # Por ultimo: os dois crivos acima recusam por HOST (admin ou nao), e este
    # recusa por CAMINHO. Deixando-o no fim, um pedido que ja morreu por host
    # nao passa por aqui — os prefixos dos dois nao se cruzam hoje, entao a
    # ordem entre eles nao muda resposta nenhuma, mas manter "host primeiro,
    # caminho depois" e o que faz a lista continuar previsivel quando alguem
    # acrescentar o proximo prefixo.
    "tenant.middleware.CrivoPainelMiddleware",
]
```

- [ ] **Step 3: Acrescentar o bloco `TEMPLATES`**

Hoje ele **não existe**, e o admin não sobe sem ele. Acrescente depois de `MIDDLEWARE`:

```python
# O admin do Django e' o unico consumidor de template neste projeto: a API
# devolve JSON e o front e' outro processo. Por isso `DIRS` fica vazia — nao
# ha template nosso, so' os que vem dentro dos apps contrib.
#
# Os quatro context processors nao sao decoracao: o admin quebra sem `request`
# (ele monta URL a partir dele), sem `auth` (o "logado como fulano" e o menu de
# permissao) e sem `messages` (o "salvo com sucesso" depois de gravar).
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
```

- [ ] **Step 4: Rotear o admin**

`backend/backend/urls.py`:

```python
from django.contrib import admin
from django.urls import include, path

from tenant import views

urlpatterns = [
    path("api/saude", views.saude, name="saude"),
    # A superficie da travessia. Prefixo `api/` sem barra depois de
    # `barbeiros`: o front monta `origem + '/api' + '/barbeiros'`, e casar ao
    # pe da letra evita o 301 que quebraria o pedido credenciado no navegador
    # (ver app/api/v1/router.py).
    path("api/", include("app.api.v1.router")),
    # Sob `/admin/` de PROPOSITO: o `BarreiraAdminMiddleware` ja devolve 404
    # para tudo que comeca com `/admin` fora do host do admin, entao esta rota
    # nasce protegida sem regra nova. Montar num prefixo proprio exigiria uma
    # barreira nova — mais uma coisa para alguem esquecer.
    path("admin/django/", admin.site.urls),
]
```

- [ ] **Step 5: Rodar a suíte inteira — este é o passo que a task existe para fazer**

Run: `docker compose run --rm api pytest -q`
Expected: **475 passed**.

Se algum POST da API passar a dar 403, **não** espalhe `csrf_exempt`: a saída é tirar `CsrfViewMiddleware` da lista global e aplicá-lo só no caminho do admin (via `django.utils.decorators.decorator_from_middleware` na rota, ou movendo a checagem para o middleware da Task 2). Reporte antes de escolher.

- [ ] **Step 6: Conferir que as tabelas novas nasceram**

Run: `docker compose run --rm api python manage.py migrate --noinput --database=owner`
Expected: aplica as migrations de `auth`, `contenttypes`, `sessions`, `admin`.

Não é preciso `GRANT` nenhum: `docker/init-db.sql` tem `ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner … GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_app`, e as migrations rodam como `brutus_owner`. Confirme lendo o output — se aparecer erro de permissão, pare e reporte.

- [ ] **Step 7: Commit**

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-back"
git add backend/backend/settings.py backend/backend/urls.py
git commit -m "admin: o Django admin sobe, sob /admin/django/

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: A porta e o escopo de tenant

**Files:**
- Modify: `backend/tenant/middleware.py`
- Modify: `backend/backend/settings.py` (uma linha em `MIDDLEWARE`)
- Test: `tests/test_admin_django.py` (criar)

**Interfaces:**
- Consumes: `app.services.admin_sessao.COOKIE_SESSAO_ADMIN` e `ler(token: str | None) -> bool`; `request.session` (posto pelo `SessionMiddleware` da Task 1).
- Produces: `tenant.middleware.AdminDjangoMiddleware` com `PREFIXO = "/admin/django"` e `CHAVE_SESSAO = "barbearia_escolhida"`. A Task 3 grava nessa chave; a Task 4 depende do escopo que este middleware aplica.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/test_admin_django.py`:

```python
import uuid

import pytest

from app.services.admin_sessao import COOKIE_SESSAO_ADMIN, emitir

pytestmark = pytest.mark.django_db(
    databases=["default", "owner", "admin"], transaction=True
)

HOST_ADMIN = "admin.localhost"
HOST_BARBEARIA = "brutus.localhost"


def _logar_admin(client):
    """O cookie da plataforma — o mesmo que o painel custom emite."""
    client.cookies[COOKIE_SESSAO_ADMIN] = emitir()


def test_de_host_de_barbearia_o_admin_nao_existe(client, cenario):
    """404 e nao 403, e nao a tela de login: 403 confirmaria que o recurso
    existe. Quem recusa aqui e' o `BarreiraAdminMiddleware`, por POSICAO —
    esta rota nao precisou pedir protecao nenhuma."""
    r = client.get("/admin/django/", headers={"host": HOST_BARBEARIA})
    assert r.status_code == 404


def test_sem_o_cookie_da_plataforma_o_admin_nao_existe(client, cenario):
    """Mesmo do host certo. E' esta linha que faz o admin ser SO' do dono da
    plataforma: barbeiro nenhum tem este cookie, e nao tem como obter um."""
    r = client.get("/admin/django/", headers={"host": HOST_ADMIN})
    assert r.status_code == 404


def test_com_o_cookie_o_admin_responde(client, cenario):
    """Responde a tela de login do Django — o cookie abre a porta, nao a
    sessao."""
    _logar_admin(client)
    r = client.get("/admin/django/", headers={"host": HOST_ADMIN})
    assert r.status_code in (200, 302)


def test_o_middleware_nao_toca_no_resto_do_sistema(client, cenario):
    """Fora do prefixo ele sai na primeira linha. Sem esta garantia, toda
    requisicao da API passaria a rodar dentro de uma transacao aberta pelo
    middleware — mudanca de comportamento que ninguem pediu."""
    r = client.get("/api/saude")
    assert r.status_code == 200


def test_post_do_admin_nao_leva_403_por_falta_de_header(client, cenario):
    """O admin do Django faz POST de formulario HTML, sem `X-Brutus-Cliente`.
    Sem a isencao do `ClienteMiddleware`, o LOGIN dele ja levaria 403 e o admin
    seria inutil — e o sintoma nao mencionaria header nenhum.

    O 404 aqui e' da porta (sem cookie), e nao o 403 do ClienteMiddleware: e'
    exatamente essa distincao que o teste afirma. Sem a isencao, o
    ClienteMiddleware responderia PRIMEIRO, porque esta antes na lista.
    """
    r = client.post(
        "/admin/django/login/", {"username": "x", "password": "y"},
        headers={"host": HOST_ADMIN},
    )
    assert r.status_code == 404
    assert r.status_code != 403
```

- [ ] **Step 2: Rodar e ver falhar pelo motivo certo**

Run: `docker compose run --rm api pytest -q tests/test_admin_django.py`

Expected, e leia com atenção porque nem todos falham:

- `test_sem_o_cookie_da_plataforma_o_admin_nao_existe` **FALHA** — devolve 200/302, porque a porta ainda não existe. É o RED principal.
- `test_post_do_admin_nao_leva_403_por_falta_de_header` **FALHA com 403** — o `ClienteMiddleware` ainda não isenta o prefixo. É o segundo RED, e o 403 na saída é a prova de que a isenção é necessária.
- `test_de_host_de_barbearia_o_admin_nao_existe` e `test_o_middleware_nao_toca_no_resto_do_sistema` **passam desde já**. Não são RED: são regressão sobre garantias que já existem e que você não pode quebrar.
- `test_com_o_cookie_o_admin_responde` passa (o admin da Task 1 responde a qualquer um) — e continua passando depois, agora por mérito da porta.

- [ ] **Step 3: O `set_config` vai para `rls.py`, e não para o middleware**

`tests/test_varredura.py` reprova **qualquer** `.execute(...)` em
`backend/tenant/` fora de `rls.py` — a regra é "o único `execute()` legítimo
fora do `com_barbearia` é o próprio wrapper". Um `cur.execute("SELECT
set_config…")` escrito dentro do middleware quebraria a varredura, e a resposta
certa não é isentar o arquivo: é pôr o wrapper onde os outros dois já moram.

No fim de `backend/tenant/rls.py`:

```python
@contextmanager
def com_barbearia_por_requisicao(barbearia_id):
    """Irma das duas acima, para o admin do Django (spec de 06/09/2026).

    Mesma conexao que `com_barbearia` (`default`, papel `brutus_app` — menor
    privilegio: ele nao escreve em `tenant_barbearia` e nao precisa). O que
    muda e' a DURABILIDADE.

    `durable=True` existe nas outras duas para estourar alto quando alguem
    aninha wrapper de tenant — dentro de um bloco durable, um segundo `atomic`
    viraria SAVEPOINT, e sair dele NAO devolveria o tenant de fora. Aqui a
    transacao envolve a REQUISICAO inteira do admin, que passa por codigo do
    Django (formulario, permissao, log de acao) capaz de abrir os seus
    proprios blocos. Exigir durabilidade aqui transformaria uso normal do
    admin em RuntimeError.

    O que NAO muda, e e' o que importa: `is_local=true` no `set_config`. A
    variavel morre com a transacao, e a conexao volta para a pool limpa.
    """
    if not barbearia_id:
        raise ValueError("com_barbearia_por_requisicao precisa de um barbearia_id")

    with transaction.atomic():
        with connection.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.barbearia_id', %s, true)",
                [str(barbearia_id)],
            )
        yield
```

- [ ] **Step 4: Escrever o middleware**

No fim de `backend/tenant/middleware.py`:

```python
class AdminDjangoMiddleware:
    """A porta e o escopo do admin do Django (spec de 06/09/2026).

    Faz duas coisas, e as duas so' sob `/admin/django`:

    1. **A porta.** Exige o cookie da plataforma. O `BarreiraAdminMiddleware`
       ja garante que so' se chega aqui do host do admin; esta camada e' o que
       torna o admin do Django SEU, e nao de quem alcancar aquele host. 404 e
       nao 403 pelo mesmo motivo de sempre: 403 confirmaria que existe.

    2. **O escopo.** Define `app.barbearia_id` com a barbearia escolhida na
       sessao. Sem isso, TODA listagem de model de tenant viria vazia — a
       politica de RLS compara `barbearia_id` com `current_setting(...)`, que
       sem valor devolve NULL, e `x = NULL` nao e' verdadeiro.

    O ponto que faz este desenho valer a pena: quem filtra e' o POSTGRES, nao
    um `get_queryset().filter(...)`. Um ModelAdmin que alguem registre amanha
    sem pensar em tenant ja nasce enxergando so' a barbearia escolhida.

    `atomic()` SEM `durable=True`, ao contrario de `com_barbearia`: aquele usa
    durabilidade para estourar alto quando alguem aninha wrapper de tenant, e
    aqui a transacao envolve a REQUISICAO inteira do admin, que pode passar por
    caminhos que abram os seus proprios blocos.

    Sem barbearia escolhida a variavel nao e' definida, e o admin mostra listas
    vazias. E' o comportamento certo e legivel: "voce nao disse de quem esta
    falando".
    """

    PREFIXO = "/admin/django"
    CHAVE_SESSAO = "barbearia_escolhida"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(self.PREFIXO):
            return self.get_response(request)

        if not ler_sessao_admin(request.COOKIES.get(COOKIE_SESSAO_ADMIN)):
            # Http404 SEM texto, igual a BarreiraAdminMiddleware: sob DEBUG o
            # Django renderiza a mensagem da excecao na pagina de erro, e
            # explicar a barreira em portugues seria pior que o 403 recusado.
            raise Http404

        escolhida = request.session.get(self.CHAVE_SESSAO)
        if not escolhida:
            return self.get_response(request)

        with com_barbearia_por_requisicao(escolhida):
            return self.get_response(request)
```

E os imports no topo do arquivo passam a incluir:

```python
from .rls import com_barbearia_por_requisicao

from app.services.admin_sessao import COOKIE_SESSAO_ADMIN
from app.services.admin_sessao import ler as ler_sessao_admin
```

> **Atenção:** `tenant` importando de `app` inverte a direção habitual das dependências neste projeto. É deliberado e vale registrar em comentário: a sessão do admin é um serviço de aplicação, e o middleware é quem a consome. Se o import circular aparecer (`app` importa `tenant.models`), mova o import para dentro do `__call__`. Rode a suíte para descobrir — não presuma.

- [ ] **Step 5: Registrar o middleware**

Em `backend/backend/settings.py`, `MIDDLEWARE`, **depois** de `MessageMiddleware` e **antes** de `CrivoPainelMiddleware`:

```python
    # Depois de Session e Auth: ele le `request.session`, que so' existe
    # depois do SessionMiddleware.
    "tenant.middleware.AdminDjangoMiddleware",
```

- [ ] **Step 6: Isentar o admin do `ClienteMiddleware`**

O admin do Django faz POST de formulário HTML, sem `X-Brutus-Cliente` — o login dele levaria 403. Em `ClienteMiddleware.__call__`:

```python
    def __call__(self, request):
        # O admin do Django e' isento: o formulario dele e' servido pela MESMA
        # origem que o recebe, e ali quem protege e' o token CSRF do Django
        # (ligado na etapa do admin), nao este header. O header existe para o
        # arranjo da API — cross-origin e same-site ao mesmo tempo, onde o
        # SameSite=Lax nao protege nada e so' o preflight obrigatorio protege.
        if request.path.startswith(AdminDjangoMiddleware.PREFIXO):
            return self.get_response(request)
        if request.method in self.VERBOS_QUE_ESCREVEM and self.HEADER not in request.META:
            return JsonResponse({"erro": "pedido sem cliente"}, status=403)
        return self.get_response(request)
```

`AdminDjangoMiddleware` é definido depois de `ClienteMiddleware` no arquivo; referenciá-lo dentro do método (e não no corpo da classe) funciona porque a resolução acontece em tempo de chamada. Se preferir, extraia o literal `"/admin/django"` para uma constante de módulo no topo — decida você, e comente a escolha.

- [ ] **Step 7: Rodar e ver passar**

Run: `docker compose run --rm api pytest -q tests/test_admin_django.py`
Expected: 5 passed.

**A varredura, explicitamente** — é ela que este passo mais arrisca:
Run: `docker compose run --rm api pytest -q tests/test_varredura.py`
Expected: PASS. Se ela acusar `middleware.py:NNN .execute(...)`, o `set_config`
ficou no middleware em vez de ir para `rls.py` — volte ao Step 3.

Run: `docker compose run --rm api pytest -q`
Expected: **480 passed** (475 + os 5 novos).

- [ ] **Step 8: Commit**

```bash
git add backend/tenant/rls.py backend/tenant/middleware.py backend/backend/settings.py tests/test_admin_django.py
git commit -m "admin: a porta do Django admin, e o escopo de uma barbearia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: O seletor de barbearia

**Files:**
- Create: `backend/app/views_admin_django.py`
- Modify: `backend/backend/urls.py`
- Test: `tests/test_admin_django.py` (acrescentar)

**Interfaces:**
- Consumes: `AdminDjangoMiddleware.CHAVE_SESSAO` (Task 2).
- Produces: `GET /admin/django/escolher-barbearia` lista as barbearias; `POST` com `barbearia_id` grava na sessão e redireciona para `/admin/django/`.

### A ordem das rotas decide quem atende

`admin.site.urls` engole qualquer caminho sob o seu prefixo. A rota do seletor precisa vir **antes** dele em `urlpatterns` — resolução de URL no Django é por ordem.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/test_admin_django.py`:

```python
def _barbearia_id(cenario, slug="brutus"):
    return str(cenario[slug].id)


def test_o_seletor_lista_as_barbearias(client, cenario):
    _logar_admin(client)
    r = client.get("/admin/django/escolher-barbearia", headers={"host": HOST_ADMIN})
    assert r.status_code == 200
    corpo = r.content.decode()
    assert "brutus" in corpo and "dontony" in corpo


def test_escolher_grava_na_sessao(client, cenario):
    _logar_admin(client)
    alvo = _barbearia_id(cenario)
    r = client.post(
        "/admin/django/escolher-barbearia",
        {"barbearia_id": alvo},
        headers={"host": HOST_ADMIN},
    )
    assert r.status_code == 302
    assert client.session["barbearia_escolhida"] == alvo


def test_o_seletor_tambem_esta_atras_da_porta(client, cenario):
    """Ele esta sob o mesmo prefixo, entao herda a barreira sem pedir. Sem
    este teste, uma rota nova sob /admin/django podia nascer aberta e ninguem
    perceberia."""
    r = client.get("/admin/django/escolher-barbearia", headers={"host": HOST_ADMIN})
    assert r.status_code == 404


def test_id_que_nao_existe_nao_e_gravado(client, cenario):
    """Gravar um id qualquer deixaria o admin num estado em que toda lista vem
    vazia e nada explica por que."""
    _logar_admin(client)
    r = client.post(
        "/admin/django/escolher-barbearia",
        {"barbearia_id": str(uuid.uuid4())},
        headers={"host": HOST_ADMIN},
    )
    assert r.status_code == 400
    assert "barbearia_escolhida" not in client.session
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm api pytest -q tests/test_admin_django.py`
Expected: os 4 novos falham com 404 (a rota não existe). `test_o_seletor_tambem_esta_atras_da_porta` passa desde já — o 404 dele vem da porta da Task 2, e é isso que ele afirma.

- [ ] **Step 3: Escrever a view**

Crie `backend/app/views_admin_django.py`:

```python
"""O seletor de barbearia do admin do Django.

Fica fora de `api/v1/` de proposito: aquilo e' a superficie JSON versionada que
o front consome, e isto devolve HTML para uma pessoa. Misturar os dois faria a
proxima pessoa procurar esta rota no `router.py`, onde ela nao esta.

O HTML e' escrito na mao, sem template: e' uma lista de botoes usada por UMA
pessoa, e um arquivo de template para isso seria mais lugar para procurar do
que economia de codigo.
"""

from django.db import connections
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseRedirect
from django.utils.html import escape
from django.views.decorators.http import require_http_methods

from tenant.middleware import AdminDjangoMiddleware
from tenant.models import Barbearia

# A conexao "admin" (`brutus_admin`) e' quem enxerga `tenant_barbearia`:
# `brutus_app` tem REVOKE de escrita ali, e a leitura passa pelos dois — mas
# usar a mesma conexao do painel custom mantem UM lugar so' que fala com a
# tabela de tenant.
_CONEXAO = "admin"


@require_http_methods(["GET", "POST"])
def escolher_barbearia(request):
    if request.method == "POST":
        pedido = request.POST.get("barbearia_id") or ""
        # Confere que EXISTE antes de gravar: um id qualquer deixaria o admin
        # num estado em que toda lista vem vazia e nada explica por que.
        if not Barbearia.objects.using(_CONEXAO).filter(id=pedido).exists():
            return HttpResponseBadRequest("barbearia inexistente")
        request.session[AdminDjangoMiddleware.CHAVE_SESSAO] = pedido
        return HttpResponseRedirect("/admin/django/")

    atual = request.session.get(AdminDjangoMiddleware.CHAVE_SESSAO)
    linhas = []
    for b in Barbearia.objects.using(_CONEXAO).order_by("slug"):
        marca = " ← atual" if str(b.id) == str(atual) else ""
        linhas.append(
            f'<li><button name="barbearia_id" value="{escape(str(b.id))}">'
            f"{escape(b.slug)}</button> {escape(b.nome)}{marca}</li>"
        )
    return HttpResponse(
        "<h1>De qual barbearia?</h1>"
        "<p>O admin mostra uma barbearia por vez — é o isolamento do banco, "
        "não um filtro da tela.</p>"
        f'<form method="post"><ul>{"".join(linhas)}</ul></form>',
        content_type="text/html; charset=utf-8",
    )
```

- [ ] **Step 4: Rotear, ANTES do admin**

Em `backend/backend/urls.py`, acrescente o import e a rota:

```python
from app.views_admin_django import escolher_barbearia
```

E em `urlpatterns`, **antes** de `path("admin/django/", admin.site.urls)`:

```python
    # ANTES do admin.site.urls, e a ordem e' o mecanismo: o admin engole
    # qualquer caminho sob o proprio prefixo, entao uma rota nossa registrada
    # depois dele nunca seria alcancada.
    path("admin/django/escolher-barbearia", escolher_barbearia, name="escolher-barbearia"),
```

- [ ] **Step 5: Rodar e ver passar**

Run: `docker compose run --rm api pytest -q tests/test_admin_django.py`
Expected: 9 passed (os 5 da Task 2 + os 4 desta).

Run: `docker compose run --rm api pytest -q`
Expected: **484 passed**.

- [ ] **Step 6: Commit**

```bash
git add backend/app/views_admin_django.py backend/backend/urls.py tests/test_admin_django.py
git commit -m "admin: o seletor de barbearia do Django admin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Os ModelAdmin, e o teste que importa

**Files:**
- Create: `backend/app/admin.py`
- Test: `tests/test_admin_django.py` (acrescentar)

**Interfaces:**
- Consumes: o escopo que `AdminDjangoMiddleware` aplica (Task 2); o seletor (Task 3).
- Produces: `/admin/django/tenant/<model>/` para `barbeiro`, `servico`, `barbeiroservico`, `horariotrabalho`, `bloqueio`, `cliente`, `agendamento`, e `barbearia` somente-leitura.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/test_admin_django.py`. **Note o `import` novo no topo do arquivo** — ponha-o junto dos outros, não no meio:

```python
from django.contrib.auth.models import User
```

E os testes:

```python
def _logar_django(client):
    """Superusuario com nome unico por teste: o `limpar_banco` do conftest
    trunca so' as tabelas de tenant, entao `auth_user` sobrevive entre casos e
    um nome fixo colidiria na segunda vez."""
    nome = f"admin-{uuid.uuid4().hex[:8]}"
    User.objects.create_superuser(username=nome, email="", password="senha-de-teste")
    client.login(username=nome, password="senha-de-teste")


def _cliente(barbearia_id, nome):
    from tenant.models import Cliente

    return Cliente.objects.using("owner").create(
        id=str(uuid.uuid4()), barbearia_id=barbearia_id, nome=nome,
        whatsapp=f"1198{uuid.uuid4().int % 10**7:07d}",
    )


def test_o_admin_nao_ve_dado_de_outra_barbearia(client, cenario):
    """O TESTE DESTA ETAPA. Se ele nao existir, o resto nao vale nada: o
    admin do Django e' uma tela que lista qualquer tabela, e a unica coisa
    entre ela e o dado de outra barbearia e' a politica do Postgres."""
    b, d = cenario["brutus"], cenario["dontony"]
    _cliente(b.id, "Cliente do Brutus")
    _cliente(d.id, "Cliente do Dom Tony")

    _logar_admin(client)
    _logar_django(client)
    client.post(
        "/admin/django/escolher-barbearia",
        {"barbearia_id": str(b.id)},
        headers={"host": HOST_ADMIN},
    )

    r = client.get("/admin/django/tenant/cliente/", headers={"host": HOST_ADMIN})
    assert r.status_code == 200
    corpo = r.content.decode()
    assert "Cliente do Brutus" in corpo
    assert "Cliente do Dom Tony" not in corpo


def test_sem_escolher_barbearia_o_admin_nao_mostra_dado(client, cenario):
    """Lista vazia e' o comportamento CERTO, nao um defeito: sem barbearia
    escolhida o middleware nao define a variavel, e a politica de RLS nao casa
    com linha nenhuma. Na primeira vez que se abre, parece quebrado — e nao
    esta."""
    _cliente(cenario["brutus"].id, "Cliente do Brutus")
    _logar_admin(client)
    _logar_django(client)

    r = client.get("/admin/django/tenant/cliente/", headers={"host": HOST_ADMIN})
    assert r.status_code == 200
    assert "Cliente do Brutus" not in r.content.decode()


def test_barbearia_e_somente_leitura(client, cenario):
    """Criar barbearia continua no painel custom, onde a transacao cria
    barbearia + dono + convite junto. Pelo admin do Django sairia uma
    barbearia ORFA, em que ninguem consegue entrar."""
    _logar_admin(client)
    _logar_django(client)
    r = client.get("/admin/django/tenant/barbearia/add/", headers={"host": HOST_ADMIN})
    assert r.status_code == 403
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm api pytest -q tests/test_admin_django.py`
Expected: os 3 novos falham com 404 — nenhum model está registrado, então `/admin/django/tenant/cliente/` não existe.

- [ ] **Step 3: Escrever os ModelAdmin**

Crie `backend/app/admin.py`:

```python
"""Os ModelAdmin do admin do Django (spec de 06/09/2026).

Mora em `app/` e nao em `tenant/`: `tenant/` e' o pacote dos models e do RLS, e
`app/` e' a superficie. A varredura de AST (tests/test_varredura.py) passou a
cobrir ESTE arquivo na mesma etapa — nao porque `app/` seja isento, mas porque
ele nao era coberto e essa lacuna cairia justamente na superficie nova.

O ESCOPO NAO ESTA AQUI. Nenhum `get_queryset` filtra por barbearia, e isso e'
deliberado: quem filtra e' a politica de RLS do Postgres, com a variavel que o
`AdminDjangoMiddleware` define por requisicao. A consequencia boa e' que um
ModelAdmin acrescentado amanha, por alguem que nunca ouviu falar de tenant, ja
nasce enxergando so' a barbearia escolhida.
"""

from django.contrib import admin

from tenant.models import (
    Agendamento,
    Barbearia,
    Barbeiro,
    BarbeiroServico,
    Bloqueio,
    Cliente,
    HorarioTrabalho,
    Servico,
)


class SemApagar(admin.ModelAdmin):
    """Apagar fica DESLIGADO por padrao.

    O admin do Django poe "excluir" a um clique, sem confirmacao de negocio.
    Apagar um cliente com historico, ou um agendamento que ja aconteceu, e'
    destrutivo e silencioso — e este admin existe para OLHAR e corrigir, nao
    para limpar. Ligar caso a caso, quando houver razao escrita.
    """

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Barbearia)
class BarbeariaAdmin(admin.ModelAdmin):
    """Somente leitura, e nao por excesso de zelo.

    Criar barbearia pelo painel custom e' UMA transacao que cria a barbearia,
    define `app.barbearia_id` dentro dela e cria o barbeiro DONO com token de
    convite. O "adicionar" do Django faria um INSERT numa tabela e mais nada:
    o resultado seria uma barbearia ORFA, sem dono e sem convite, em que
    ninguem consegue entrar.

    Ela aparece aqui porque e' preciso VE-LA para ter contexto do que se esta
    olhando.
    """

    list_display = ("slug", "nome", "ativo", "criado_em")
    search_fields = ("slug", "nome")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Barbeiro)
class BarbeiroAdmin(SemApagar):
    list_display = ("nome", "whatsapp", "papel", "ativo", "ordem")
    list_filter = ("papel", "ativo")
    search_fields = ("nome", "whatsapp")
    # Nenhum destes sai em resposta nenhuma da API (spec 9.1), e aqui eles sao
    # so' leitura: mexer em hash de senha ou em token de convite pela mao
    # arrisca deixar o barbeiro fora da propria conta sem nada explicar.
    readonly_fields = ("senha_hash", "convite_token_hash", "token_version")


@admin.register(Cliente)
class ClienteAdmin(SemApagar):
    list_display = ("nome", "whatsapp", "criado_em")
    search_fields = ("nome", "whatsapp")


@admin.register(Agendamento)
class AgendamentoAdmin(SemApagar):
    list_display = ("inicio", "fim", "servico_nome", "status", "barbeiro", "cliente")
    list_filter = ("status",)
    # `codigo` e' o token de URL publica: trocar a mao invalidaria o link que o
    # cliente ja tem em maos.
    readonly_fields = ("codigo",)


@admin.register(Servico)
class ServicoAdmin(SemApagar):
    list_display = ("nome", "duracao_minima_min", "duracao_sugerida_min", "ativo", "ordem")
    list_filter = ("ativo",)


@admin.register(BarbeiroServico)
class BarbeiroServicoAdmin(SemApagar):
    list_display = ("barbeiro", "servico", "duracao_min", "preco_centavos", "ativo")
    list_filter = ("ativo",)


@admin.register(HorarioTrabalho)
class HorarioTrabalhoAdmin(SemApagar):
    list_display = ("barbeiro", "dia_semana", "minutos_inicio", "minutos_fim")


@admin.register(Bloqueio)
class BloqueioAdmin(SemApagar):
    list_display = ("barbeiro", "motivo", "repete_semanalmente", "inicio", "fim")
    list_filter = ("motivo", "repete_semanalmente")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `docker compose run --rm api pytest -q tests/test_admin_django.py`
Expected: 12 passed (9 + os 3 desta).

Run: `docker compose run --rm api pytest -q`
Expected: **487 passed**.

Se `test_barbearia_e_somente_leitura` devolver 302 em vez de 403, é o Django redirecionando para o login — confira que `_logar_django` rodou. Se devolver 200, `has_add_permission` não está pegando.

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin.py tests/test_admin_django.py
git commit -m "admin: os models no Django admin, uma barbearia por vez

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: A varredura passa a cobrir a superfície nova

**Files:**
- Modify: `tests/test_varredura.py`

**Interfaces:**
- Consumes: `backend/app/admin.py` (Task 4).

### Por que isto é uma task e não uma nota de rodapé

`tests/test_varredura.py` hoje lê só `backend/tenant/`. A regra que ele defende — "toda consulta a model de tenant dentro de `com_barbearia`" — deixaria de ser testada **justamente na superfície nova**, que é uma tela capaz de listar qualquer tabela. A lacuna não é uma licença.

- [ ] **Step 1: Estender a varredura**

Em `tests/test_varredura.py`, `RAIZ` (linha 18) deixa de ser um caminho só. Troque por uma lista, e faça o teste varrer as duas:

```python
# `backend/tenant/` e' o pacote dos models e do RLS. `backend/app/admin.py`
# entrou na etapa do admin do Django: ele nao estava coberto, e deixar de fora
# a UNICA tela capaz de listar qualquer tabela seria a regra parando de valer
# exatamente onde mais importa.
RAIZ = pathlib.Path(__file__).resolve().parent.parent / "backend"
ALVOS = [RAIZ / "tenant", RAIZ / "app" / "admin.py"]
```

E o laço dentro de `test_nenhuma_consulta_de_tenant_fora_do_wrapper` (hoje
`for arquivo in RAIZ.rglob("*.py"):`) passa a ser:

```python
    fora = []
    for alvo in ALVOS:
        # `ALVOS` mistura diretorio e arquivo solto de proposito: varrer
        # `app/` inteiro pegaria services e views que USAM os models por
        # fora do wrapper legitimamente (eles chamam `com_barbearia` de
        # dentro das funcoes, e a varredura nao segue chamada). O admin e'
        # o caso em que o arquivo declara a superficie e nao a consulta.
        arquivos = alvo.rglob("*.py") if alvo.is_dir() else [alvo]
        for arquivo in arquivos:
            if arquivo.name in ISENTOS:
                continue
            fora.extend(_consultas_de_tenant(arquivo))
            fora.extend(_sql_cru(arquivo))
```

Atualize também a docstring do teste: onde ela diz "Varre backend/tenant/
inteiro, subpastas inclusive (rglob, nao glob)", acrescente que
`backend/app/admin.py` entrou na etapa do admin do Django. E o limite
documentado que diz "qualquer uso de um model de tenant fora de
backend/tenant/ — a varredura nunca olha para outro app Django" deixou de ser
verdade ao pé da letra: passa a ser "fora dos ALVOS".

- [ ] **Step 2: Rodar**

Run: `docker compose run --rm api pytest -q tests/test_varredura.py`
Expected: PASS. `app/admin.py` não faz `Model.objects` — ele só declara `ModelAdmin`, e quem consulta é o Django por dentro.

Se falhar apontando `app/admin.py`, **não** acrescente uma isenção sem pensar: leia a linha acusada. Se for de fato uma consulta sua fora do wrapper, é bug seu na Task 4.

- [ ] **Step 3: Rodar a suíte inteira**

Run: `docker compose run --rm api pytest -q`
Expected: **487 passed** — a Task 5 não acrescenta teste, ela alarga o alcance de um que já existe.

- [ ] **Step 4: Commit**

```bash
git add tests/test_varredura.py
git commit -m "teste: a varredura passa a cobrir o admin do Django

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `docker compose run --rm api pytest -q` — **487 passando**.
- [ ] `git log --oneline origin/master..HEAD` mostra 5 commits.
- [ ] `git status --porcelain` vazio.
- [ ] **Manual, e só o dono da plataforma pode fazer:** subir o compose, criar o superusuário (`docker compose run --rm api python manage.py createsuperuser`), abrir `http://admin.localhost:8000/admin/django/`, escolher uma barbearia e conferir que as listas mostram **aquela** barbearia. Depois abrir `http://brutus.localhost:8000/admin/django/` e confirmar o 404.

## O que este plano NÃO faz

- Não substitui o painel custom. Criar barbearia, convite do dono, trava por IP e as contagens continuam lá.
- Não serve estático de produção para o admin. O `CMD` do Dockerfile é `runserver`, que serve sozinho. No dia do gunicorn, é problema do deploy inteiro.
- Não cria backend de autenticação custom. São dois logins de propósito: o cookie da plataforma abre a porta, o login do Django entra.
