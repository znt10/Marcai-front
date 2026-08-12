# Fatia 0 — A fronteira: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um Django que sobe sozinho em `brutus.localhost:8000`, resolve a barbearia pelo `Host`, escopa o RLS e devolve cookie que o front em `:3000` recebe de volta — sem que nenhuma das 34 rotas tenha atravessado.

**Architecture:** Dois repositórios (`back/` Django, `front/` Next) com composes próprios ligados por uma rede docker externa `brutus`, dividindo o mesmo Postgres. O Prisma continua dono do DDL; o Django lê com `managed = False`. O interruptor da travessia é uma lista vazia em `client.ts`.

**Tech Stack:** Django 6.0, DRF, django-cors-headers, Celery + django-celery-beat, psycopg 3, pytest + pytest-django, Postgres 16, Docker Compose. Next 16 do lado do front.

**Spec:** `docs/superpowers/specs/2026-08-11-separar-front-back-design.md`

**Referência estrutural:** `C:\Users\jc970\Desktop\Unistock\Unistock_Back` — o layout, o `Dockerfile`, o `entrypoint.sh` e a escolha de bibliotecas saem de lá (spec §14). O que **não** sai de lá está na tabela das Global Constraints abaixo.

## Global Constraints

- **PostgreSQL, nunca MySQL.** O `Unistock_Back` usa `mysqlclient`; aqui é `psycopg`. Todo o isolamento entre barbearias é PostgreSQL — `set_config`, `FORCE ROW LEVEL SECURITY`, políticas por papel, e a restrição `23P01`. Nenhum dos quatro existe em MySQL.
- **Nada de `djangorestframework_simplejwt`.** Ele é Bearer token em header, que é o desenho proibido pela restrição do spec §3.
- **DRF entra**, decidido pela referência (spec §14). O canário usa `@api_view`.
- **`INSTALLED_APPS` mínimo: sem `django.contrib.admin`, sem `django.contrib.auth`, sem `django.contrib.sessions`, e sem `django_celery_beat`.** O Django não pode criar tabela num banco de que o Prisma é dono (spec §8). O `beat` roda com o agendador **de arquivo**, que é o padrão do Celery e não toca banco nenhum; o `django-celery-beat` (agenda em tabela) é da fatia 7, quando houver agenda que valha a pena editar sem deploy.
- **O `worker` e o `beat` não sobem decorativos.** Eles entram com uma tarefa `ping` provada ponta a ponta (Task 12). Contêiner que sobe, loga limpo e não executa nada é o modo de falha que este produto já pagou caro — o `agendador` existia e nunca rodava, e a tela prometia lembrete que ninguém mandava.
- **Todo model nasce `managed = False`, com `db_table` e `db_column` explícitos em todo campo.** `"Barbearia"`, `"barbeariaId"` — nomenclatura do Prisma (spec §8).
- **Id é `str`, nunca `uuid.UUID`.** A coluna é `TEXT`: o Prisma escreve `id String @id @default(uuid())`, sem `@db.Uuid` — o *valor* é um uuid, a coluna não é. O psycopg declara parâmetro `UUID` como tipo `uuid`, e `text = uuid` não resolve em comparação (o cast só vale em atribuição). Por isso `INSERT` passa e `filter()` quebra, longe da causa. Todo id que entra numa query vai como `str(uuid.uuid4())`.
- **O Django nunca roda DDL no banco `brutus` nem no `brutus_test`.** Quem cria e altera tabela é `prisma migrate`, do lado do front.
- **A sessão nunca sai do cookie `httpOnly`.** Nada de `localStorage` ou `sessionStorage`, em fatia nenhuma (spec §3, restrição).
- **`USE_X_FORWARDED_HOST = False`** em desenvolvimento. O tenant sai do `Host` real (spec §5).
- **Nomes em português**, como todo o resto do projeto. Comentário explica **por que**, não o que — é a convenção deste repositório.
- **`DOMINIO_BASE` em dev é `localhost`.** As barbearias do seed são `brutus` e `dontony`.
- **Header anti-CSRF: `X-Brutus-Cliente: web`**, exigido em `POST`, `PATCH`, `PUT` e `DELETE` (spec §4).

---

## Estrutura de arquivos

Espelha o `Unistock_Back`: `manage.py` na raiz, `backend/backend/` para o
projeto, `backend/<app>/` para as apps, `requirements.txt` num arquivo só.

```
back/                          <- repositório novo (ja criado na Task 1)
  .gitignore
  .env.example
  docker-compose.yml           db, redis, evolution, zelador, agendador (Task 1)
                               + api, worker, beat                     (Tasks 2 e 12)
  Dockerfile
  entrypoint.sh                espera o banco, depois exec no comando
  requirements.txt
  pytest.ini
  docker/
    init-db.sql                movido de front/docker/  (Task 1)
    zelador.sh                 movido de front/docker/  (Task 1)
  docs/
    testes-a-portar.md         asserçoes que sairam do ambiente.test.ts (Task 1)
  manage.py
  backend/
    backend/
      __init__.py              carrega o app do Celery
      settings.py              DATABASES com dois aliases: default (app) e owner
      urls.py
      celery.py
      wsgi.py
      asgi.py
    tenant/
      __init__.py
      apps.py
      config.py                SUBDOMINIOS_RESERVADOS, SLUG_REGEX, TTL_CACHE_TENANT_S
      slug.py                  extrair_slug, eh_host_admin  (funcao pura)
      models.py                Barbearia, Barbeiro          (managed=False)
      middleware.py            TenantMiddleware, BarreiraAdminMiddleware, ClienteMiddleware
      rls.py                   com_barbearia()
      views.py                 saude
      tasks.py                 ping                          (Task 12)
  tests/
    conftest.py                fixtures: banco, cenario, cliente
    test_slug.py
    test_tenant.py
    test_rls.py
    test_varredura.py
    test_barreira.py
    test_cors.py
    test_saude.py
    test_celery.py             (Task 12)

front/                         <- repositório atual
  docker-compose.yml           passa a ter so o servico `app`   (Task 1)
  src/lib/api/client.ts        ganha baseDe() e MIGRADAS
  tests/client-base.test.ts    novo
```

**Por que `tenant/` e não `core/`:** tudo nesta fatia existe para responder "de quem é este pedido?". Quando a fatia 1 trouxer os outros seis models, eles entram numa app própria — `tenant` continua sendo só a fronteira.

**Por que `ClienteMiddleware` e não `CorsMiddleware`:** o CORS passa a ser configuração do `django-cors-headers` (spec §14). O middleware que sobra é só o que exige o `X-Brutus-Cliente` na escrita, e o nome passa a dizer o que ele faz.

> **Atenção ao caminho.** Todas as Tasks 3 a 10 foram escritas antes desta
> decisão e citam `back/tenant/...` e `back/brutus/...`. Leia sempre como
> **`back/backend/tenant/...`** e **`back/backend/backend/...`**. Os testes
> continuam em `back/tests/`.

---

## Task 1: Nasce o `back/`, e a infraestrutura muda de lado

**Files:**
- Create: `back/.gitignore`, `back/docker-compose.yml`, `back/.env.example`
- Move: `front/docker/init-db.sql` → `back/docker/init-db.sql`
- Move: `front/docker/zelador.sh` → `back/docker/zelador.sh`
- Modify: `front/docker-compose.yml` (remover `db`, `redis`, `evolution`, `zelador`, `agendador`; manter só `app`)
- Modify: `front/.env.example` (documentar a rede)

**Interfaces:**
- Consumes: nada.
- Produces: a rede docker `brutus`; o serviço `db` acessível como `db:5432` de dentro dela e `localhost:5433` do host; o banco `brutus` e o `brutus_test` criados por `init-db.sql`.

> **Atenção:** esta tarefa **apaga o volume `pgdata`**. Foi autorizado — não há dado que importe, e `npm run seed` reconstrói. Não faça isto sem que essa autorização continue valendo.

- [ ] **Step 1: Derrubar a stack atual e apagar o volume**

```bash
cd front
docker compose down -v
```

Esperado: os contêineres somem e o volume `front_pgdata` é removido.

- [ ] **Step 2: Criar a rede compartilhada**

```bash
docker network create brutus
docker network ls | grep brutus
```

Esperado: uma linha com `brutus` e driver `bridge`. Se já existir, o `create` falha com "already exists" e está tudo bem.

- [ ] **Step 3: Criar o repositório do back**

```bash
cd C:/Users/jc970/Desktop/barba/back
git init
mkdir docker
git mv ../front/docker/init-db.sql docker/init-db.sql 2>/dev/null || mv ../front/docker/init-db.sql docker/init-db.sql
mv ../front/docker/zelador.sh docker/zelador.sh
```

`back/.gitignore`:

```
__pycache__/
*.py[cod]
.venv/
.env
.pytest_cache/
```

- [ ] **Step 4: Escrever o `back/docker-compose.yml`**

Copie os serviços `db`, `redis`, `evolution`, `zelador` e `agendador` de `front/docker-compose.yml` **sem alterar nada dentro deles**, e acrescente o bloco de redes. O serviço `api` entra na Task 2 — ainda não existe imagem para construir.

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
    networks: [brutus]

# ... redis, evolution, zelador, agendador: copiados verbatim,
#     cada um ganhando `networks: [brutus]`

volumes:
  pgdata:
  evolution_instances:
  evolution_redis:

# `external: true` porque a rede é criada à mão e vive mais que qualquer um dos
# dois composes. Se o compose a criasse, ela morreria no `down` de quem a criou
# e o outro lado perderia o banco no meio do trabalho.
networks:
  brutus:
    external: true
```

- [ ] **Step 5: Enxugar o `front/docker-compose.yml`**

Deixe **apenas** o serviço `app`, acrescente `networks: [brutus]` nele, apague `volumes:` inteiro (o `pgdata` é do back agora) e troque o `depends_on` — o `db` não está mais neste compose, então esperar por ele é impossível daqui:

```yaml
services:
  app:
    build: { context: ., target: dev }
    command: sh -c "npx prisma generate && npx prisma migrate deploy && npm run dev"
    environment:
      # ... todas as variáveis de hoje, sem mudança
    ports: ["3000:3000"]
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    networks: [brutus]

networks:
  brutus:
    external: true
```

O `migrate deploy` no `command` cobre a corrida com o banco: se o Postgres ainda não estiver de pé ele falha e o contêiner reinicia. Acrescente `restart: unless-stopped` ao `app` para que isso se resolva sozinho.

- [ ] **Step 6: Subir os dois lados e provar que o front sobreviveu**

```bash
cd back  && docker compose up -d
cd ../front && docker compose up -d
docker compose logs app --tail 20
```

Esperado: log do Next com `Ready`. Se aparecer erro de conexão com `db`, a rede não foi anexada nos dois lados.

- [ ] **Step 7: Provar que os dois serviços que atravessam a fronteira ainda se acham**

Esta separação corta **dois vínculos por nome de serviço** que antes viviam
dentro de um compose só, e que agora dependem da rede compartilhada:

| Quem chama | Quem atende | Está em |
|---|---|---|
| `agendador` → `http://app:3000/api/cron/lembretes` | `app` | composes **diferentes** |
| `app` → `http://evolution:8080` | `evolution` | composes **diferentes** |

Nenhum dos dois muda de endereço — nome de serviço resolve por DNS da rede, e
os dois estão na `brutus`. Mas isso é hipótese até alguém olhar, e o sintoma
de estar errado é silencioso nos dois casos: o lembrete simplesmente não sai,
e o WhatsApp simplesmente não é chamado.

```bash
cd back && docker compose logs agendador --tail 5
```

Esperado: uma linha `[agendador] HH:MM:SS {...}` com resposta do app — **não**
`falhou`. E:

```bash
cd ../front && docker compose exec app sh -c "wget -qO- http://evolution:8080 || echo NAO_ACHOU"
```

Esperado: qualquer resposta da Evolution, e não `NAO_ACHOU`.

- [ ] **Step 8: Semear e rodar a suíte inteira**

```bash
cd front
npm run seed
npm test
```

Esperado: seed conclui e **os 30 arquivos de teste passam**. Esta é a única prova que importa nesta tarefa: a infraestrutura mudou de lugar e o produto não sentiu.

- [ ] **Step 9: Commit dos dois lados**

```bash
cd back
git add -A
git commit -m "Recebe a infraestrutura que era do front

O banco, o redis, a Evolution, o zelador e o agendador nao sabem quem os
chama — muda o endereco, nao eles. Vem verbatim, com o unico acrescimo
sendo a rede externa 'brutus', que existe para os dois composes dividirem
o mesmo Postgres durante a travessia."

cd ../front
git add -A
git commit -m "Entrega a infraestrutura para o back e fica so com o app

O compose daqui passa a ter um servico. O pgdata sai junto com o banco:
volume declarado nos dois lados seria dois volumes, e o segundo nasceria
vazio no primeiro 'up' do lado errado."
```

---

## Task 2: O Django que sobe

**Files:**
- Create: `back/requirements.txt`, `back/pytest.ini`, `back/Dockerfile`, `back/entrypoint.sh`, `back/manage.py`, `back/.env.example`
- Create: `back/backend/backend/{__init__,settings,urls,celery,wsgi,asgi}.py`
- Create: `back/backend/tenant/{__init__,apps}.py`, `back/backend/tenant/views.py`
- Create: `back/tests/{conftest,test_saude}.py`
- Modify: `back/docker-compose.yml` (serviço `api`)

**Interfaces:**
- Consumes: a rede `brutus` e o serviço `db` da Task 1.
- Produces: `GET /api/saude` → `200 {"ok": true}`; os aliases de banco `default` (papel `brutus_app`) e `owner` (papel `brutus_owner`); `settings.DOMINIO_BASE`; o app Celery em `backend.celery.app`, ainda sem tarefa.

**A referência é `C:\Users\jc970\Desktop\Unistock\Unistock_Back`.** Abra-o e siga o layout dele. As adaptações obrigatórias estão marcadas abaixo — cada uma tem motivo, e nenhuma é preferência de estilo.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_saude.py`:

```python
def test_saude_responde_ok(client):
    r = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
```

> Repare que a asserção é sobre **uma chave**, e não sobre o corpo inteiro. As
> Tasks 5 e 10 acrescentam chaves a esta resposta, e um `== {"ok": True}` aqui
> quebraria duas vezes por motivo nenhum.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_saude.py -v`
Expected: FAIL — `pytest: command not found` ou erro de configuração do Django. Ambos contam: nada existe ainda.

- [ ] **Step 3: As dependências**

`back/requirements.txt` — o do Unistock, **sem** o que não serve. Fixe as versões:

```
Django==6.0.3
djangorestframework==3.17.1
django-cors-headers==4.9.0
drf-spectacular==0.29.0
psycopg[binary]==3.2.*
python-decouple==3.8
gunicorn==23.0.0
celery==5.5.3
redis==6.4.0
requests==2.32.3

# desenvolvimento
pytest==8.*
pytest-django==4.*
pytest-env==1.*
```

**Três exclusões deliberadas em relação ao `Unistock_Back/requirements.txt`:**

| fora | por quê |
|---|---|
| `mysqlclient` | Este produto é PostgreSQL. `set_config`, `FORCE ROW LEVEL SECURITY`, políticas por papel e a restrição `23P01` — nenhum existe em MySQL. |
| `djangorestframework_simplejwt` | Bearer token em header é o desenho proibido pela restrição do spec §3. |
| `weasyprint` e satélites (`pydyf`, `fonttools`, `tinyhtml5`, `pyphen`, `cssselect2`, `zopfli`…) | Geração de PDF é do domínio de estoque. Não há PDF aqui. |
| `django-celery-beat` | Traz tabelas próprias, e o Prisma é dono deste banco. O `beat` usa o agendador de arquivo. Entra na fatia 7. |

`back/pytest.ini`:

```ini
[pytest]
DJANGO_SETTINGS_MODULE = backend.settings
python_files = test_*.py
testpaths = tests
pythonpath = backend
; --no-migrations porque o Django nao tem migration nenhuma e nao deve ter:
; quem cria tabela neste banco e o Prisma (Global Constraints).
addopts = --no-migrations
env =
    PGDATABASE=brutus_test
    PGHOST=localhost
    PGPORT=5433
```

- [ ] **Step 4: O esqueleto, no layout do Unistock**

`back/manage.py` — igual ao do Unistock, com o settings apontando para `backend.settings`:

```python
#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
```

`back/backend/backend/settings.py`:

```python
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "inseguro-so-em-dev")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

# O dominio que o slug.py compara com o Host. Sem esquema e sem porta, igual
# ao NEXT_PUBLIC_DOMINIO_BASE do outro lado — os dois precisam concordar, e a
# forma canonica e a que o slug.ts ja usa.
DOMINIO_BASE = os.environ.get("DOMINIO_BASE", "localhost")

# O ponto e o curinga: `.localhost` cobre brutus.localhost, dontony.localhost
# e admin.localhost de uma vez.
ALLOWED_HOSTS = [f".{DOMINIO_BASE}", DOMINIO_BASE]

# DESLIGADO de proposito. O tenant sai do Host real; confiar em cabecalho de
# upstream faria o back precisar do front na frente para funcionar, e ele
# precisa subir, testar e ir para producao sozinho (spec §5).
USE_X_FORWARDED_HOST = False

# Sem contrib.admin, contrib.auth nem sessions: eles criariam tabela num banco
# de que o Prisma e dono (spec §8). Sem django_celery_beat pela mesma razao —
# o beat usa o agendador de arquivo, e a agenda em tabela e da fatia 7.
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "tenant",
]

MIDDLEWARE = []

ROOT_URLCONF = "backend.urls"
WSGI_APPLICATION = "backend.wsgi.application"

# Dois papeis, dois aliases — espelha exatamente o tests/setup.ts do front.
# `default` e o papel da aplicacao e e sobre ele que o RLS age. `owner` ignora
# o RLS e existe SO para montar cenario de teste.
def _banco(usuario: str, senha_padrao: str) -> dict:
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["PGDATABASE"],
        "USER": usuario,
        "PASSWORD": os.environ.get(f"PGPASSWORD_{usuario.split('_')[1].upper()}", senha_padrao),
        "HOST": os.environ.get("PGHOST", "db"),
        "PORT": os.environ.get("PGPORT", "5432"),
    }


DATABASES = {
    "default": _banco("brutus_app", "app"),
    "owner": _banco("brutus_owner", "owner"),
}

# DRF sem autenticacao nem permissao por padrao: a sessao e a fatia 3, e um
# default que ninguem leu e como uma porta que ninguem sabe se esta trancada.
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
}

CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://redis:6379/1")
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TIMEZONE = "America/Sao_Paulo"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "static/"
USE_TZ = True
TIME_ZONE = "America/Sao_Paulo"
```

`back/backend/backend/celery.py` — copiado do Unistock, inclusive o comentário, que continua valendo:

```python
import os

from celery import Celery

# Forca o valor certo (nao setdefault): uma variavel DJANGO_SETTINGS_MODULE
# perdida no ambiente (ex. "backend.backend.settings") quebraria o worker/beat,
# enquanto o wsgi.py da API ja forca. Mantem os dois consistentes.
os.environ["DJANGO_SETTINGS_MODULE"] = "backend.settings"

app = Celery("backend")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
```

`back/backend/backend/__init__.py`:

```python
from .celery import app as celery_app

__all__ = ("celery_app",)
```

`back/backend/backend/urls.py`:

```python
from django.urls import path
from tenant import views

urlpatterns = [path("api/saude", views.saude, name="saude")]
```

`back/backend/backend/wsgi.py` e `asgi.py`: os do Unistock, com `DJANGO_SETTINGS_MODULE = "backend.settings"`.

`back/backend/tenant/apps.py`:

```python
from django.apps import AppConfig


class TenantConfig(AppConfig):
    name = "tenant"
```

`back/backend/tenant/views.py`:

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET"])
def saude(request):
    return Response({"ok": True})
```

- [ ] **Step 5: O trilho do pytest**

`back/tests/conftest.py`:

```python
import pytest


# O banco de teste ja existe (init-db.sql cria o brutus_test) e ja esta migrado
# (o Prisma o migra via DATABASE_URL_TEST, do lado do front). Se deixassemos o
# pytest-django cria-lo, ele nasceria SEM tabela nenhuma, porque os models sao
# managed=False — e o sintoma seria "relation Barbearia does not exist" num
# banco que existe e esta cheio.
@pytest.fixture(scope="session")
def django_db_setup():
    pass
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd back
python -m venv .venv && . .venv/Scripts/activate
pip install -r requirements.txt
pytest tests/test_saude.py -v
```

Expected: PASS.

- [ ] **Step 7: O Dockerfile e o entrypoint**

`back/Dockerfile` — o do Unistock, **sem** o que morreu junto com o MySQL e o PDF:

```dockerfile
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

# Do Unistock ficaram build-essential, gcc, pkg-config e libpq-dev.
# SAIRAM: default-libmysqlclient-dev (nao ha MySQL aqui) e as bibliotecas do
# weasyprint (libglib, libpango, libharfbuzz, libjpeg, libopenjp2) — nao ha PDF.
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    pkg-config \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

`back/entrypoint.sh` — **e aqui está a adaptação mais importante desta tarefa**:

```sh
#!/bin/sh
set -e

# O entrypoint do Unistock roda `python manage.py migrate` aqui. NAO FACA ISSO.
#
# O dono do DDL deste banco e o Prisma, do lado do front, ate a fatia 8. Um
# `migrate` nesta linha criaria as tabelas do Django num banco que nao e dele,
# e o estrago seria silencioso: a suite do front continuaria verde por um
# tempo, e a divergencia so apareceria quando alguem estranhasse uma tabela
# django_content_type ao lado de "Barbearia".
#
# O que este entrypoint faz e esperar o banco. So isso.
until python -c "
import os, socket, sys
s = socket.socket()
s.settimeout(1)
try:
    s.connect((os.environ.get('PGHOST', 'db'), int(os.environ.get('PGPORT', 5432))))
except OSError:
    sys.exit(1)
"; do
  echo "[entrypoint] esperando o banco..."
  sleep 1
done

exec "$@"
```

- [ ] **Step 8: O serviço `api` no compose**

No `back/docker-compose.yml`:

```yaml
  api:
    build: { context: ., target: null }
    environment:
      PGDATABASE: brutus
      PGHOST: db
      PGPORT: "5432"
      DOMINIO_BASE: localhost
      DJANGO_DEBUG: "1"
      REDIS_URL: redis://redis:6379/1
    ports: ["8000:8000"]
    volumes: [".:/app"]
    depends_on:
      db: { condition: service_healthy }
    networks: [brutus]
```

> `target: null` porque este Dockerfile é de estágio único, diferente do
> `front/Dockerfile`, que tem `target: dev`. Se preferir, omita a chave
> `target` inteira — é a mesma coisa e lê melhor.

`back/.env.example`:

```
# O dominio que o slug.py compara com o Host. Precisa ser IGUAL ao
# NEXT_PUBLIC_DOMINIO_BASE do front: se divergirem, o back resolve tenant
# para um host que o front nunca gera, e o sintoma e 404 em tudo.
DOMINIO_BASE="localhost"
DJANGO_SECRET_KEY=""
REDIS_URL="redis://redis:6379/1"
```

- [ ] **Step 9: Provar pelo navegador, que é o que importa**

```bash
cd back && docker compose up -d api
curl -s http://brutus.localhost:8000/api/saude
```

Expected: `{"ok": true}`. Se der `DisallowedHost`, o `ALLOWED_HOSTS` não cobriu — confira que `DOMINIO_BASE` chegou ao contêiner.

- [ ] **Step 10: Portar as varreduras que saíram do front na Task 1**

A Task 1 removeu de `front/tests/ambiente.test.ts` três varreduras estruturais que passaram a falar de arquivos do back, e as depositou em `back/docs/testes-a-portar.md` com asserção e comentário verbatim. Elas renascem agora, em `back/tests/test_ambiente.py`.

Leia aquele arquivo e porte cada uma. Os comentários carregam o incidente de 10/08 e o motivo de cada `expect` — **traga-os junto**, traduzidos para o estilo do arquivo Python, não jogue fora. As três são:

1. o agendador confere o WhatsApp no mesmo tique do lembrete;
2. o zelador alarma envio recusado e poda o histórico;
3. a sessão da Evolution mora num volume nomeado.

Mais a metade que sobrou da quarta: que o serviço `evolution` exige `AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY}`.

Todas leem `back/docker-compose.yml` e `back/docker/zelador.sh` — arquivos **deste** repositório. Nenhuma pode ler nada fora dele, pelo mesmo motivo que as tirou do front.

Quando terminar, apague `back/docs/testes-a-portar.md`: ele era o bilhete, e o bilhete não sobrevive à entrega.

- [ ] **Step 11: Rodar tudo**

Run: `cd back && pytest -v`
Expected: PASS — o `test_saude` e as quatro varreduras portadas.

- [ ] **Step 12: Commit**

```bash
cd back
git add -A
git commit -m "Sobe um Django no layout do Unistock, sem o que nao serve

manage.py na raiz, backend/backend para o projeto e backend/tenant para a
app, entrypoint.sh e Dockerfile vindos de la.

Tres coisas ficaram para tras de proposito: mysqlclient, porque todo o
isolamento entre barbearias aqui e PostgreSQL — set_config, FORCE ROW
LEVEL SECURITY e a restricao 23P01 nao existem em MySQL; o simplejwt,
que e Bearer em header e portanto o desenho que a spec proibe; e o
weasyprint, que servia a relatorio de estoque.

E uma linha do entrypoint do Unistock NAO veio: o `manage.py migrate`. O
dono do DDL deste banco e o Prisma ate a fatia 8, e um migrate aqui
criaria tabela do Django num banco alheio sem ninguem perceber.

Traz de volta as varreduras que sairam do ambiente.test.ts na Task 1,
agora lendo arquivos deste repositorio."
```

---

## Task 3: `slug.py`, o porte da função pura

**Files:**
- Create: `back/backend/tenant/config.py`, `back/backend/tenant/slug.py`
- Create: `back/tests/test_slug.py`

**Interfaces:**
- Consumes: nada (função pura, sem banco e sem Django).
- Produces: `extrair_slug(host: str, dominio_base: str) -> str | None` e `eh_host_admin(host: str, dominio_base: str) -> bool`.

- [ ] **Step 1: Escrever os testes que falham**

Os casos vêm de `front/tests/tenant.test.ts` — os mesmos, um a um. Não invente casos novos aqui: divergência entre os dois lados é exatamente o que este porte não pode ter.

`back/tests/test_slug.py`:

```python
import pytest

from tenant.slug import eh_host_admin, extrair_slug


@pytest.mark.parametrize(
    "host,base,esperado",
    [
        ("brutus.seuapp.com.br", "seuapp.com.br", "brutus"),
        ("brutus.localhost:3000", "localhost", "brutus"),
        ("dontony.localhost", "localhost", "dontony"),
        # A porta do Django, que o lado Next nunca ve: mesmo host, porta outra.
        ("brutus.localhost:8000", "localhost", "brutus"),
    ],
)
def test_resolve(host, base, esperado):
    assert extrair_slug(host, base) == esperado


@pytest.mark.parametrize(
    "host,base,porque",
    [
        ("seuapp.com.br", "seuapp.com.br", "dominio nu"),
        ("localhost:3000", "localhost", "localhost puro"),
        ("www.seuapp.com.br", "seuapp.com.br", "reservado www"),
        ("api.seuapp.com.br", "seuapp.com.br", "reservado api"),
        ("painel.seuapp.com.br", "seuapp.com.br", "reservado painel"),
        ("outrodominio.com", "seuapp.com.br", "dominio alheio"),
        ("BRUTUS!.localhost", "localhost", "slug invalido"),
        ("a.b.seuapp.com.br", "seuapp.com.br", "subdominio de subdominio"),
    ],
)
def test_nao_resolve(host, base, porque):
    assert extrair_slug(host, base) is None


def test_host_do_admin():
    assert eh_host_admin("admin.localhost:8000", "localhost") is True
    assert eh_host_admin("brutus.localhost", "localhost") is False
    # O 'admin' e reservado, entao extrair_slug devolve None para ele — a
    # mesma resposta que da para o dominio nu. E por isso que esta funcao
    # existe: sem ela, admin.localhost cairia na vitrine do produto.
    assert extrair_slug("admin.localhost", "localhost") is None
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_slug.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tenant.slug'`.

- [ ] **Step 3: Implementar**

`back/backend/tenant/config.py`:

```python
import re

# Espelha o SUBDOMINIOS_RESERVADOS de front/src/lib/config.ts. Divergir daqui
# significa um subdominio que um lado trata como barbearia e o outro nao.
SUBDOMINIOS_RESERVADOS = frozenset(
    {"www", "api", "app", "admin", "painel", "static", "assets", "cdn", "mail"}
)

# Espelha o SLUG_REGEX. Note que a forma exige no minimo 3 caracteres: uma
# letra, de 1 a 30 do miolo, e uma letra final.
#
# `fullmatch` sem `$`, e nao `match` com `$`: em Python o `$` tambem casa antes
# de um \n final, entao "brutus\n" passaria por um regex ancorado com `$`.
SLUG_REGEX = re.compile(r"[a-z0-9][a-z0-9-]{1,30}[a-z0-9]")

# 60_000 ms do lado Next. Aqui em segundos, porque e o que o time.monotonic()
# devolve.
TTL_CACHE_TENANT_S = 60.0
```

`back/backend/tenant/slug.py`:

```python
from .config import SLUG_REGEX, SUBDOMINIOS_RESERVADOS


def extrair_slug(host: str, dominio_base: str) -> str | None:
    """Traduz o Host da requisicao no slug da barbearia.

    Porte de front/src/lib/slug.ts, caso a caso. Vive sem nenhuma dependencia
    de banco ou de Django porque o middleware e os testes a chamam antes de
    existir tenant — e porque funcao pura e o que menos pode divergir entre os
    dois lados durante a travessia.
    """
    sem_porta = host.split(":")[0].lower()
    if sem_porta == dominio_base:
        return None
    if not sem_porta.endswith(f".{dominio_base}"):
        return None

    slug = sem_porta[: -(len(dominio_base) + 1)]
    if "." in slug:  # subdominio de subdominio nao e tenant
        return None
    if slug in SUBDOMINIOS_RESERVADOS:
        return None
    if not SLUG_REGEX.fullmatch(slug):
        return None
    return slug


def eh_host_admin(host: str, dominio_base: str) -> bool:
    """`extrair_slug` devolve None para DOIS casos diferentes — o dominio nu e
    um subdominio reservado — e quem roteia precisa distingui-los: um serve a
    pagina institucional, o outro serve o painel de admin.
    """
    return host.split(":")[0].lower() == f"admin.{dominio_base}"
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd back && pytest tests/test_slug.py -v`
Expected: PASS, 13 casos.

- [ ] **Step 5: Commit**

```bash
cd back
git add backend/tenant/config.py backend/tenant/slug.py tests/test_slug.py
git commit -m "Porta o slug.ts, caso a caso

Os casos de teste sao os mesmos de front/tests/tenant.test.ts, sem
acrescimo de invencao: durante a travessia os dois lados resolvem tenant
em paralelo, e divergencia aqui e barbearia servindo dado de outra.

Dois acrescimos com motivo: a porta 8000, que o lado Next nunca ve, e
fullmatch no lugar de um regex ancorado com \$ — em Python o \$ casa
antes do \\n final, entao 'brutus\\n' passaria."
```

---

## Task 4: O model `Barbearia` e o trilho de cenário

**Files:**
- Create: `back/backend/tenant/models.py`
- Modify: `back/tests/conftest.py`
- Create: `back/tests/test_modelos.py`

**Interfaces:**
- Consumes: os aliases `default` e `owner` da Task 2.
- Produces: `tenant.models.Barbearia` e `tenant.models.Barbeiro`; as fixtures `limpar_banco` e `cenario` do `conftest.py`.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_modelos.py`:

```python
import pytest

from tenant.models import Barbearia

pytestmark = pytest.mark.django_db(databases=["default", "owner"])


def test_le_a_barbearia_que_o_cenario_criou(cenario):
    b = Barbearia.objects.using("owner").get(slug="brutus")
    assert b.nome == "Brutus"
    assert b.ativo is True


def test_nomes_de_coluna_batem_com_o_prisma():
    # Um db_column esquecido nao quebra o Django: quebra o lado que ainda e
    # Prisma, e o sintoma aparece longe da causa. Este teste e a rede.
    campos = {f.name: f.column for f in Barbearia._meta.get_fields() if hasattr(f, "column")}
    assert campos["horario_resumo"] == "horarioResumo"
    assert campos["whatsapp_contato"] == "whatsappContato"
    assert campos["criado_em"] == "criadoEm"
    assert Barbearia._meta.db_table == "Barbearia"
    assert Barbearia._meta.managed is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_modelos.py -v`
Expected: FAIL — `No module named 'tenant.models'`.

- [ ] **Step 3: Implementar os models**

`back/backend/tenant/models.py`:

```python
from django.db import models


class Barbearia(models.Model):
    """A tabela de tenant. Unica sem barbeariaId e unica fora do RLS — ela e
    lida ANTES de existir tenant, para traduzir subdominio em id, e por isso e
    protegida por GRANT (REVOKE INSERT/UPDATE/DELETE) e nao por politica.
    """

    # TextField e nao UUIDField: o Prisma gera valor uuid numa coluna `String`,
    # que no Postgres e TEXT — `id String @id @default(uuid())`, sem @db.Uuid.
    # UUIDField faria o psycopg mandar parametro tipado `uuid` contra coluna
    # `text`, e `text = uuid` nao resolve em comparacao (o cast so vale em
    # atribuicao). INSERT passaria e o filtro do RLS quebraria.
    id = models.TextField(primary_key=True, db_column="id")
    slug = models.TextField(unique=True, db_column="slug")
    nome = models.TextField(db_column="nome")
    endereco = models.TextField(db_column="endereco")
    # Nulo ate o DONO preencher: o admin da plataforma nao sabe o horario da
    # barbearia. Nulo e string vazia seriam dois jeitos de dizer a mesma coisa.
    horario_resumo = models.TextField(null=True, db_column="horarioResumo")
    whatsapp_contato = models.TextField(db_column="whatsappContato")
    ativo = models.BooleanField(db_column="ativo")
    criado_em = models.DateTimeField(db_column="criadoEm")

    class Meta:
        managed = False
        db_table = "Barbearia"


class Barbeiro(models.Model):
    """Existe nesta fatia por um motivo so: e a tabela de tenant que o teste de
    RLS conta para provar que o escopo funciona. Os campos que a fatia 1 vai
    precisar entram la.
    """

    # TextField pelo mesmo motivo do Barbearia.id acima. Aqui importa mais: e
    # nesta coluna que o teste de isolamento da Task 6 filtra.
    id = models.TextField(primary_key=True, db_column="id")
    barbearia_id = models.TextField(db_column="barbeariaId")
    nome = models.TextField(db_column="nome")
    whatsapp = models.TextField(db_column="whatsapp")
    ativo = models.BooleanField(db_column="ativo")

    class Meta:
        managed = False
        db_table = "Barbeiro"
```

- [ ] **Step 4: A fixture de cenário**

Acrescente a `back/tests/conftest.py`:

```python
import uuid

import pytest
from django.db import connections


@pytest.fixture(autouse=True)
def limpar_banco(request):
    """Mesmo TRUNCATE do tests/setup.ts do front, e pelo mesmo motivo: cada
    caso recria a barbearia com um uuid novo, e sobra de caso anterior faz o
    RLS filtrar tudo com sintoma de 'nao encontrado'.

    Limpa na ENTRADA, como o `beforeEach(limparBanco)` do front, e nao na
    saida: corrida que morre no meio — crash, Ctrl-C, --maxfail — nao chega ao
    teardown, e a corrida seguinte falharia em dado que nao criou. Limpar na
    entrada se cura sozinho.

    O guarda cobre marker E fixture: o `_django_db_helper` do pytest-django
    libera o banco tambem para quem pede `db`/`transactional_db` sem marker
    nenhum, e ai um TRUNCATE pulado em silencio deixa sobra para o proximo.

    Roda como `owner` porque `brutus_app` nao tem direito de TRUNCATE.
    """
    if not (
        request.node.get_closest_marker("django_db")
        or {"db", "transactional_db"} & set(request.fixturenames)
    ):
        yield
        return
    with connections["owner"].cursor() as cur:
        cur.execute(
            'TRUNCATE TABLE "Agendamento", "Cliente", "Bloqueio", '
            '"HorarioTrabalho", "BarbeiroServico", "Servico", "Barbeiro", '
            '"Barbearia" RESTART IDENTITY CASCADE'
        )
    yield


@pytest.fixture
def cenario():
    """Duas barbearias com um barbeiro cada. Duas, e nao uma, porque o unico
    teste de isolamento que vale alguma coisa e o que tem de quem se isolar.
    """
    from tenant.models import Barbearia, Barbeiro

    dados = {}
    for slug, nome in (("brutus", "Brutus"), ("dontony", "Dom Tony")):
        b = Barbearia.objects.using("owner").create(
            id=str(uuid.uuid4()),
            slug=slug,
            nome=nome,
            endereco="Rua Aurora, 88",
            horario_resumo=None,
            whatsapp_contato="11999998888",
            ativo=True,
            criado_em="2026-08-11T12:00:00Z",
        )
        Barbeiro.objects.using("owner").create(
            id=str(uuid.uuid4()),
            barbearia_id=b.id,
            nome=f"Barbeiro da {nome}",
            whatsapp="11911112222",
            ativo=True,
        )
        dados[slug] = b
    return dados
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd back
docker compose up -d db
pytest tests/test_modelos.py -v
```

Expected: PASS. Se der `relation "Barbearia" does not exist`, o `brutus_test` não foi migrado — rode `cd ../front && npm test` uma vez, que o Prisma o migra.

- [ ] **Step 6: Commit**

```bash
cd back
git add backend/tenant/models.py tests/conftest.py tests/test_modelos.py
git commit -m "Le as duas tabelas que a fronteira precisa, e so elas

managed=False com db_table e db_column explicitos em todo campo: o
Prisma e dono do DDL ate a fatia 8, e a nomenclatura dele sobrevive
enquanto ele sobreviver.

O teste de nomes de coluna existe porque db_column esquecido nao quebra
o Django — quebra o lado Prisma, com sintoma longe da causa."
```

---

## Task 5: O middleware de tenant

**Files:**
- Create: `back/backend/tenant/middleware.py`
- Create: `back/tests/test_tenant.py`
- Modify: `back/backend/backend/settings.py` (`MIDDLEWARE`)

**Interfaces:**
- Consumes: `extrair_slug`, `eh_host_admin` (Task 3); `Barbearia` (Task 4).
- Produces: `request.barbearia: Barbearia | None` e `request.eh_admin: bool` em toda view; 404 para host que não resolve.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_tenant.py`:

```python
import pytest

pytestmark = pytest.mark.django_db(databases=["default", "owner"])


def test_host_vira_barbearia(client, cenario):
    r = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert r.status_code == 200
    assert r.json()["barbearia"] == "Brutus"


def test_outro_host_vira_outra_barbearia(client, cenario):
    r = client.get("/api/saude", headers={"host": "dontony.localhost"})
    assert r.json()["barbearia"] == "Dom Tony"


def test_host_desconhecido_da_404(client, cenario):
    r = client.get("/api/saude", headers={"host": "naoexiste.localhost"})
    assert r.status_code == 404


def test_barbearia_desativada_da_404(client, cenario):
    from tenant.models import Barbearia

    Barbearia.objects.using("owner").filter(slug="brutus").update(ativo=False)
    r = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert r.status_code == 404


def test_host_do_admin_nao_e_barbearia(client, cenario):
    r = client.get("/api/saude", headers={"host": "admin.localhost"})
    assert r.status_code == 200
    assert r.json()["barbearia"] is None
    assert r.json()["admin"] is True
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_tenant.py -v`
Expected: FAIL — a resposta é `{"ok": true}`, sem a chave `barbearia`.

- [ ] **Step 3: Implementar**

`back/backend/tenant/middleware.py`:

```python
import time

from django.conf import settings
from django.http import Http404

from .config import TTL_CACHE_TENANT_S
from .models import Barbearia
from .slug import eh_host_admin, extrair_slug

_cache: dict[str, tuple[Barbearia | None, float]] = {}


def _limpar_cache_tenant() -> None:
    """So para teste, igual ao _limparCacheTenant do lado Next: cada caso
    recria a barbearia com um uuid novo, e um slug cacheado do caso anterior
    apontaria para um id que o TRUNCATE ja apagou.
    """
    _cache.clear()


def _buscar_por_slug(slug: str) -> Barbearia | None:
    guardado = _cache.get(slug)
    if guardado and guardado[1] > time.monotonic():
        return guardado[0]

    # Barbearia esta FORA do RLS de proposito: e lida antes de existir tenant.
    valor = Barbearia.objects.filter(slug=slug, ativo=True).first()
    _cache[slug] = (valor, time.monotonic() + TTL_CACHE_TENANT_S)
    return valor


class TenantMiddleware:
    """Resolve Host -> Barbearia e anexa em request.barbearia.

    Le do Host REAL, nunca de cabecalho de upstream. E isso que mantem o back
    deployavel sozinho: um Django que dependesse de um x-barbearia-slug
    injetado pelo Next nao subiria sem o front na frente.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host()
        base = settings.DOMINIO_BASE

        request.eh_admin = eh_host_admin(host, base)
        request.barbearia = None

        if not request.eh_admin:
            slug = extrair_slug(host, base)
            if slug is None:
                raise Http404("host sem barbearia")
            barbearia = _buscar_por_slug(slug)
            if barbearia is None:
                raise Http404("barbearia nao encontrada")
            request.barbearia = barbearia

        return self.get_response(request)
```

Em `back/backend/backend/settings.py`:

```python
MIDDLEWARE = ["tenant.middleware.TenantMiddleware"]
```

E em `back/backend/tenant/views.py`:

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["GET"])
def saude(request):
    return Response(
        {
            "ok": True,
            "barbearia": request.barbearia.nome if request.barbearia else None,
            "admin": request.eh_admin,
        }
    )
```

- [ ] **Step 4: Limpar o cache entre casos**

O TTL de 60s faz o caso seguinte enxergar a barbearia que o `TRUNCATE` apagou. Acrescente à fixture `limpar_banco` do `conftest.py`, **logo depois do `TRUNCATE` e antes do `yield`** — o cache tem que morrer junto com as linhas que ele indexa:

```python
    from tenant.middleware import _limpar_cache_tenant

    _limpar_cache_tenant()
```

- [ ] **Step 5: Consertar o teste da Task 2, que este middleware quebrou**

`tests/test_saude.py` foi escrito quando `/api/saude` não tocava o banco.
Agora o middleware resolve tenant antes da view, então ele precisa de banco e
de uma barbearia que exista:

```python
import pytest

pytestmark = pytest.mark.django_db(databases=["default", "owner"])


def test_saude_responde_ok(client, cenario):
    r = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
```

Sem isto, `pytest` inteiro fica vermelho com `Database access not allowed` — um
erro que aponta para o arquivo errado e custa uns bons minutos.

- [ ] **Step 6: Rodar a suíte inteira, não só o arquivo novo**

Run: `cd back && pytest -v`
Expected: PASS, tudo — os 5 casos novos **e** os anteriores. Rodar só
`tests/test_tenant.py` aqui esconderia exatamente a quebra do step anterior.

- [ ] **Step 7: Commit**

```bash
cd back
git add backend/tenant/middleware.py backend/tenant/views.py backend/backend/settings.py tests/
git commit -m "Resolve a barbearia pelo Host, e por mais nada

Cabecalho de upstream nao entra na conta. Um back que lesse
x-barbearia-slug do Next precisaria do Next para subir, testar e ir para
producao — e ele precisa fazer as tres coisas sozinho.

O cache de 60s traz junto o _limpar_cache_tenant, pela mesma razao que o
lado Next tem o dele: sem limpar, o caso seguinte resolve um slug para um
id que o TRUNCATE apagou, e o RLS filtra tudo com cara de 'nao achei'."
```

---

## Task 6: `com_barbearia()`, o wrapper de RLS

**Files:**
- Create: `back/backend/tenant/rls.py`
- Create: `back/tests/test_rls.py`

**Interfaces:**
- Consumes: o alias `default` (papel `brutus_app`) e os models da Task 4.
- Produces: o context manager `com_barbearia(barbearia_id)`.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_rls.py`:

```python
import uuid

import pytest

from tenant.models import Barbeiro
from tenant.rls import com_barbearia

pytestmark = pytest.mark.django_db(databases=["default", "owner"], transaction=True)


def test_escopa_para_a_barbearia_pedida(cenario):
    with com_barbearia(cenario["brutus"].id):
        assert Barbeiro.objects.count() == 1
        assert Barbeiro.objects.first().nome == "Barbeiro da Brutus"


def test_nao_enxerga_a_outra(cenario):
    with com_barbearia(cenario["dontony"].id):
        nomes = list(Barbeiro.objects.values_list("nome", flat=True))
    assert nomes == ["Barbeiro da Dom Tony"]


def test_fora_do_wrapper_nao_enxerga_nada(cenario):
    # Falha FECHADA: sem app.barbearia_id definido, a politica compara com
    # NULL e nenhuma linha casa. E a propriedade que faz esquecer o wrapper
    # virar zero resultado em vez de vazamento.
    assert Barbeiro.objects.count() == 0


def test_a_variavel_morre_com_a_transacao(cenario):
    with com_barbearia(cenario["brutus"].id):
        pass
    # Se o set_config tivesse is_local=False, a variavel sobreviveria na
    # SESSAO e a conexao voltaria para a pool carregando o tenant anterior.
    # Vazamento cruzado, intermitente e dependente de temporizacao.
    assert Barbeiro.objects.count() == 0


def test_barbearia_inexistente_nao_enxerga_nada(cenario):
    with com_barbearia(str(uuid.uuid4())):
        assert Barbeiro.objects.count() == 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_rls.py -v`
Expected: FAIL — `No module named 'tenant.rls'`.

- [ ] **Step 3: Implementar**

`back/backend/tenant/rls.py`:

```python
from contextlib import contextmanager

from django.db import connection, transaction


@contextmanager
def com_barbearia(barbearia_id):
    """Executa o bloco com o RLS apontando para `barbearia_id`.

    O terceiro argumento `true` de set_config e is_local: a variavel morre com
    a TRANSACAO. Com `false` ela viveria na SESSAO — e como a conexao volta
    para a pool, o proximo pedido herdaria este tenant. Vazamento cruzado,
    intermitente, dependente de temporizacao. Nunca trocar para `false`.

    O `atomic` nao e zelo: o set_config PRECISA rodar na mesma transacao das
    consultas. Sem ele, em autocommit, cada statement e a sua propria
    transacao e a variavel morre antes da primeira consulta — o sintoma sai
    como 'nao encontrado' em tudo.
    """
    with transaction.atomic():
        with connection.cursor() as cur:
            cur.execute(
                "SELECT set_config('app.barbearia_id', %s, true)",
                [str(barbearia_id)],
            )
        yield
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd back && pytest tests/test_rls.py -v`
Expected: PASS, 5 casos. **Se `test_fora_do_wrapper_nao_enxerga_nada` falhar devolvendo linhas, pare tudo**: significa que a conexão está usando um papel que ignora o RLS, e nada mais nesta fatia é confiável. Confira que o alias `default` conecta como `brutus_app`.

- [ ] **Step 5: Commit**

```bash
cd back
git add backend/tenant/rls.py tests/test_rls.py
git commit -m "Refaz a fronteira mais forte do sistema, com o mesmo is_local

set_config com o terceiro argumento true: a variavel morre com a
transacao. Com false ela viveria na sessao, e a conexao voltaria para a
pool carregando o tenant anterior.

O atomic() explicito e o que o lado Prisma ganhava de graca do
\$transaction: em autocommit cada statement e uma transacao, e a variavel
morreria antes da primeira consulta."
```

---

## Task 7: A varredura estrutural

**Files:**
- Create: `back/tests/test_varredura.py`

**Interfaces:**
- Consumes: `tenant/` inteiro, como texto.
- Produces: nada em runtime. É rede de proteção.

- [ ] **Step 1: Escrever o teste**

Este é o único da fatia que nasce passando — ele existe para falhar **no futuro**, quando a fatia 5 acrescentar uma consulta fora do wrapper.

`back/tests/test_varredura.py`:

```python
import ast
import pathlib

# Models sujeitos ao RLS. `Barbearia` fica de fora de proposito: ela e lida
# antes de existir tenant, e por isso e protegida por GRANT, nao por politica.
MODELS_DE_TENANT = {"Barbeiro", "Servico", "BarbeiroServico", "HorarioTrabalho",
                    "Bloqueio", "Cliente", "Agendamento"}

# Arquivos que podem consultar sem o wrapper, com o motivo:
# - rls.py     e o proprio wrapper
# - models.py  so declara
ISENTOS = {"rls.py", "models.py", "__init__.py"}

RAIZ = pathlib.Path(__file__).resolve().parent.parent / "backend" / "tenant"


def _consultas_de_tenant(caminho: pathlib.Path) -> list[str]:
    """Acha `Model.objects` para qualquer model de tenant."""
    arvore = ast.parse(caminho.read_text(encoding="utf-8"))
    achados = []
    for no in ast.walk(arvore):
        if (
            isinstance(no, ast.Attribute)
            and no.attr == "objects"
            and isinstance(no.value, ast.Name)
            and no.value.id in MODELS_DE_TENANT
        ):
            achados.append(f"{caminho.name}:{no.lineno} {no.value.id}.objects")
    return achados


def test_nenhuma_consulta_de_tenant_fora_do_wrapper():
    """A garantia de isolamento vale exatamente enquanto TODA consulta passar
    pelo com_barbearia(). Este teste e o que impede a proxima fatia de abrir um
    caminho lateral sem ninguem perceber.

    Se ele falhar num arquivo novo e legitimo, a resposta certa quase nunca e
    acrescentar o arquivo a ISENTOS — e envolver a consulta no wrapper.
    """
    fora = []
    for arquivo in RAIZ.glob("*.py"):
        if arquivo.name in ISENTOS:
            continue
        fora.extend(_consultas_de_tenant(arquivo))

    assert fora == [], (
        "consulta a model de tenant fora do com_barbearia():\n  "
        + "\n  ".join(fora)
    )
```

- [ ] **Step 2: Rodar e ver passar**

Run: `cd back && pytest tests/test_varredura.py -v`
Expected: PASS.

- [ ] **Step 3: Provar que ele morde**

Acrescente temporariamente a `back/backend/tenant/views.py`:

```python
from .models import Barbeiro

def _provisorio(request):
    return Barbeiro.objects.count()
```

Run: `cd back && pytest tests/test_varredura.py -v`
Expected: **FAIL**, apontando `views.py:<linha> Barbeiro.objects`.

Um teste que nunca foi visto falhando não é rede de proteção — é decoração. **Apague as linhas provisórias depois de ver o vermelho.**

- [ ] **Step 4: Commit**

```bash
cd back
git add tests/test_varredura.py
git commit -m "Poe a varredura estrutural de pe antes de haver o que varrer

Nasce passando porque ainda nao ha consulta nenhuma. Ela existe para
falhar na fatia 5, quando o painel acrescentar a primeira consulta que
esqueca o wrapper — e por isso foi vista falhando de proposito antes de
entrar."
```

---

## Task 8: A barreira posicional

**Files:**
- Modify: `back/backend/tenant/middleware.py`
- Modify: `back/backend/backend/settings.py`
- Create: `back/tests/test_barreira.py`

**Interfaces:**
- Consumes: `request.eh_admin` da Task 5.
- Produces: 404 para `/admin*` e `/api/admin*` fora do host `admin.`.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_barreira.py`:

```python
import pytest

pytestmark = pytest.mark.django_db(databases=["default", "owner"])


@pytest.mark.parametrize("caminho", ["/admin", "/admin/qualquer", "/api/admin/barbearias"])
def test_admin_nao_existe_fora_do_host_do_admin(client, cenario, caminho):
    r = client.get(caminho, headers={"host": "brutus.localhost"})
    # 404, nunca 403: 403 confirmaria que a rota existe.
    assert r.status_code == 404


def test_rota_inventada_sob_o_prefixo_tambem_nasce_protegida(client, cenario):
    # A barreira e POSICIONAL. Rota que ainda nao existe ja responde 404 pelo
    # mesmo motivo que as que existem — e por isso a fatia 6 nao precisa
    # lembrar de proteger nada.
    r = client.get("/api/admin/inventada/agora", headers={"host": "brutus.localhost"})
    assert r.status_code == 404
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_barreira.py -v`
Expected: FAIL — hoje qualquer caminho desconhecido já dá 404 por não ter rota, então **confira a razão**: rode com `-v` e veja que ainda não há middleware. Para não confiar num falso verde, acrescente temporariamente uma rota `/api/admin/barbearias` em `urls.py` apontando para `views.saude`; o teste deve ficar vermelho. Deixe essa rota até o Step 4.

- [ ] **Step 3: Implementar**

Acrescente a `back/backend/tenant/middleware.py`:

```python
class BarreiraAdminMiddleware:
    """Fora do host do admin, o painel da plataforma NAO EXISTE.

    A barreira e POSICIONAL: nenhuma rota de admin precisa lembrar de se
    proteger, porque a partir de qualquer outro host elas nao sao alcancaveis.
    Rota nova sob estes prefixos nasce protegida sem que ninguem decida nada.

    404 e nao 403, de proposito: 403 confirmaria que o recurso existe.

    Durante a travessia esta regra vive dos DOIS lados — aqui e no proxy.ts do
    front. Nao e redundancia acidental: e o que faz uma rota atravessar sem
    ficar desprotegida em nenhum instante.
    """

    PREFIXOS = ("/admin", "/api/admin")

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith(self.PREFIXOS) and not request.eh_admin:
            raise Http404("nao existe fora do host do admin")
        return self.get_response(request)
```

Em `back/backend/backend/settings.py` — **depois** do `TenantMiddleware`, que é quem define `request.eh_admin`:

```python
MIDDLEWARE = [
    "tenant.middleware.TenantMiddleware",
    "tenant.middleware.BarreiraAdminMiddleware",
]
```

- [ ] **Step 4: Rodar, ver passar, e limpar**

Run: `cd back && pytest tests/test_barreira.py -v`
Expected: PASS. Agora **remova** a rota temporária `/api/admin/barbearias` de `urls.py` e rode de novo — continua verde, agora pelo motivo certo.

- [ ] **Step 5: Commit**

```bash
cd back
git add backend/tenant/middleware.py backend/backend/settings.py tests/test_barreira.py
git commit -m "Ergue a barreira do admin antes da primeira rota de admin

Posicional, como a do proxy.ts: a fatia 6 nao vai precisar lembrar de
proteger nada. Durante a travessia a regra vive dos dois lados, e e isso
que faz uma rota atravessar sem ficar descoberta em nenhum instante.

404 e nao 403 — 403 confirmaria que o recurso existe."
```

---

## Task 9: CORS pela biblioteca, e o header anti-CSRF

**Files:**
- Modify: `back/backend/backend/settings.py`
- Modify: `back/backend/tenant/config.py`
- Create: `back/backend/tenant/middleware.py` (acrescenta `ClienteMiddleware`)
- Create: `back/tests/test_cors.py`

**Interfaces:**
- Consumes: `SUBDOMINIOS_RESERVADOS` (Task 3); `settings.DOMINIO_BASE` (Task 2).
- Produces: `tenant.config.regex_de_origem(dominio_base) -> str`; cabeçalhos CORS credenciados servidos pelo `django-cors-headers`; 403 para escrita sem `X-Brutus-Cliente`.

**O CORS é da biblioteca, não nosso.** O `Unistock_Back` usa `django-cors-headers` (spec §14) e aqui é igual — preflight, `Vary`, casos de borda e manutenção saem de graça. O que continua sendo nosso é só a proteção de CSRF que o CORS credenciado abre.

**A adaptação obrigatória:** o Unistock usa `CORS_ALLOWED_ORIGINS`, que é lista **estática**. Aqui a origem varia por barbearia (`brutus.localhost:3000`, `dontony.localhost:3000`, …), então tem que ser `CORS_ALLOWED_ORIGIN_REGEXES`.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_cors.py`:

```python
import re

import pytest
from django.conf import settings

from tenant.config import regex_de_origem

pytestmark = pytest.mark.django_db(databases=["default", "owner"])


@pytest.mark.parametrize(
    "origem",
    [
        "http://brutus.localhost:3000",
        "http://dontony.localhost:3000",
        # O admin e reservado para o slug, mas e uma origem legitima do front:
        # e de la que o painel da plataforma chama a API.
        "http://admin.localhost:3000",
    ],
)
def test_origens_do_front_sao_aceitas(origem):
    assert re.match(regex_de_origem("localhost"), origem)


@pytest.mark.parametrize(
    "origem,porque",
    [
        ("http://malicioso.com", "dominio alheio"),
        ("http://brutus.localhost.malicioso.com:3000", "sufixo forjado"),
        ("http://www.localhost:3000", "subdominio reservado"),
        ("http://api.localhost:3000", "subdominio reservado"),
        ("http://a.b.localhost:3000", "subdominio de subdominio"),
    ],
)
def test_origens_de_fora_sao_recusadas(origem, porque):
    assert not re.match(regex_de_origem("localhost"), origem)


def test_o_regex_deriva_da_lista_de_reservados():
    # Um subdominio reservado novo em config.py tem que fechar a porta no CORS
    # sozinho. Se estas duas coisas virarem listas separadas, a segunda para de
    # acompanhar a primeira e ninguem percebe ate alguem registrar 'cdn'.
    from tenant.config import SUBDOMINIOS_RESERVADOS

    for reservado in SUBDOMINIOS_RESERVADOS - {"admin"}:
        assert not re.match(regex_de_origem("localhost"), f"http://{reservado}.localhost:3000")


def test_a_biblioteca_esta_ligada_e_credenciada():
    assert "corsheaders.middleware.CorsMiddleware" in settings.MIDDLEWARE
    # `*` e incompativel com credenciais — se isto virar True, o navegador
    # passa a recusar toda resposta com cookie.
    assert settings.CORS_ALLOW_CREDENTIALS is True
    assert getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False) is False


def test_ecoa_a_origem_e_permite_credencial(client, cenario):
    r = client.get(
        "/api/saude",
        headers={"host": "brutus.localhost", "origin": "http://brutus.localhost:3000"},
    )
    assert r["Access-Control-Allow-Origin"] == "http://brutus.localhost:3000"
    assert r["Access-Control-Allow-Credentials"] == "true"


def test_origem_recusada_nao_ganha_cabecalho(client, cenario):
    r = client.get(
        "/api/saude",
        headers={"host": "brutus.localhost", "origin": "http://malicioso.com"},
    )
    assert "Access-Control-Allow-Origin" not in r


def test_escrita_sem_o_header_e_recusada(client, cenario):
    r = client.post("/api/saude", headers={"host": "brutus.localhost"})
    # Entre 3000 e 8000 e same-site, e ai o SameSite=Lax nao protege. Quem
    # protege e o preflight que este header obriga.
    assert r.status_code == 403


def test_escrita_com_o_header_passa(client, cenario):
    r = client.post(
        "/api/saude",
        headers={"host": "brutus.localhost", "x-brutus-cliente": "web"},
    )
    assert r.status_code != 403


def test_get_nao_precisa_do_header(client, cenario):
    r = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert r.status_code == 200
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_cors.py -v`
Expected: FAIL — `cannot import name 'regex_de_origem'`.

- [ ] **Step 3: O regex, derivado da lista que já existe**

Acrescente a `back/backend/tenant/config.py`:

```python
def regex_de_origem(dominio_base: str) -> str:
    """Regex de origem para o django-cors-headers.

    A biblioteca so aceita lista estatica ou lista de regex, e aqui a origem
    varia por barbearia — entao e regex. O `slug.py` nao pode ser chamado de
    dentro dela, e por isso a regra e reconstruida aqui.

    O que NAO se pode fazer e reescrever a lista de reservados a mao: ela sai
    de SUBDOMINIOS_RESERVADOS, para que um nome novo la feche a porta aqui
    sozinho. Duas listas separadas param de acompanhar uma a outra em silencio.

    `admin` sai da exclusao: ele e reservado como SLUG (nao e barbearia), mas e
    uma origem legitima — o painel da plataforma chama a API a partir dele.
    """
    proibidos = "|".join(sorted(SUBDOMINIOS_RESERVADOS - {"admin"}))
    base = re.escape(dominio_base)
    # (?!…) recusa os reservados; [a-z0-9-]+ sem ponto recusa subdominio de
    # subdominio; o $ ancorado recusa sufixo forjado (…localhost.malicioso.com).
    return rf"^https?://(?!(?:{proibidos})\.)[a-z0-9-]+\.{base}(:\d+)?$"
```

- [ ] **Step 4: Ligar a biblioteca e escrever o middleware que sobra**

Em `back/backend/backend/settings.py`:

```python
from tenant.config import regex_de_origem

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGIN_REGEXES = [regex_de_origem(DOMINIO_BASE)]
CORS_ALLOW_HEADERS = [*default_headers, "x-brutus-cliente"]
```

> `default_headers` vem de `from corsheaders.defaults import default_headers`.
> Sem acrescentar o nosso, o preflight recusa o header — e o sintoma é a
> escrita falhando com um erro de CORS que não menciona CSRF nenhum.

`back/backend/tenant/middleware.py` ganha:

```python
class ClienteMiddleware:
    """Exige `X-Brutus-Cliente` em todo verbo que escreve.

    Front e back dividem o mesmo host e diferem so na porta: e cross-ORIGIN
    (o CORS se aplica, e disso cuida a biblioteca) e same-SITE (o SameSite=Lax
    NAO bloqueia). A segunda metade e o buraco — entre origens same-site o Lax
    nao protege nada.

    Este header e a tampa: ele nao esta na lista de cabecalhos simples de CORS,
    entao exigi-lo obriga preflight, e preflight recusado impede o navegador de
    mandar o pedido com credenciais. O valor nao importa e nao e segredo — o
    que protege e a EXIGENCIA dele, nao o conteudo.
    """

    VERBOS_QUE_ESCREVEM = {"POST", "PATCH", "PUT", "DELETE"}
    HEADER = "HTTP_X_BRUTUS_CLIENTE"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in self.VERBOS_QUE_ESCREVEM and self.HEADER not in request.META:
            return JsonResponse({"erro": "pedido sem cliente"}, status=403)
        return self.get_response(request)
```

`MIDDLEWARE` fica assim — a ordem importa e cada posição tem motivo:

```python
MIDDLEWARE = [
    # Primeiro de todos: ele responde o preflight OPTIONS e sai, sem passar
    # pela resolucao de tenant. Preflight nao carrega Host de barbearia.
    "corsheaders.middleware.CorsMiddleware",
    "tenant.middleware.ClienteMiddleware",
    "tenant.middleware.TenantMiddleware",
    "tenant.middleware.BarreiraAdminMiddleware",
]
```

> `ClienteMiddleware` **antes** do `TenantMiddleware` de propósito: um `POST`
> sem o header é recusado sem nem consultar o banco. Recusa barata vem antes
> de trabalho caro.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd back && pytest tests/test_cors.py -v`
Expected: PASS, 17 casos.

- [ ] **Step 6: Commit**

```bash
cd back
git add backend/tenant/config.py backend/tenant/middleware.py backend/backend/settings.py tests/test_cors.py
git commit -m "Deixa o CORS com a biblioteca e guarda so o que e nosso

django-cors-headers, como no Unistock. A adaptacao obrigatoria e que la a
lista de origens e estatica e aqui a origem varia por barbearia — entao e
CORS_ALLOWED_ORIGIN_REGEXES.

O regex deriva de SUBDOMINIOS_RESERVADOS em vez de repetir os nomes: um
reservado novo em config.py fecha a porta no CORS sozinho. Duas listas
param de acompanhar uma a outra em silencio, e o dia em que alguem
registrar 'cdn' e o dia em que se descobre isso.

O que sobra de nosso e o X-Brutus-Cliente. Mesmo host e portas
diferentes e cross-origin E same-site ao mesmo tempo: a primeira metade
pede CORS, a segunda tira do SameSite=Lax qualquer poder entre 3000 e
8000. O header obriga preflight, e e o preflight que protege."
```

---
## Task 10: O canário completo

**Files:**
- Modify: `back/backend/tenant/views.py`
- Modify: `back/tests/test_saude.py`

**Interfaces:**
- Consumes: tudo das Tasks 5, 6 e 9.
- Produces: `GET /api/saude` provando as três coisas de uma vez.

- [ ] **Step 1: Escrever o teste que falha**

Substitua `back/tests/test_saude.py` inteiro:

```python
import pytest

pytestmark = pytest.mark.django_db(databases=["default", "owner"], transaction=True)


def test_traz_o_tenant_resolvido(client, cenario):
    r = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert r.status_code == 200
    assert r.json()["barbearia"] == "Brutus"
    assert r.json()["slug"] == "brutus"


def test_conta_sob_o_rls_e_o_numero_muda_por_barbearia(client, cenario):
    from tenant.models import Barbeiro
    from tenant.rls import com_barbearia

    # A Dom Tony ganha um segundo barbeiro: se o numero fosse global, as duas
    # respostas seriam iguais e o teste passaria sem provar nada.
    import uuid

    Barbeiro.objects.using("owner").create(
        id=str(uuid.uuid4()),
        barbearia_id=cenario["dontony"].id,
        nome="Segundo da Dom Tony",
        whatsapp="11955556666",
        ativo=True,
    )

    um = client.get("/api/saude", headers={"host": "brutus.localhost"}).json()
    dois = client.get("/api/saude", headers={"host": "dontony.localhost"}).json()

    assert um["barbeiros"] == 1
    assert dois["barbeiros"] == 2


def test_o_cookie_vai_e_volta(client, cenario):
    primeira = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert primeira.json()["recebeu_cookie"] is False
    assert primeira.cookies["saude"]["httponly"] is True
    # Host-only: sem atributo domain. E o que faz o cookie atravessar da porta
    # 8000 para a 3000 sem nenhum truque, porque cookie ignora porta.
    assert primeira.cookies["saude"]["domain"] == ""

    segunda = client.get("/api/saude", headers={"host": "brutus.localhost"})
    assert segunda.json()["recebeu_cookie"] is True
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_saude.py -v`
Expected: FAIL — faltam as chaves `slug`, `barbeiros` e `recebeu_cookie`.

- [ ] **Step 3: Implementar**

`back/backend/tenant/views.py`:

```python
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Barbeiro
from .rls import com_barbearia


def saude(request):
    """O canario da fatia 0. Prova tres coisas de uma vez:

    1. o Host virou tenant  -> `slug` e `barbearia`
    2. o RLS escopou        -> `barbeiros`, que muda entre as barbearias
    3. o cookie atravessa   -> `recebeu_cookie`, falso na primeira chamada e
       verdadeiro na segunda

    O cookie e descartavel porque NAO HA LOGIN nesta fatia — a autenticacao e
    a fatia 3. O que esta sendo verificado aqui e o caminho, nao a sessao: se
    um cookie emitido na 8000 volta a partir da 3000, o login de verdade vai
    andar sobre trilho ja testado.
    """
    if request.eh_admin:
        corpo = {"ok": True, "admin": True, "barbearia": None, "slug": None,
                 "barbeiros": None}
    else:
        with com_barbearia(request.barbearia.id):
            quantos = Barbeiro.objects.count()
        corpo = {
            "ok": True,
            "admin": False,
            "barbearia": request.barbearia.nome,
            "slug": request.barbearia.slug,
            "barbeiros": quantos,
        }

    corpo["recebeu_cookie"] = "saude" in request.COOKIES

    resposta = Response(corpo)
    # httponly como toda sessao deste produto. Sem `domain`: host-only e o que
    # faz ele atravessar 8000 -> 3000, ja que cookie ignora porta.
    resposta.set_cookie("saude", "1", httponly=True, samesite="Lax")
    return resposta
```

> A view fica com `@api_view(["GET"])`. Um `POST` nela devolve **405**, e isso
> é o esperado: o teste da Task 9 que manda `POST` com o header afirma
> `!= 403`, e 405 satisfaz — o que ele verifica é que o `ClienteMiddleware`
> deixou passar, não que a rota aceite escrita.

> A view consulta `Barbeiro.objects` — e a varredura da Task 7 **vai falhar**, porque ela não distingue "dentro do `with`" de fora. Acrescente `views.py` a `ISENTOS`? **Não.** Ensine a varredura a enxergar o wrapper: no `_consultas_de_tenant`, ignore os nós cujo ancestral seja um `ast.With` cujo item chame `com_barbearia`. Faça isso agora, no Step 4.

- [ ] **Step 4: Ensinar a varredura a enxergar o wrapper**

Substitua `_consultas_de_tenant` em `back/tests/test_varredura.py`:

```python
def _dentro_do_wrapper(arvore: ast.AST) -> set[int]:
    """Linhas cobertas por um `with com_barbearia(...)`."""
    cobertas: set[int] = set()
    for no in ast.walk(arvore):
        if not isinstance(no, ast.With):
            continue
        chama_wrapper = any(
            isinstance(item.context_expr, ast.Call)
            and isinstance(item.context_expr.func, ast.Name)
            and item.context_expr.func.id == "com_barbearia"
            for item in no.items
        )
        if chama_wrapper:
            for filho in ast.walk(no):
                if hasattr(filho, "lineno"):
                    cobertas.add(filho.lineno)
    return cobertas


def _consultas_de_tenant(caminho: pathlib.Path) -> list[str]:
    arvore = ast.parse(caminho.read_text(encoding="utf-8"))
    cobertas = _dentro_do_wrapper(arvore)
    achados = []
    for no in ast.walk(arvore):
        if (
            isinstance(no, ast.Attribute)
            and no.attr == "objects"
            and isinstance(no.value, ast.Name)
            and no.value.id in MODELS_DE_TENANT
            and no.lineno not in cobertas
        ):
            achados.append(f"{caminho.name}:{no.lineno} {no.value.id}.objects")
    return achados
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd back && pytest -v`
Expected: PASS, tudo. Inclusive a varredura, agora que ela entende o `with`.

- [ ] **Step 6: Provar no navegador, atravessando de verdade**

```bash
cd back && docker compose up -d
cd ../front && docker compose up -d && npm run seed
curl -s -i -H "Origin: http://brutus.localhost:3000" http://brutus.localhost:8000/api/saude
curl -s -H "Origin: http://brutus.localhost:3000" http://dontony.localhost:8000/api/saude
```

Expected: a primeira traz `Set-Cookie: saude=1; HttpOnly`, `Access-Control-Allow-Origin: http://brutus.localhost:3000` e `"barbearia": "Brutus"`. A segunda traz `"barbearia": "Dom Tony"` com **outro** número em `barbeiros`.

- [ ] **Step 7: Commit**

```bash
cd back
git add backend/tenant/views.py tests/test_saude.py tests/test_varredura.py
git commit -m "Fecha o canario: host, RLS e cookie numa resposta so

O cookie e de brinquedo porque nao ha login nesta fatia. O que se verifica
aqui e o caminho, nao a sessao — e o login da fatia 3 vai andar sobre
trilho ja testado.

A varredura aprendeu a enxergar o `with com_barbearia`. Poe views.py em
ISENTOS seria mais rapido e teria cegado ela para o arquivo inteiro."
```

---

## Task 11: O front ganha o interruptor

**Files:**
- Modify: `front/src/lib/api/client.ts`
- Create: `front/tests/client-base.test.ts`
- Modify: `front/.env.example`, `front/docker-compose.yml`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_API_URL`.
- Produces: `baseDe(caminho, migradas?) -> string` e a constante `MIGRADAS`, vazia.

- [ ] **Step 1: Escrever o teste que falha**

`front/tests/client-base.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { baseDe } from '@/lib/api/client';

const EXTERNA = 'http://brutus.localhost:8000';

describe('baseDe', () => {
  it('com a lista vazia, tudo continua no Next', () => {
    expect(baseDe('/painel/agenda', [])).toBe('/api');
    expect(baseDe('/servicos', [])).toBe('/api');
  });

  it('prefixo migrado sai para o Django', () => {
    expect(baseDe('/painel/agenda', ['/painel'])).toBe(`${EXTERNA}/api`);
  });

  it('casa o prefixo exato, e nao por comeco de palavra', () => {
    // Sem esta regra, migrar '/painel' arrastaria junto um '/painelzinho'
    // que ninguem migrou — e o sintoma seria 404 numa rota que existe.
    expect(baseDe('/painelzinho', ['/painel'])).toBe('/api');
    expect(baseDe('/painel', ['/painel'])).toBe(`${EXTERNA}/api`);
  });
});
```

> O teste lê `NEXT_PUBLIC_API_URL`. Acrescente a `front/tests/env.ts`:
> `process.env.NEXT_PUBLIC_API_URL = 'http://brutus.localhost:8000';`

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd front && npm test -- client-base`
Expected: FAIL — `baseDe is not exported`.

- [ ] **Step 3: Implementar**

Em `front/src/lib/api/client.ts`, troque `const BASE = '/api';` por:

```ts
/// A lista de prefixos que o Django ja atende. **Este array e o painel de
/// controle da travessia inteira**: cada fatia acrescenta os seus, e voltar
/// atras e remover uma linha. E tambem o unico lugar onde alguem precisa
/// olhar para responder "quem serve isto hoje?".
export const MIGRADAS: readonly string[] = [];

const API_EXTERNA = process.env.NEXT_PUBLIC_API_URL ?? '';

/// Prefixo casa por segmento, nunca por comeco de string: migrar '/painel'
/// nao pode arrastar '/painelzinho' junto.
export function baseDe(caminho: string, migradas: readonly string[] = MIGRADAS): string {
  const migrada = migradas.some((p) => caminho === p || caminho.startsWith(`${p}/`));
  return migrada ? `${API_EXTERNA}/api` : '/api';
}
```

E dentro de `pedir()`, troque a chamada do `fetch`:

```ts
  const metodo = p.metodo ?? 'GET';

  const r = await fetch(`${baseDe(caminho)}${caminho}${montarBusca(p.busca)}`, {
    method: metodo,
    // Same-origin enquanto a rota for do Next; obrigatorio quando ela for do
    // Django, que esta noutra porta. Inofensivo nos dois casos.
    credentials: 'include',
    headers: {
      ...(temCorpo ? { 'content-type': 'application/json' } : {}),
      // Obriga preflight na escrita. Entre 3000 e 8000 e same-site, e ai o
      // SameSite=Lax nao protege — quem protege e este header mais a
      // allowlist do outro lado.
      ...(metodo === 'GET' ? {} : { 'x-brutus-cliente': 'web' }),
    },
    body: temCorpo ? JSON.stringify(p.corpo) : undefined,
    signal: p.signal,
  });
```

Atualize também o comentário do topo do arquivo, que hoje afirma "as rotas são do próprio Next, na mesma origem" — deixou de ser verdade e comentário que mente é pior que comentário nenhum:

```ts
/// Sem axios de propósito, e isso não mudou com a separação: o cookie
/// continua viajando sozinho porque é `httpOnly` e **host-only**, e cookie
/// ignora porta — front na 3000 e Django na 8000 dividem o mesmo host. O que
/// a separação acrescentou foi `credentials: 'include'`, o header que obriga
/// preflight, e o `baseDe()`. Nenhuma dependência nova.
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd front && npm test`
Expected: PASS — o arquivo novo **e os 30 de antes**. Nenhum comportamento mudou: a lista está vazia, então `baseDe` devolve `/api` para tudo.

- [ ] **Step 5: A variável de ambiente**

`front/.env.example`, ao lado do `NEXT_PUBLIC_DOMINIO_BASE`:

```
# Onde o Django atende. O host e o MESMO do front — muda so a porta, e e isso
# que faz o cookie httpOnly atravessar sem Domain, SameSite=None nem Secure em
# desenvolvimento. Consumida so pelas rotas que ja estao em MIGRADAS
# (src/lib/api/client.ts); com a lista vazia, ninguem le.
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

> **Cuidado:** `NEXT_PUBLIC_API_URL` vai para o navegador, então o host precisa ser o que o **navegador** enxerga. Em dev o front monta a URL a partir do host da página, não desta constante — por isso o valor é `localhost:8000` e não `brutus.localhost:8000`. Quando a primeira fatia migrar, ela precisa montar a origem por barbearia; deixe isso para lá, com a rota que a exigir.

E no `front/docker-compose.yml`, no bloco `environment` do `app`:

```yaml
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8000}
```

- [ ] **Step 6: Commit**

```bash
cd front
git add src/lib/api/client.ts tests/client-base.test.ts tests/env.ts .env.example docker-compose.yml
git commit -m "Poe o interruptor da travessia no client, ainda desligado

MIGRADAS vazia: baseDe devolve '/api' para tudo e nada mudou de
comportamento — os 30 arquivos de teste continuam verdes sem alteracao.

O credentials e o x-brutus-cliente entram agora, e nao junto da primeira
rota migrada: mudanca inofensiva hoje, e uma variavel a menos no dia em
que a primeira rota atravessar.

O comentario do topo do arquivo dizia 'mesma origem'. Deixou de ser
verdade, e comentario que mente e pior que comentario nenhum."
```

---

## Task 12: `worker` e `beat`, com uma tarefa que prova que eles funcionam

**Files:**
- Create: `back/backend/tenant/tasks.py`
- Create: `back/tests/test_celery.py`
- Modify: `back/docker-compose.yml` (serviços `worker` e `beat`)
- Modify: `back/backend/backend/settings.py` (`CELERY_BEAT_SCHEDULE`)

**Interfaces:**
- Consumes: `backend.celery.app` (Task 2); o serviço `redis` (Task 1).
- Produces: a tarefa `tenant.tasks.ping`; os serviços `worker` e `beat`.

**Por que esta tarefa existe, e por que ela é a última.** O `worker` e o `beat` não servem a nada na fatia 0 — o lembrete, o healthcheck do WhatsApp e a poda do zelador são fatia 7. Eles entram agora porque o layout do `Unistock_Back` os traz, e porque a fatia 7 herdar um pipeline **já provado** é a diferença entre depurar Celery e depurar o lembrete, ou os dois ao mesmo tempo.

E entram com uma tarefa de verdade por um motivo que este produto já pagou: o `agendador` existia desde a Etapa 1, estava escrito, estava protegido, e **nunca rodou** — a tela prometia lembrete e ninguém mandava. Contêiner que sobe, loga limpo e não executa nada é o modo de falha mais caro daqui. Um `worker` decorativo é a mesma armadilha com nome novo.

- [ ] **Step 1: Escrever o teste que falha**

`back/tests/test_celery.py`:

```python
from backend.celery import app as celery_app
from tenant.tasks import ping


def test_ping_devolve_pong():
    # Chamada direta: prova a funcao, nao o transporte.
    assert ping() == "pong"


def test_a_tarefa_esta_registrada_no_app():
    # Sem isto, `ping` seria uma funcao comum que ninguem consegue enfileirar —
    # e o sintoma no worker e silencio, nao erro.
    assert "tenant.tasks.ping" in celery_app.tasks


def test_o_beat_tem_o_ping_na_agenda():
    from django.conf import settings

    agenda = settings.CELERY_BEAT_SCHEDULE
    assert "ping" in agenda
    assert agenda["ping"]["task"] == "tenant.tasks.ping"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd back && pytest tests/test_celery.py -v`
Expected: FAIL — `No module named 'tenant.tasks'`.

- [ ] **Step 3: Implementar**

`back/backend/tenant/tasks.py`:

```python
from celery import shared_task


@shared_task
def ping() -> str:
    """A tarefa que existe para provar que o worker executa.

    Ela nao serve ao produto e nao deve crescer: quando a fatia 7 trouxer o
    lembrete, o healthcheck do WhatsApp e a poda do zelador, esta some. O que
    ela garante ate la e que `worker` e `beat` no compose nao sao enfeite —
    que o broker responde, que a tarefa foi descoberta e que a agenda dispara.
    """
    return "pong"
```

Em `back/backend/backend/settings.py`:

```python
# Cadencia alta de proposito: e um sinal de vida, e um sinal de vida que
# aparece uma vez por hora nao serve para descobrir que o beat morreu.
CELERY_BEAT_SCHEDULE = {
    "ping": {"task": "tenant.tasks.ping", "schedule": 60.0},
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd back && pytest tests/test_celery.py -v`
Expected: PASS, 3 casos.

- [ ] **Step 5: Os serviços no compose**

No `back/docker-compose.yml`:

```yaml
  worker:
    build: { context: . }
    # `-Q celery` explicito: fila padrao com nome escrito e uma fila a menos
    # para descobrir no dia em que houver duas.
    command: celery -A backend worker -l info -Q celery
    environment: &ambiente_django
      PGDATABASE: brutus
      PGHOST: db
      PGPORT: "5432"
      DOMINIO_BASE: localhost
      REDIS_URL: redis://redis:6379/1
    volumes: [".:/app"]
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }
    networks: [brutus]

  beat:
    build: { context: . }
    # O agendador de ARQUIVO (padrao do Celery). O django-celery-beat, que
    # guarda a agenda em tabela, e da fatia 7: aqui ele criaria tabela num
    # banco de que o Prisma e dono.
    command: celery -A backend beat -l info --schedule=/tmp/celerybeat-schedule
    environment: *ambiente_django
    volumes: [".:/app"]
    depends_on:
      redis: { condition: service_started }
    networks: [brutus]
```

> A âncora YAML (`&ambiente_django` / `*ambiente_django`) existe porque os dois
> serviços têm exatamente o mesmo ambiente, e duas cópias divergem no dia em
> que alguém edita uma. O `api` não entra na âncora: ele tem `ports` e
> `DJANGO_DEBUG` que os outros dois não têm.

- [ ] **Step 6: Provar que o laço fecha de verdade**

Teste unitário prova a função. Isto prova o **transporte** — que é onde Celery quebra:

```bash
cd back && docker compose up -d worker beat
sleep 70
docker compose logs beat --tail 20 | grep -i "ping"
docker compose logs worker --tail 30 | grep -i "succeeded"
```

Expected: o `beat` mostra ter enviado `tenant.tasks.ping`, e o `worker` mostra `Task tenant.tasks.ping[...] succeeded ... 'pong'`.

**Se o `beat` enviar e o `worker` não executar, não siga.** É exatamente a falha que esta tarefa existe para pegar, e ela é invisível em qualquer teste que não atravesse o Redis.

- [ ] **Step 7: Commit**

```bash
cd back
git add backend/tenant/tasks.py backend/backend/settings.py tests/test_celery.py docker-compose.yml
git commit -m "Sobe worker e beat com uma tarefa que prova que eles rodam

O layout do Unistock traz os dois, e a fatia 7 vai precisar deles para o
lembrete, o healthcheck do WhatsApp e a poda do zelador. Herdar um
pipeline ja provado e a diferenca entre depurar Celery ou depurar o
lembrete — em vez dos dois ao mesmo tempo.

O ping existe porque contentor que sobe, loga limpo e nao executa nada e
o modo de falha mais caro deste produto: o agendador estava escrito e
protegido desde a Etapa 1, nunca rodou, e a tela prometia lembrete que
ninguem mandava. Worker decorativo e a mesma armadilha com nome novo.

O beat usa o agendador de arquivo. O django-celery-beat guarda agenda em
tabela, e o dono deste banco e o Prisma ate a fatia 8."
```

---

## Fechamento da fatia

Com as 12 tarefas verdes, isto é verdade e é verificável:

```bash
cd back  && docker compose up -d && pytest -v
cd ../front && docker compose up -d && npm run seed && npm test
curl -s -H "Origin: http://brutus.localhost:3000" http://brutus.localhost:8000/api/saude
curl -s -H "Origin: http://brutus.localhost:3000" http://dontony.localhost:8000/api/saude
```

- Dois repositórios, dois composes, uma rede.
- O Django sobe **sozinho** e resolve tenant sem o front na frente.
- O RLS escopa, e falha fechado quando alguém esquece o wrapper.
- A varredura estrutural morde — foi vista mordendo.
- A barreira do admin existe dos dois lados.
- O cookie `httpOnly` atravessa 8000 → 3000 sem truque de domínio.
- O `worker` e o `beat` executam uma tarefa de verdade, provada atravessando o Redis.
- **Nenhuma das 34 rotas atravessou**, e a suíte do front continua verde — e continua rodando sem o repositório do back no disco.

A fatia 1 começa mapeando os outros seis models. A escolha de DRF já não é dela: foi decidida aqui, pela referência do `Unistock_Back` (spec §14).
