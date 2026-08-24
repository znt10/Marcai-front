# Fatia 8 — o Prisma sai e o admin fecha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar ao back as três variáveis do admin que ele já lê e ninguém passa, mover o seed e o gerador de hash para management commands do Django, criar o endpoint público de barbearia, e então apagar do front o Prisma, a Evolution e o admin — que já são código morto.

**Architecture:** A travessia front→back já terminou em tráfego: `MIGRADAS` (`Marcai-front/src/lib/api/client.ts`) desvia 33 das 34 rotas do Next para o Django. O que sobrou no front foram os handlers mortos e, com eles, as credenciais que só eles liam. O plano fecha a fiação no back (tarefas 1–4), tira a última dependência de banco do front (tarefas 5–6) e só então apaga (tarefas 7–8). A ordem é obrigatória: a partir da tarefa 7, `MIGRADAS` deixa de ser reversível.

**Tech Stack:** Django 6 + DRF + PyJWT + argon2-cffi + Celery (back); Next 16 + React 19 + vitest (front); Postgres 16 com RLS; Docker Compose com rede externa `brutus`.

**Spec:** `Marcai-front/docs/superpowers/specs/2026-08-24-fatia-8-prisma-sai-e-admin-no-back-design.md`

## Global Constraints

- **Dois repositórios git separados**, sem repo pai: `Marcai-back` (branch `master`) e `Marcai-front` (branch `main`). Cada tarefa diz em qual se trabalha. Commits nunca atravessam os dois.
- **Os dois estão na branch padrão.** Antes do primeiro commit, criar branch em cada repo que for tocado: `git checkout -b fatia-8-prisma-sai`.
- **Caminhos neste plano são relativos à raiz do repositório da tarefa**, não à pasta `marcai/` que contém os dois.
- **Contrato de rota não muda.** Caminho e payload são idênticos dos dois lados — é o que mantém `MIGRADAS` um interruptor até a tarefa 7.
- **Este Next não é o Next conhecido de cor.** `Marcai-front/AGENTS.md` manda ler `node_modules/next/dist/docs/` antes de escrever código. O `node_modules` não existe no host: ou `npm ci`, ou ler de dentro da imagem `marcai-front-app`.
- **Nomes de campo dos models Django são snake_case** (`horario_resumo`, `senha_hash`, `duracao_minima_min`), com `db_column` camelCase por baixo. As respostas HTTP são camelCase.
- **Escrita administrativa usa a conexão `owner`** (`.using("owner")`). A `default` é `brutus_app`, que não tem DDL nem TRUNCATE — e isso é deliberado.
- **Testes do back:** `docker compose run --rm api pytest -q` (preferido) ou `pytest -q` no host com as variáveis `PG*` exportadas.
- **Testes do front:** `npm run test`.

---

### Task 1: A varredura de ambiente do back, e as seis variáveis que ela reprova

Fecha o §2 e o §8.3-item-3 da spec. O back lê `ADMIN_USUARIO`, `ADMIN_SENHA_HASH_B64` e `ADMIN_JWT_SECRET`, e nenhuma das três está no `.env.example` nem no compose — **o login do admin estoura 500 no contêiner hoje**. O comportamento já é testado (`tests/test_admin_auth.py`), mas com `monkeypatch`: um teste que define a variável que vai ler nunca descobre que ninguém a entrega. A prova que faltava é uma varredura de **arquivos**.

**Repo:** `Marcai-back`

**Files:**
- Modify: `tests/test_ambiente.py` (acrescentar ao fim)
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: nada.
- Produces: nada em código. Produz a garantia de que toda variável lida em `backend/` está declarada — as tarefas seguintes dependem dela para não reintroduzir o defeito.

- [ ] **Step 1: Escrever a varredura que falha**

Acrescentar ao fim de `tests/test_ambiente.py`:

```python
import ast

# `DJANGO_SETTINGS_MODULE` e' posta pelo `manage.py` e pelo `pytest.ini`, nunca
# por nos. Documenta-la no .env.example seria mentir sobre quem a define — a
# mesma isencao que `DO_RUNTIME` faz com `NODE_ENV` do lado do front.
DO_RUNTIME = {"DJANGO_SETTINGS_MODULE"}


def _eh_environ(no):
    return isinstance(no, ast.Attribute) and no.attr == "environ"


def _nomes_lidos_em(caminho):
    """Nomes LITERAIS passados a `os.environ[...]` ou `os.environ.get(...)`.

    Por AST e nao por regex, seguindo `test_varredura.py`: `settings.py` monta
    um nome por f-string (`PGPASSWORD_{usuario}`), e uma regex o capturaria
    truncado e exigiria uma declaracao que nao existe. Um `JoinedStr` nao e
    `Constant`, entao ele simplesmente nao entra — o preco e que senha por
    papel fica fora da varredura, e esse e o preco certo: o nome dela so
    existe em tempo de execucao.
    """
    nomes = set()
    for no in ast.walk(ast.parse(caminho.read_text(encoding="utf-8"))):
        if isinstance(no, ast.Subscript) and _eh_environ(no.value):
            if isinstance(no.slice, ast.Constant) and isinstance(no.slice.value, str):
                nomes.add(no.slice.value)
        if (
            isinstance(no, ast.Call)
            and isinstance(no.func, ast.Attribute)
            and no.func.attr == "get"
            and _eh_environ(no.func.value)
            and no.args
            and isinstance(no.args[0], ast.Constant)
            and isinstance(no.args[0].value, str)
        ):
            nomes.add(no.args[0].value)
    return nomes


def test_toda_variavel_lida_em_backend_esta_declarada():
    """O gemeo do `front/tests/ambiente.test.ts`, e a prova que faltava.

    O modo de falha e o §2 da spec: `admin_sessao.py` le `ADMIN_JWT_SECRET` e
    ESTOURA sem ela, mas o `pytest.ini` define `D:ADMIN_JWT_SECRET`, entao a
    suite inteira roda num mundo onde a variavel existe. So um teste que olha
    ARQUIVO — e nunca o ambiente do processo — enxerga o buraco.
    """
    lidas = set()
    for arquivo in (RAIZ / "backend").rglob("*.py"):
        lidas |= _nomes_lidos_em(arquivo)

    exemplo = _ler(".env.example")
    compose = _ler("docker-compose.yml")

    def declarada(nome):
        padrao = re.compile(rf"^\s*{re.escape(nome)}\s*[:=]", re.M)
        return bool(padrao.search(exemplo) or padrao.search(compose))

    nao_declaradas = sorted(n for n in lidas - DO_RUNTIME if not declarada(n))
    assert nao_declaradas == []
```

E acrescentar `import re` ao topo do arquivo, junto de `from pathlib import Path`.

- [ ] **Step 2: Rodar e confirmar que falha com os seis nomes**

Run: `docker compose run --rm api pytest tests/test_ambiente.py::test_toda_variavel_lida_em_backend_esta_declarada -q`

Expected: FAIL. A lista tem **exatamente seis** nomes:

```
AssertionError: assert ['ADMIN_JWT_SECRET', 'ADMIN_SENHA_HASH_B64', 'ADMIN_USUARIO',
                        'PGDATABASE_EVOLUTION', 'PGPASSWORD_EVOLUTION'] == []
```

Os três do admin são o §2. Os dois de `PGDATABASE_EVOLUTION`/`PGPASSWORD_EVOLUTION` são achado da varredura: o banco da Evolution que o zelador lê nunca foi documentado. Se aparecer nome fora desses cinco, **parar e investigar** — é código que mudou depois deste plano.

- [ ] **Step 3: Declarar as três do admin no `.env.example`**

Acrescentar ao fim de `.env.example`:

```
# Admin da plataforma. MUDARAM DE LADO na fatia 8: eram lidas por codigo Next
# (`src/lib/admin-senha.ts`), e hoje quem le e o Django —
# `app/services/admin_senha.py` e `app/services/admin_sessao.py`. O front nao
# tem mais uma linha que as toque.
#
# Sem estas duas o login apenas NEGA (o `conferir_senha` roda o argon2 contra
# um hash descartavel e devolve False), e e assim que se sobe o back sem admin
# configurado. Gerar o hash com `python manage.py admin_hash "senha"`.
#
# O hash vai em BASE64: em claro ele e `$argon2id$v=19$m=...`, e tanto o
# Docker Compose quanto o dotenv expandem `$argon2id` e `$v` como variavel — o
# valor chegaria truncado ao processo, a senha nunca conferiria, e o sintoma
# seria um "usuario ou senha invalidos" que nao explica nada.
ADMIN_USUARIO=""
ADMIN_SENHA_HASH_B64=""

# OBRIGATORIA: `admin_sessao._segredo()` levanta RuntimeError sem ela, de
# proposito — um fallback aceitaria cookie assinado com segredo publico se
# alguem esquecesse a variavel no deploy, sem nada quebrar visivelmente.
#
# Tem que ser IDENTICA a do `.env` do front: o Django EMITE o cookie
# (`AdminLoginView`) e o `proxy.ts` do front o LE para guardar as paginas
# `/admin/*`. Divergir desloga o admin a cada navegacao.
#
# E' DIFERENTE de `SESSAO_JWT_SECRET` de proposito: um cookie de admin
# apresentado ao painel do barbeiro falha na assinatura sem que ninguem
# precise escrever uma checagem para isso. Gerar com
# `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
ADMIN_JWT_SECRET=""
```

- [ ] **Step 4: Declarar as duas da Evolution no `.env.example`**

Acrescentar ao fim de `.env.example`:

```
# O banco da Evolution, que o zelador (fatia 7) le para podar historico. NAO
# alimentam o compose — o servico `evolution` monta a propria URL de conexao
# lá. Existem porque `settings.py` as le para a conexao `evolution` do Django,
# e o `pytest.ini` sobrescreve a primeira com `evolution_test` SEM prefixo
# `D:`, para que a suite nunca toque o banco da Evolution de verdade.
PGDATABASE_EVOLUTION="evolution"
PGPASSWORD_EVOLUTION="evolution"
```

- [ ] **Step 5: Passar as três do admin ao serviço `api` no compose**

Em `docker-compose.yml`, no `environment:` do serviço `api`, logo abaixo da linha `SESSAO_JWT_SECRET: ${SESSAO_JWT_SECRET:?...}`:

```yaml
      # O MESMO valor do .env do front, como o SESSAO_JWT_SECRET acima: o
      # Django emite o cookie do admin e o proxy.ts do front o le.
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET:?defina ADMIN_JWT_SECRET no .env}
      # SEM `:?`, ao contrario da de cima: sem estas duas o login apenas nega,
      # e subir o back sem admin configurado e um estado valido.
      ADMIN_USUARIO: ${ADMIN_USUARIO}
      ADMIN_SENHA_HASH_B64: ${ADMIN_SENHA_HASH_B64}
```

**Não** acrescentar aos serviços `worker` e `beat`: nenhuma tarefa de Celery toca o admin.

- [ ] **Step 6: Rodar a varredura e confirmar que passa**

Run: `docker compose run --rm api pytest tests/test_ambiente.py -q`

Expected: PASS, os cinco testes do arquivo.

- [ ] **Step 7: Confirmar que a suíte inteira continua verde**

Run: `docker compose run --rm api pytest -q`

Expected: PASS.

- [ ] **Step 8: Preencher o `.env` local e provar o login de ponta a ponta**

O `.env` do back já existe e já tem `ADMIN_JWT_SECRET`? Não — ele foi criado antes desta fatia, a partir de um `.env.example` que não as tinha. Acrescentar as três, usando **o mesmo `ADMIN_JWT_SECRET` que já está no `.env` do front** (é o mesmo valor dos dois lados):

```bash
grep -E '^ADMIN_(JWT_SECRET|USUARIO)=' ../Marcai-front/.env >> .env
docker compose run --rm api python manage.py shell -c \
  "import os; print('ADMIN_JWT_SECRET' in os.environ)"
```

Expected: `True`.

- [ ] **Step 9: Commit**

```bash
git checkout -b fatia-8-prisma-sai
git add tests/test_ambiente.py .env.example docker-compose.yml
git commit -m "fix: entrega ao back as variaveis do admin que ele ja lia

O login do admin estourava 500 no conteiner: admin_sessao levanta
RuntimeError sem ADMIN_JWT_SECRET, e nem ela nem ADMIN_USUARIO nem
ADMIN_SENHA_HASH_B64 estavam no .env.example ou no compose.

Passou despercebido porque o pytest.ini define D:ADMIN_JWT_SECRET — a
suite rodava num mundo onde a variavel existe. A varredura nova olha
ARQUIVO e nunca o ambiente do processo, que e a unica forma de ver o
buraco. Ela achou de quebra PGDATABASE_EVOLUTION e PGPASSWORD_EVOLUTION,
tambem nunca documentadas."
```

---

### Task 2: O pacote de management commands e `manage.py admin_hash`

O `npm run admin:hash` morre na tarefa 7, e ele é a **única** forma de gerar `ADMIN_SENHA_HASH_B64`. O substituto precisa existir antes. O back não tem nenhum management command hoje — esta tarefa paga o scaffolding do pacote.

**Repo:** `Marcai-back`

**Files:**
- Create: `backend/app/management/__init__.py`
- Create: `backend/app/management/commands/__init__.py`
- Create: `backend/app/management/commands/admin_hash.py`
- Create: `tests/test_comandos.py`

**Interfaces:**
- Consumes: `app.services.senha.gerar(senha: str) -> str` (hash argon2id codificado), já existente.
- Produces: `python manage.py admin_hash "<senha>"` imprime `ADMIN_SENHA_HASH_B64="<base64>"`. A Task 3 reusa o pacote `backend/app/management/commands/`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_comandos.py`:

```python
import base64
from io import StringIO

from django.core.management import call_command

from app.services.senha import confere


def test_admin_hash_imprime_a_linha_do_env_pronta():
    """A saida e' colavel no .env: `ADMIN_SENHA_HASH_B64="..."`. Imprimir so o
    hash cru obrigaria quem usa a lembrar do base64 — e esquecer o base64 e
    exatamente o defeito que o formato existe para evitar."""
    saida = StringIO()
    call_command("admin_hash", "batata-frita", stdout=saida)

    linha = saida.getvalue().strip()
    assert linha.startswith('ADMIN_SENHA_HASH_B64="')
    assert linha.endswith('"')


def test_admin_hash_produz_um_hash_que_confere_a_senha():
    """A prova que importa: o que sai daqui e' lido por `admin_senha.py`, que
    faz base64-decode e passa a `confere`. Se as duas pontas discordarem do
    formato, o login nega uma senha certa e nada mais quebra."""
    saida = StringIO()
    call_command("admin_hash", "batata-frita", stdout=saida)

    b64 = saida.getvalue().strip().removeprefix('ADMIN_SENHA_HASH_B64="').removesuffix('"')
    hash_em_claro = base64.b64decode(b64).decode("utf-8")

    assert confere(hash_em_claro, "batata-frita")
    assert not confere(hash_em_claro, "outra-senha")


def test_admin_hash_gera_hash_diferente_a_cada_chamada():
    """Argon2 sorteia sal. Dois hashes iguais para a mesma senha denunciariam
    sal fixo, que e' o defeito que torna tabela arco-iris viavel."""
    primeira, segunda = StringIO(), StringIO()
    call_command("admin_hash", "batata-frita", stdout=primeira)
    call_command("admin_hash", "batata-frita", stdout=segunda)

    assert primeira.getvalue() != segunda.getvalue()
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `docker compose run --rm api pytest tests/test_comandos.py -q`

Expected: FAIL com `CommandError: Unknown command: 'admin_hash'`.

- [ ] **Step 3: Criar o pacote**

```bash
mkdir -p backend/app/management/commands
touch backend/app/management/__init__.py backend/app/management/commands/__init__.py
```

- [ ] **Step 4: Escrever o comando**

Criar `backend/app/management/commands/admin_hash.py`:

```python
import base64

from django.core.management.base import BaseCommand

from app.services.senha import gerar


class Command(BaseCommand):
    """Substitui o `npm run admin:hash` do front, apagado na fatia 8.

    Mora aqui porque e' aqui que o argon2 passou a viver (`argon2-cffi`; o
    `@node-rs/argon2` saiu junto com o Prisma) e porque a variavel que ele
    gera e' lida por `app/services/admin_senha.py`. Sem ele, girar a senha do
    admin exigiria escrever Python a mao.
    """

    help = 'Gera a linha ADMIN_SENHA_HASH_B64 do .env a partir de uma senha.'

    def add_arguments(self, parser):
        parser.add_argument("senha", help="A senha em claro do admin da plataforma.")

    def handle(self, *args, **opcoes):
        # BASE64, e nao o hash em claro: ele e' `$argon2id$v=19$m=...`, e tanto
        # o Compose quanto o dotenv expandem `$argon2id` e `$v` como variavel.
        # O valor chegaria truncado ao processo e a senha nunca conferiria.
        bruto = gerar(opcoes["senha"])
        b64 = base64.b64encode(bruto.encode("utf-8")).decode("ascii")
        self.stdout.write(f'ADMIN_SENHA_HASH_B64="{b64}"')
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `docker compose run --rm api pytest tests/test_comandos.py -q`

Expected: PASS, 3 testes.

- [ ] **Step 6: Provar na mão e preencher o `.env`**

```bash
docker compose run --rm api python manage.py admin_hash "troca-essa-senha"
```

Copiar a linha para o `.env` do back, substituindo o `ADMIN_SENHA_HASH_B64=""` vazio.

- [ ] **Step 7: Commit**

```bash
git add backend/app/management tests/test_comandos.py
git commit -m "feat: manage.py admin_hash, substituto do npm run admin:hash

Primeiro management command do repo — o pacote nasce aqui e a Task 3
(semear) o reusa. O front perde o gerador de hash na fatia 8, e sem
substituto nao haveria como girar a senha do admin."
```

---

### Task 3: `manage.py semear`

`prisma/seed.ts` (145 linhas) é apagado na tarefa 8, e é a **única** forma de popular um banco novo. A fatia 0 apoiava nele a liberdade de derrubar e recriar o banco. Apagar sem substituto não deixa teste vermelho — deixa banco vazio e tela em branco.

Esta tarefa acontece **enquanto os dois coexistem**: é a única janela em que dá para comparar o estado que cada um produz (§10 da spec).

**Repo:** `Marcai-back`

**Files:**
- Create: `backend/app/management/commands/semear.py`
- Modify: `tests/test_comandos.py` (acrescentar ao fim)

**Interfaces:**
- Consumes: `app.services.senha.gerar`; os models de `tenant.models` (`Barbearia`, `Barbeiro`, `Servico`, `BarbeiroServico`, `HorarioTrabalho`, `Bloqueio`, `Cliente`).
- Produces: `python manage.py semear` — dois tenants (`brutus`, `dontony`), idempotente.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `tests/test_comandos.py`:

```python
import pytest

from tenant.models import Barbearia, Barbeiro, BarbeiroServico, HorarioTrabalho, Servico


@pytest.mark.django_db(transaction=True)
def test_semear_cria_os_dois_tenants():
    """Dois tenants, e nao um: a barbearia-controle `dontony` existe para que
    o isolamento seja demonstravel na mao — logar na BRUTUS e nao ver nada
    dela. Um seed de um tenant so tornaria o RLS indistinguivel de um WHERE
    esquecido."""
    call_command("semear", verbosity=0)

    slugs = set(Barbearia.objects.using("owner").values_list("slug", flat=True))
    assert slugs == {"brutus", "dontony"}


@pytest.mark.django_db(transaction=True)
def test_semear_e_idempotente():
    """Rodar duas vezes nao pode duplicar. O seed do Prisma garantia isso com
    um TRUNCATE na entrada, e este faz o mesmo — vale o mesmo aviso: ele
    APAGA o que estiver la."""
    call_command("semear", verbosity=0)
    call_command("semear", verbosity=0)

    assert Barbearia.objects.using("owner").count() == 2
    assert Barbeiro.objects.using("owner").filter(barbearia__slug="brutus").count() == 3
    assert Servico.objects.using("owner").filter(barbearia__slug="brutus").count() == 4


@pytest.mark.django_db(transaction=True)
def test_semear_deixa_o_convite_pendente_da_duda():
    """`senha_hash=None` e' o estado que o wireframe 3e desenha (convite
    pendente). Semear todo mundo com senha deixaria a tela de convite sem
    caso para exercitar."""
    call_command("semear", verbosity=0)

    duda = Barbeiro.objects.using("owner").get(barbearia__slug="brutus", nome="Duda")
    assert duda.senha_hash is None


@pytest.mark.django_db(transaction=True)
def test_semear_nao_da_pezinho_ao_rael():
    """Ausencia DE PROPOSITO no seed do Prisma: e' o caso que prova que a
    grade de servico por barbeiro e' consultada, e nao assumida. Portar o
    seed sem esta lacuna apagaria o unico cenario negativo que ele tinha."""
    call_command("semear", verbosity=0)

    servicos_do_rael = set(
        BarbeiroServico.objects.using("owner")
        .filter(barbeiro__nome="Rael")
        .values_list("servico__nome", flat=True)
    )
    assert "Pezinho" not in servicos_do_rael
    assert servicos_do_rael == {"Corte", "Barba", "Corte + Barba"}


@pytest.mark.django_db(transaction=True)
def test_semear_da_duracoes_diferentes_aos_dois_barbeiros():
    """Duracoes iguais esconderiam um bug que ignora a duracao por barbeiro.
    O seed do Prisma as fez diferentes de proposito."""
    call_command("semear", verbosity=0)

    def duracao(nome_barbeiro, nome_servico):
        return (
            BarbeiroServico.objects.using("owner")
            .get(barbeiro__nome=nome_barbeiro, servico__nome=nome_servico)
            .duracao_min
        )

    assert duracao("Téo", "Corte") == 40
    assert duracao("Rael", "Corte") == 30


@pytest.mark.django_db(transaction=True)
def test_semear_da_expediente_de_seg_a_sab_ao_teo_e_ter_a_sab_ao_rael():
    """Grades diferentes: sem isso, "o barbeiro nao trabalha nesse dia" nunca
    aparece na tela em desenvolvimento."""
    call_command("semear", verbosity=0)

    def dias(nome):
        return set(
            HorarioTrabalho.objects.using("owner")
            .filter(barbeiro__nome=nome)
            .values_list("dia_semana", flat=True)
        )

    assert dias("Téo") == {1, 2, 3, 4, 5, 6}
    assert dias("Rael") == {2, 3, 4, 5, 6}
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `docker compose run --rm api pytest tests/test_comandos.py -q`

Expected: FAIL com `CommandError: Unknown command: 'semear'` nos 6 testes novos; os 3 do `admin_hash` continuam passando.

- [ ] **Step 3: Escrever o comando**

Criar `backend/app/management/commands/semear.py`:

```python
from django.core.management.base import BaseCommand, CommandError
from django.db import connections

from app.services.senha import gerar
from tenant.models import (
    Barbearia,
    Barbeiro,
    BarbeiroServico,
    Bloqueio,
    Cliente,
    HorarioTrabalho,
    Servico,
)

SEG_A_SAB = [1, 2, 3, 4, 5, 6]
TER_A_SAB = [2, 3, 4, 5, 6]

# A ordem importa: dependente antes de dependencia, senao o CASCADE faz o
# trabalho por acidente e a lista para de documentar o grafo.
TABELAS = [
    '"Agendamento"', '"Cliente"', '"Bloqueio"', '"HorarioTrabalho"',
    '"BarbeiroServico"', '"Servico"', '"Barbeiro"', '"Barbearia"',
]


class Command(BaseCommand):
    """Porta de `prisma/seed.ts`, apagado na fatia 8.

    Roda pela conexao `owner` por dois motivos que se somam: `brutus_app` nao
    tem TRUNCATE (deliberado — o papel do runtime nao deve esvaziar tabela) e
    o RLS filtraria as escritas de dois tenants diferentes. `owner` e' isento
    pela politica `owner_irrestrito`.
    """

    help = "Popula o banco com os dois tenants de desenvolvimento. APAGA o que estiver la."

    def handle(self, *args, **opcoes):
        # O `throw` de NODE_ENV=production do seed do Prisma vira isto. A senha
        # conhecida abaixo e' o motivo: sem a trava, um `semear` distraido em
        # producao poe `123456` em toda conta de barbeiro.
        from django.conf import settings

        if not settings.DEBUG:
            raise CommandError(
                "semear so roda com DJANGO_DEBUG=1: ele cria senha conhecida."
            )

        with connections["owner"].cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {', '.join(TABELAS)} RESTART IDENTITY CASCADE")

        # Senha conhecida, so no seed (cliente §5.5): sem ela o painel nasce
        # intestavel — os dois papeis existem e nenhum dos dois entra.
        senha = gerar("123456")

        self._brutus(senha)
        self._dom_tony(senha)

        self.stdout.write("Seed pronto: brutus.localhost:3000 e dontony.localhost:3000")

    def _brutus(self, senha):
        brutus = Barbearia.objects.using("owner").create(
            slug="brutus", nome="BRUTUS", endereco="Rua Aurora, 88",
            horario_resumo="seg a sáb, 9h–20h", whatsapp_contato="11988887777",
        )

        servicos = {}
        for nome, mini, sugerida, ordem in [
            ("Corte", 20, 40, 0),
            ("Barba", 15, 30, 1),
            ("Corte + Barba", 40, 60, 2),
            ("Pezinho", 10, 15, 3),
        ]:
            servicos[nome] = Servico.objects.using("owner").create(
                barbearia=brutus, nome=nome, duracao_minima_min=mini,
                duracao_sugerida_min=sugerida, ordem=ordem,
            )

        teo = Barbeiro.objects.using("owner").create(
            barbearia=brutus, nome="Téo", whatsapp="11911112222",
            papel="DONO", senha_hash=senha, ordem=0,
        )
        rael = Barbeiro.objects.using("owner").create(
            barbearia=brutus, nome="Rael", whatsapp="11933334444",
            papel="BARBEIRO", senha_hash=senha, ordem=1,
        )
        # Convite pendente — o estado que o wireframe 3e desenha.
        Barbeiro.objects.using("owner").create(
            barbearia=brutus, nome="Duda", whatsapp="11955556666",
            papel="BARBEIRO", senha_hash=None, ordem=2,
        )

        # Duracoes DIFERENTES de proposito: se um bug ignorar a duracao por
        # barbeiro, aparece na primeira tela aberta. E o Rael NAO faz pezinho —
        # linha ausente de proposito, e' o unico caso negativo do seed.
        for barbeiro, nome_servico, minutos in [
            (teo, "Corte", 40), (teo, "Barba", 30),
            (teo, "Corte + Barba", 60), (teo, "Pezinho", 15),
            (rael, "Corte", 30), (rael, "Barba", 45),
            (rael, "Corte + Barba", 60),
        ]:
            BarbeiroServico.objects.using("owner").create(
                barbearia=brutus, barbeiro=barbeiro,
                servico=servicos[nome_servico], duracao_min=minutos,
            )

        for dia in SEG_A_SAB:
            HorarioTrabalho.objects.using("owner").create(
                barbearia=brutus, barbeiro=teo, dia_semana=dia,
                minutos_inicio=9 * 60, minutos_fim=20 * 60,
            )
        for dia in TER_A_SAB:
            HorarioTrabalho.objects.using("owner").create(
                barbearia=brutus, barbeiro=rael, dia_semana=dia,
                minutos_inicio=10 * 60, minutos_fim=19 * 60,
            )

        for barbeiro in (teo, rael):
            for dia in SEG_A_SAB:
                Bloqueio.objects.using("owner").create(
                    barbearia=brutus, barbeiro=barbeiro, motivo="ALMOCO",
                    repete_semanalmente=True, dia_semana=dia,
                    minutos_inicio=12 * 60, minutos_fim=13 * 60,
                )

    def _dom_tony(self, senha):
        """Barbearia-controle, nada em comum com a BRUTUS. E' com o login do
        Tony que se prova, na mao, que o cookie da BRUTUS nao a abre."""
        dom_tony = Barbearia.objects.using("owner").create(
            slug="dontony", nome="Dom Tony", endereco="Av. Central, 12",
            horario_resumo="ter a sáb, 10h–19h", whatsapp_contato="11955554444",
        )
        corte = Servico.objects.using("owner").create(
            barbearia=dom_tony, nome="Corte social",
            duracao_minima_min=25, duracao_sugerida_min=50,
        )
        tony = Barbeiro.objects.using("owner").create(
            barbearia=dom_tony, nome="Tony", whatsapp="11977778888",
            papel="DONO", senha_hash=senha,
        )
        BarbeiroServico.objects.using("owner").create(
            barbearia=dom_tony, barbeiro=tony, servico=corte, duracao_min=50,
        )
        for dia in TER_A_SAB:
            HorarioTrabalho.objects.using("owner").create(
                barbearia=dom_tony, barbeiro=tony, dia_semana=dia,
                minutos_inicio=10 * 60, minutos_fim=19 * 60,
            )
        Cliente.objects.using("owner").create(
            barbearia=dom_tony, nome="Jorge Dom Tony", whatsapp="11912121212",
        )
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `docker compose run --rm api pytest tests/test_comandos.py -q`

Expected: PASS, 9 testes.

- [ ] **Step 5: Comparar o banco dos dois seeds — a janela que não volta**

Este passo é o §10 da spec e **não pode ser pulado**: depois da tarefa 8 não há mais com o que comparar.

```bash
# 1. Semear pelo Prisma (o original), do repo do front
cd ../Marcai-front && npm run seed

# 2. Fotografar o estado
cd ../Marcai-back && docker compose exec -T db psql -U brutus_owner -d brutus -c \
  'SELECT slug, nome, endereco, "horarioResumo", "whatsappContato" FROM "Barbearia" ORDER BY slug' \
  > /tmp/prisma-barbearia.txt
docker compose exec -T db psql -U brutus_owner -d brutus -c \
  'SELECT b.nome, b.papel, b.ordem, (b."senhaHash" IS NULL) AS sem_senha FROM "Barbeiro" b ORDER BY b.nome' \
  > /tmp/prisma-barbeiro.txt
docker compose exec -T db psql -U brutus_owner -d brutus -c \
  'SELECT bs."duracaoMin", s.nome, b.nome FROM "BarbeiroServico" bs JOIN "Servico" s ON s.id=bs."servicoId" JOIN "Barbeiro" b ON b.id=bs."barbeiroId" ORDER BY b.nome, s.nome' \
  > /tmp/prisma-grade.txt

# 3. Semear pelo Django e refotografar nos mesmos comandos
docker compose run --rm api python manage.py semear
# (repetir os tres psql acima para /tmp/django-*.txt)

# 4. Comparar
diff /tmp/prisma-barbearia.txt /tmp/django-barbearia.txt
diff /tmp/prisma-barbeiro.txt  /tmp/django-barbeiro.txt
diff /tmp/prisma-grade.txt     /tmp/django-grade.txt
```

Expected: os três `diff` sem saída. Qualquer divergência é bug do `semear` — corrigir aqui, não depois.

- [ ] **Step 6: Commit**

```bash
git add backend/app/management/commands/semear.py tests/test_comandos.py
git commit -m "feat: manage.py semear, porte de prisma/seed.ts

O seed do Prisma e a unica forma de popular um banco novo, e ele e
apagado na fatia 8. Portado agora, enquanto os dois coexistem — a unica
janela em que da para comparar o estado que cada um produz.

Preserva as ausencias de proposito do original: Duda sem senha (convite
pendente), Rael sem pezinho, duracoes diferentes por barbeiro."
```

---

### Task 4: `GET /api/barbearia`

O único endpoint novo da fatia. Três Server Components do front chamam `barbeariaAtual()`, que hoje vai ao Prisma; o Django serve o agendamento por código, mas **não** a barbearia pública — só `painel/barbearia`, que exige sessão de barbeiro.

**Repo:** `Marcai-back`

**Files:**
- Create: `backend/app/api/v1/views/barbearia.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `tests/test_barbearia_publica.py`

**Interfaces:**
- Consumes: `app.services.barbearia.ler(barbearia_id) -> dict` com as chaves `nome`, `endereco`, `horario_resumo`, `whatsapp_contato`; o mixin `ExigeTenant`.
- Produces: `GET /api/barbearia` → `{"nome", "endereco", "horarioResumo", "whatsappContato"}`. A Task 5 consome exatamente essas quatro chaves.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/test_barbearia_publica.py`:

```python
import pytest

pytestmark = pytest.mark.django_db(transaction=True)


def test_devolve_a_barbearia_do_host(client, brutus):
    """Sem parametro de slug: aqui o tenant E' o Host, como em todo o resto do
    back. Um `?slug=` seria um seletor de barbearia por querystring — o
    defeito exato que o `baseDe()` do front existe para nao cometer."""
    r = client.get("/api/barbearia", HTTP_HOST="brutus.localhost")

    assert r.status_code == 200
    assert r.json() == {
        "nome": "BRUTUS",
        "endereco": "Rua Aurora, 88",
        "horarioResumo": "seg a sáb, 9h–20h",
        "whatsappContato": "11988887777",
    }


def test_camelcase_no_corpo(client, brutus):
    """O contrato repete o do Next ao pe da letra: a home ja le
    `b.horarioResumo`. Devolver snake_case quebraria a tela sem erro nenhum."""
    corpo = client.get("/api/barbearia", HTTP_HOST="brutus.localhost").json()

    assert "horarioResumo" in corpo
    assert "horario_resumo" not in corpo


def test_404_de_host_que_nao_e_tenant(client, brutus):
    """`localhost` puro nao e' barbearia nenhuma. O `ExigeTenant` responde 404,
    e nao 400: de um host sem tenant, esta rota nao existe."""
    assert client.get("/api/barbearia", HTTP_HOST="localhost").status_code == 404


def test_404_do_host_do_admin(client, brutus):
    """A BarreiraAdminMiddleware garante por posicao que rota de tenant nao e'
    alcancavel de `admin.localhost`."""
    assert client.get("/api/barbearia", HTTP_HOST="admin.localhost").status_code == 404


def test_404_de_barbearia_inativa(client, brutus):
    """`ativo=False` some do ar. O `findFirst` do Prisma filtrava por ele, e
    perder o filtro publicaria barbearia desativada — sem erro, sem log."""
    from tenant.models import Barbearia

    Barbearia.objects.using("owner").filter(slug="brutus").update(ativo=False)

    assert client.get("/api/barbearia", HTTP_HOST="brutus.localhost").status_code == 404


def test_horario_resumo_nulo_sai_como_none(client, brutus):
    """A coluna e' nullable ate o dono escrever a frase. A home ja trata o
    nulo (`b.horarioResumo ? ... : ''`); o que ela nao pode receber e' a
    string "None"."""
    from tenant.models import Barbearia

    Barbearia.objects.using("owner").filter(slug="brutus").update(horario_resumo=None)

    assert client.get("/api/barbearia", HTTP_HOST="brutus.localhost").json()["horarioResumo"] is None
```

**Antes de escrever:** conferir em `tests/conftest.py` o nome real da fixture que cria a BRUTUS e o padrão de chamada com `HTTP_HOST` — `tests/test_barbeiros.py` é o exemplo mais próximo (rota pública, mesmo mixin). Se a fixture não se chamar `brutus`, ajustar as seis assinaturas.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `docker compose run --rm api pytest tests/test_barbearia_publica.py -q`

Expected: FAIL — 404 em tudo, porque a rota não existe.

- [ ] **Step 3: Escrever a view**

Criar `backend/app/api/v1/views/barbearia.py`:

```python
from rest_framework.response import Response
from rest_framework.views import APIView

from app.api.v1.mixins import ExigeTenant
from app.services.barbearia import ler


class BarbeariaView(ExigeTenant, APIView):
    """GET /api/barbearia — a vitrine do tenant, sem sessao.

    Irma de `BarbeariaPainelView`, e nao a mesma view com o mixin trocado: o
    painel LE E ESCREVE (PATCH do dono) e responde a equipe logada; esta so'
    le e responde a qualquer um. Juntar as duas faria uma rota publica passar
    a carregar um metodo de escrita, e o proximo a mexer teria de conferir o
    mixin para saber quem alcanca o que.

    O envelope repete o do `barbeariaAtual()` do Next ao pe da letra — as tres
    paginas ja leem `b.nome`, `b.endereco`, `b.horarioResumo` e
    `b.whatsappContato`. `id` NAO sai: quem o usava era o `comBarbearia(b.id,
    ...)` do RLS, que morre com o Prisma. Publicar id de tenant sem consumidor
    seria superficie a toa.
    """

    def get(self, request):
        dados = ler(self.barbearia_id)
        return Response(
            {
                "nome": dados["nome"],
                "endereco": dados["endereco"],
                "horarioResumo": dados["horario_resumo"],
                "whatsappContato": dados["whatsapp_contato"],
            }
        )
```

- [ ] **Step 4: Registrar no router**

Em `backend/app/api/v1/router.py`, acrescentar ao import block das views:

```python
from .views.barbearia import BarbeariaView
```

E na lista de `urlpatterns`, junto das outras rotas públicas (perto de `path("barbeiros", ...)`):

```python
    # Fatia 8 — a vitrine do tenant, que era `barbeariaAtual()` no Prisma do
    # front. Publica: as tres paginas que a consomem (home, convite,
    # agendamento por codigo) sao alcancadas sem sessao.
    path("barbearia", BarbeariaView.as_view(), name="barbearia"),
```

**Atenção:** `barbearia` e `painel/barbearia` são prefixos diferentes e não se arrastam — o casamento do `MIGRADAS` é por segmento.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `docker compose run --rm api pytest tests/test_barbearia_publica.py -q`

Expected: PASS, 6 testes.

- [ ] **Step 6: Rodar a suíte inteira**

Run: `docker compose run --rm api pytest -q`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/views/barbearia.py backend/app/api/v1/router.py tests/test_barbearia_publica.py
git commit -m "feat: GET /api/barbearia, a vitrine publica do tenant

Ultimo endpoint que faltava para o front largar o Prisma: tres Server
Components chamam barbeariaAtual(), e o Django so servia a versao do
painel, que exige sessao de barbeiro."
```

---

### Task 5: `lib/tenant.ts` fala com o Django

O front para de tocar o banco. A partir daqui `DATABASE_URL` não tem mais leitor vivo no front.

**Repo:** `Marcai-front`

**Files:**
- Modify: `src/lib/tenant.ts`
- Modify: `src/lib/api/client.ts` (acrescentar `/barbearia` a `MIGRADAS`)
- Modify: `src/app/agendamento/[codigo]/page.tsx`
- Modify: `tests/client-base.test.ts`
- Create: `tests/barbearia-atual.test.ts`

**Interfaces:**
- Consumes: `GET /api/barbearia` da Task 4 → `{nome, endereco, horarioResumo, whatsappContato}`.
- Produces: `barbeariaAtual(): Promise<Barbearia>` onde `Barbearia = {nome: string; endereco: string; horarioResumo: string | null; whatsappContato: string}`. **Sem `id`** — o campo morre com o RLS. `comBarbearia` e `comBarbeariaAdmin` deixam de existir.

- [ ] **Step 1: Ler a documentação do Next 16 sobre fetch em Server Component**

`AGENTS.md` manda. Ler, em `node_modules/next/dist/docs/`, o que cobre `fetch` e cache em Server Components — o comportamento de cache mudou e `barbeariaAtual()` depende dele para não bater no Django uma vez por componente.

Se `node_modules` não existir no host: `npm ci`.

- [ ] **Step 2: Escrever o teste de `MIGRADAS` que falha**

Acrescentar a `tests/client-base.test.ts`:

O arquivo já tem um helper `comHost(hostname)` que faz `vi.stubGlobal('window', ...)` — `baseDe` lança sem `window`, de propósito. Usá-lo. Acrescentar dentro do `describe('baseDe', ...)`:

```ts
  it('fatia 8: /barbearia publico e /painel/barbearia sao INDEPENDENTES', () => {
    // O mesmo par que /servicos e /painel/servicos formam: se chamam igual e
    // fazem coisas diferentes (a vitrine que qualquer um ve vs. o cadastro
    // que a equipe edita). O casamento e por segmento, entao cada entrada
    // casa por si — mas o nome parecido e' exatamente o que faz alguem
    // supor que uma cobre a outra.
    comHost('brutus.localhost');
    expect(baseDe('/barbearia')).toBe('http://brutus.localhost:8000/api');
    expect(baseDe('/painel/barbearia')).toBe('http://brutus.localhost:8000/api');
  });

  it('fatia 8: /barbearia nao e pego por /barbearias', () => {
    // '/admin/barbearias' (plural, sob /admin) e '/barbearia' (singular) sao
    // rotas distintas. Nenhuma das duas pode arrastar a outra.
    comHost('brutus.localhost');
    expect(baseDe('/barbearias', ['/barbearia'])).toBe('/api');
  });
```

**Nota:** a segunda asserção usa a lista literal `['/barbearia']` em vez de `MIGRADAS`, seguindo o padrão do arquivo — asserções sobre a regra de casamento passam lista explícita; asserções sobre o estado real da lista chamam `baseDe` com um argumento só.

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm run test -- client-base`

Expected: FAIL no primeiro `it` — `baseDe('/barbearia')` devolve `/api`.

- [ ] **Step 4: Acrescentar `/barbearia` a `MIGRADAS`**

Em `src/lib/api/client.ts`, na lista `MIGRADAS`, ao fim:

```ts
  // Fatia 8 — a vitrine publica do tenant. Nasceu no Django; nunca houve
  // handler do Next para ela. IRMA de '/painel/barbearia', que ja esta acima:
  // os dois prefixos sao independentes (o casamento e por segmento), mas se
  // chamam parecido o bastante para confundir quem lê a lista com pressa.
  '/barbearia',
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm run test -- client-base`

Expected: PASS.

- [ ] **Step 6: Escrever o teste de `barbeariaAtual` que falha**

Criar `tests/barbearia-atual.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `next/headers` so existe dentro do runtime do Next. O que importa provar
// aqui e a MONTAGEM DA ORIGEM: `barbeariaAtual` roda em Server Component,
// onde nao ha `window`, entao ela nao pode passar por `pedir()` — que lanca
// sem `window` de proposito (client.ts). Este e o erro que o §4 da spec
// chama de "o detalhe que morde".
const headersMock = vi.fn();
vi.mock('next/headers', () => ({ headers: () => headersMock() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

describe('barbeariaAtual', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('monta a origem do Django a partir do host da requisicao', async () => {
    const fetchFalso = vi.fn(async () => new Response(
      JSON.stringify({ nome: 'BRUTUS', endereco: 'Rua Aurora, 88',
                       horarioResumo: 'seg a sáb, 9h–20h', whatsappContato: '11988887777' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchFalso);
    headersMock.mockReturnValue(new Headers({ host: 'brutus.localhost:3000' }));

    const { barbeariaAtual } = await import('@/lib/tenant');
    const b = await barbeariaAtual();

    expect(b.nome).toBe('BRUTUS');
    // A PORTA muda, o HOST nao: e assim que dontony.localhost:3000 cai em
    // dontony.localhost:8000 sem nenhuma lista de tenants no front.
    expect(fetchFalso.mock.calls[0][0]).toBe('http://brutus.localhost:8000/api/barbearia');
  });

  it('vira notFound quando o Django responde 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    headersMock.mockReturnValue(new Headers({ host: 'naoexiste.localhost:3000' }));

    const { barbeariaAtual } = await import('@/lib/tenant');

    await expect(barbeariaAtual()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `npm run test -- barbearia-atual`

Expected: FAIL — `tenant.ts` ainda importa `@prisma/client`.

- [ ] **Step 8: Reescrever `src/lib/tenant.ts`**

Substituir o arquivo inteiro:

```ts
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

/// A vitrine do tenant, servida pelo Django desde a fatia 8. Este modulo era
/// o ultimo do front a tocar o banco; o Prisma saiu com ele.
///
/// `comBarbearia`/`comBarbeariaAdmin` — os dois wrappers de RLS que viviam
/// aqui — nao foram portados: quem seta `app.barbearia_id` agora e o Django
/// (`tenant/rls.py`). O RLS continua existindo, ele e do BANCO, nao do
/// framework.

export type Barbearia = {
  nome: string;
  endereco: string;
  /// Nulo ate o dono escrever a frase. A home ja trata (`b.horarioResumo ? ...`).
  horarioResumo: string | null;
  whatsappContato: string;
};

/// Reexportada daqui porque e daqui que o resto do sistema a le. A
/// implementacao mora em `./slug` para que o `proxy.ts` a importe sem
/// arrastar mais nada junto — era o Prisma antes, e a separacao continua
/// valendo por higiene do bundle Edge.
export { extrairSlug } from './slug';

const PORTA_API = process.env.NEXT_PUBLIC_API_URL || '8000';

/// A origem do Django PARA ESTE TENANT, montada a partir do `host` da
/// requisicao.
///
/// NAO passa por `pedir()` de `lib/api/client.ts`, e isso e deliberado:
/// aquele monta a origem a partir de `window.location` e LANCA sem `window`.
/// Server Component nao tem `window`. O host aqui vem do header da propria
/// requisicao, que e a fonte equivalente do lado do servidor.
async function origemDoTenant(): Promise<string> {
  const host = (await headers()).get('host');
  if (!host) notFound();
  // `host` traz a porta do FRONT (3000); o Django atende noutra. Trocar so a
  // porta e o que preserva o tenant — o host E o tenant aqui.
  const semPorta = host.split(':')[0];
  return `http://${semPorta}:${PORTA_API}`;
}

/// Envolvida em `cache()` do React: varias chamadas na MESMA requisicao batem
/// no Django uma vez so. Era o mesmo desenho quando a consulta era ao Prisma;
/// o que mudou foi so o outro lado do fio.
export const barbeariaAtual = cache(async (): Promise<Barbearia> => {
  const r = await fetch(`${await origemDoTenant()}/api/barbearia`, {
    // Sem cache entre requisicoes: o dono edita a frase do horario no painel e
    // precisa ver o resultado. O `cache()` acima ja resolve a repeticao dentro
    // de uma requisicao, que era o unico problema que o TTL antigo atacava.
    cache: 'no-store',
  });
  if (!r.ok) notFound();
  return r.json();
});
```

**Nota para quem implementa:** o `cache: 'no-store'` acima assume a semântica do Next 16 lida no Step 1. Se a documentação disser outra coisa, seguir a documentação e ajustar o comentário — não o contrário.

- [ ] **Step 9: Rodar e confirmar que passa**

Run: `npm run test -- barbearia-atual`

Expected: PASS, 2 testes.

- [ ] **Step 10: Ajustar a página de agendamento por código**

Esta página consultava o agendamento via `comBarbearia`, que acabou de morrer. O Django já serve `GET /api/agendamentos/<codigo>` (`AgendamentoDetalheView`), e o `AgendamentoDetalheSerializer` devolve **tudo** o que a tela usa — inclusive `endereco` e `whatsappBarbearia`, que a view mistura no dict a partir de `request.barbearia`, e `podeCancelar`, já computado no servidor.

Consequência: **esta página deixa de precisar de `barbeariaAtual()`**, e some junto a conta local de `minutosAte` e o `PRAZO_CANCELAMENTO_MIN`. Só duas páginas (home e convite) consomem `barbeariaAtual()` depois desta fatia.

Substituir `src/app/agendamento/[codigo]/page.tsx` inteiro:

```tsx
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { Frame } from '@/components/wf';
import { Confirmado } from '@/components/Confirmado';

/// O `podeCancelar` vem PRONTO do Django desde a fatia 8. Ele era calculado
/// aqui (`minutosAte > PRAZO_CANCELAMENTO_MIN`) sobre o relogio do servidor
/// do Next; agora sai do mesmo relogio que a rota de cancelar vai consultar
/// quando o botao for clicado. Duas contas em dois relogios davam a janela em
/// que a tela oferece cancelar e a API recusa.
type Detalhe = {
  codigo: string;
  clienteNome: string;
  barbeiroNome: string;
  servicoNome: string;
  precoCentavos: number | null;
  inicio: string;
  fim: string;
  status: string;
  podeCancelar: boolean;
  endereco: string;
  whatsappBarbearia: string;
};

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;

  // Mesma montagem de origem que `barbeariaAtual()` faz, e pelo mesmo motivo:
  // Server Component nao tem `window`, entao `pedir()` esta fora de questao.
  const host = (await headers()).get('host');
  if (!host) notFound();
  const porta = process.env.NEXT_PUBLIC_API_URL || '8000';
  const origem = `http://${host.split(':')[0]}:${porta}`;

  // O RLS continua garantindo que um codigo de outra barbearia nao aparece —
  // so que agora quem entra no tenant e o Django, pelo Host desta requisicao.
  const r = await fetch(`${origem}/api/agendamentos/${encodeURIComponent(codigo)}`, {
    cache: 'no-store',
  });
  if (!r.ok) notFound();
  const ag: Detalhe = await r.json();

  return (
    <Frame>
      <Confirmado
        codigo={ag.codigo}
        clienteNome={ag.clienteNome}
        barbeiroNome={ag.barbeiroNome}
        servicoNome={ag.servicoNome}
        inicioIso={ag.inicio}
        fimIso={ag.fim}
        status={ag.status}
        podeCancelar={ag.podeCancelar}
        endereco={ag.endereco}
        whatsappBarbearia={ag.whatsappBarbearia}
        precoCentavos={ag.precoCentavos}
      />
    </Frame>
  );
}
```

**Duas conferências antes de dar por pronto:**

1. `whatsappBarbearia` sai do Django **já formatado** ou cru? A versão antiga passava por `formatar()` de `@/lib/telefone`. Ler `AgendamentoDetalheView` (`backend/app/api/v1/views/agendamentos.py:85-93`) para ver o que ela põe no dict. Se vier cru, reimportar `formatar` e envolver — `lib/telefone.ts` fica no front (não está na lista de deleção).
2. O `<Confirmado>` espera `inicioIso`/`fimIso` como string ISO. O `InstanteISO()` do serializer já entrega assim; confirmar que o formato bate com o que `new Date(...)` do componente consome.

- [ ] **Step 11: Rodar a suíte inteira do front**

Run: `npm run test`

Expected: PASS. Os testes que exercitam os handlers mortos continuam passando — eles só morrem na Task 6.

- [ ] **Step 12: Provar as três páginas no navegador**

```bash
docker compose up -d
```

Abrir `http://brutus.localhost:3000` e `http://dontony.localhost:3000`. Expected: cada uma mostra o nome e o endereço da sua barbearia. A prova de isolamento é as duas mostrarem coisas diferentes.

- [ ] **Step 13: Commit**

```bash
git checkout -b fatia-8-prisma-sai
git add src/lib/tenant.ts src/lib/api/client.ts "src/app/agendamento/[codigo]/page.tsx" tests/client-base.test.ts tests/barbearia-atual.test.ts
git commit -m "refactor: barbeariaAtual() fala com o Django, nao com o Prisma

Ultimo modulo vivo do front a tocar o banco. A origem e montada a partir
do header `host` da requisicao, e nao por pedir() — aquele depende de
window.location e lanca em Server Component, de proposito.

comBarbearia/comBarbeariaAdmin nao foram portados: quem seta
app.barbearia_id agora e o Django."
```

---

### Task 6: A deleção — handlers, módulos de lib, scripts

A partir daqui `MIGRADAS` deixa de ser reversível: voltar uma linha passa a apontar para um handler que não existe mais.

**Repo:** `Marcai-front`

**Files:**
- Delete: `src/app/api/` (a árvore inteira, 34 `route.ts`)
- Delete: `src/lib/db.ts`, `src/lib/agenda.ts`, `src/lib/equipe-rota.ts`, `src/lib/sessao-painel.ts`, `src/lib/whatsapp.ts`, `src/lib/admin-senha.ts`
- Delete: `scripts/hash-senha.ts`, `scripts/whatsapp-qr.ts`, `scripts/whatsapp-estado.ts`
- Delete: os 20 arquivos de `tests/` que exercitam o acima
- Modify: `src/lib/admin-sessao.ts` (perde `emitirSessao`)
- Modify: `src/lib/api/client.ts` (comentário no topo de `MIGRADAS`)
- Modify: `package.json` (scripts)
- Modify: `.env.example`

- [ ] **Step 1: Listar os testes que morrem, e confirmar a conta**

```bash
grep -rl "@/lib/db\|@/lib/agenda\|@/lib/sessao-painel\|@/lib/whatsapp\|@/lib/admin-senha\|@/lib/equipe-rota\|app/api/\|@prisma" tests | sort
```

Expected: **20** arquivos. Se a conta divergir, o repo mudou depois deste plano — reconciliar antes de apagar.

Os 11 que ficam: `admin-proxy`, `admin-tenant`, `ambiente`, `client-base`, `datas`, `dinheiro`, `restricoes`, `servicos`, `slots`, `telefone`, `tenant` — mais o `barbearia-atual` da Task 5.

- [ ] **Step 1b: Confirmar que ninguém chama `/api/cron/lembretes` de fora**

A spec (§3.1) avisa que quem chamasse o endpoint do Next por fora precisaria passar a apontar para o Django. **Conferido na escrita deste plano: ninguém chama.** O contêiner `agendador` que fazia o `curl` saiu do compose na fatia 7, e o disparo agendado é a tarefa de beat `app.tasks.lembretes`, que chama o serviço direto. As únicas menções ao caminho são docstrings no back.

Reconferir, porque é barato e o repo pode ter mudado:

```bash
grep -rn "cron/lembretes" ../Marcai-back/docker-compose.yml docker-compose.yml
```

Expected: sem resultado. Se aparecer um serviço fazendo `curl`, **parar**: o alvo dele precisa mudar para a porta 8000 no mesmo commit.

- [ ] **Step 2: Apagar**

```bash
git rm -r src/app/api
git rm src/lib/db.ts src/lib/agenda.ts src/lib/equipe-rota.ts \
       src/lib/sessao-painel.ts src/lib/whatsapp.ts src/lib/admin-senha.ts
git rm scripts/hash-senha.ts scripts/whatsapp-qr.ts scripts/whatsapp-estado.ts
git rm $(grep -rl "@/lib/db\|@/lib/agenda\|@/lib/sessao-painel\|@/lib/whatsapp\|@/lib/admin-senha\|@/lib/equipe-rota\|app/api/\|@prisma" tests)
```

- [ ] **Step 3: Enxugar `src/lib/admin-sessao.ts`**

Apagar `emitirSessao()` e o import de `SignJWT`. Quem emite agora é o `AdminLoginView` do Django. Acrescentar ao docstring do topo:

```ts
/// Desde a fatia 8 este modulo so' LE. A emissao mora no Django
/// (`AdminLoginView`), que e' quem atende `/api/admin/auth/login`. O segredo
/// continua aqui porque o `proxy.ts` guarda as PAGINAS `/admin/*` no Edge,
/// antes de qualquer rota rodar — e isso continua sendo do Next.
```

- [ ] **Step 4: Marcar `MIGRADAS` como não mais reversível**

No topo do array em `src/lib/api/client.ts`, substituir o parágrafo que a chama de "painel de controle da travessia":

```ts
/// A lista de prefixos que o Django atende.
///
/// ATE A FATIA 7 isto era um interruptor: cada prefixo existia dos DOIS
/// lados, e remover uma linha devolvia a rota ao Next. **A fatia 8 apagou o
/// lado do Next.** Remover uma linha daqui hoje aponta para um handler que
/// nao existe mais — 404 mudo, longe da causa. Voltar atras e' `git revert`
/// da fatia inteira, nao edicao desta lista.
```

- [ ] **Step 5: Limpar `package.json` e `.env.example`**

De `package.json`, remover os scripts `seed`, `admin:hash`, `whatsapp:qr`, `whatsapp:estado`, `barbeiro:senha`.

De `.env.example`, remover: as nove `DATABASE_URL*`, `EVOLUTION_API_KEY`, `EVOLUTION_API_URL_HOST`, `EVOLUTION_INSTANCE`, `CRON_SECRET`, `ADMIN_USUARIO`, `ADMIN_SENHA_HASH_B64`.

**Ficam cinco:** `NEXT_PUBLIC_DOMINIO_BASE`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_URL_BASE`, `ADMIN_JWT_SECRET`, `SESSAO_JWT_SECRET`. Acrescentar aos dois segredos uma nota de que agora só o `proxy.ts` os lê, e que continuam tendo de ser idênticos aos do back.

- [ ] **Step 6: Deixar o `ambiente.test.ts` provar a limpeza**

Run: `npm run test -- ambiente`

Expected: PASS. Este é o teste que verifica a tabela do §7 sozinho — se ele reclamar de variável não declarada, é código que ainda a lê; se reclamar do contrário, é variável que sobrou no `.env.example`. **Tratar o vermelho dele como a lista de pendências desta tarefa**, não como teste a ajustar.

O `it('a chave da Evolution alimenta o app')` desse arquivo vai falhar: ele afirma sobre `EVOLUTION_API_KEY` no compose do front, que deixou de existir. Apagar esse `it` — a metade do back já é afirmada por `test_ambiente.py::test_a_chave_da_evolution_exigida_pelo_servico_evolution`.

- [ ] **Step 7: Rodar a suíte e o typecheck**

Run: `npm run test`
Expected: PASS, 12 arquivos.

Run: `npx tsc --noEmit`
Expected: sem erro. Este é o passo que pega import órfão de módulo apagado.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: apaga do front os handlers, libs e scripts mortos

As 34 rotas de src/app/api ja nao recebiam trafego: MIGRADAS desviava
tudo para o Django. Elas eram a unica razao de o front precisar de
DATABASE_URL e EVOLUTION_*.

MIGRADAS deixa de ser um interruptor reversivel — o outro lado nao
existe mais. O comentario no topo da lista diz isso."
```

---

### Task 7: A deleção — `prisma/`, dependências, compose

**Repo:** `Marcai-front`

**Files:**
- Delete: `prisma/`, `prisma.config.ts`
- Modify: `package.json` (dependências e `allowScripts`)
- Modify: `docker-compose.yml` (o `command:`)
- Modify: `Dockerfile` (as três chamadas a `prisma generate`)

- [ ] **Step 1: Apagar o Prisma**

```bash
git rm -r prisma
git rm prisma.config.ts
```

- [ ] **Step 2: Remover as dependências**

```bash
npm uninstall @prisma/client @prisma/adapter-pg prisma pg @node-rs/argon2
```

Em `package.json`, no bloco `allowScripts`, remover `@prisma/engines@7.9.1` e `prisma@7.9.1`. **Manter `esbuild@0.28.1`** — ele é do `vitest`, que fica.

- [ ] **Step 3: Limpar o `command:` do compose**

Em `docker-compose.yml`, o serviço `app`:

```yaml
    command: npm run dev
```

Apagar junto o comentário acima dele sobre `prisma generate` e o volume anônimo — ele deixou de descrever o que acontece.

- [ ] **Step 4: Limpar o Dockerfile**

Remover as três linhas `RUN npx prisma generate` (estágios `dev` e `build`) e o `RUN apk add --no-cache openssl` dos três estágios — o openssl estava lá para o engine do Prisma.

**Conferir antes de remover o openssl:** `grep -rn "openssl\|crypto" src/` — se algo mais depender dele, manter.

- [ ] **Step 5: Rebuild e prova de que sobe**

```bash
docker compose build --no-cache
docker compose up -d
docker compose logs -f app
```

Expected: o app sobe sem `prisma generate`, e `http://brutus.localhost:3000` responde com a BRUTUS.

- [ ] **Step 6: Provar que o `next build` de produção passa**

Este é o estágio que o compose nunca exercita (ele builda o alvo `dev`):

```bash
docker build --target build -t marcai-front-build .
```

Expected: sucesso. É o que prova que não sobrou import órfão em caminho que o `tsc --noEmit` não cobre.

- [ ] **Step 7: Rodar a suíte uma última vez**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: apaga o Prisma do front

O Django e dono do DDL desde a fatia 1 (entrypoint.sh roda migrate
--database=owner) e tem o proprio historico de migrations. O
`prisma migrate deploy` do compose era redundante, e duas ferramentas
disputando _prisma_migrations numa subida concorrente e o modo de falha
que isso convidava.

O seed virou `manage.py semear` no back."
```

---

## Verificação final da fatia

Depois da Task 7, com os dois composes de pé:

- [ ] `docker compose run --rm api pytest -q` no back — PASS
- [ ] `npm run test` no front — PASS
- [ ] `grep -rn "prisma\|@prisma\|EVOLUTION\|DATABASE_URL" src/ tests/ .env.example` no front — **sem resultado**
- [ ] Login do admin em `http://admin.localhost:3000/admin/login` com `ADMIN_USUARIO` e a senha da Task 2 — entra, e a lista de barbearias carrega
- [ ] `http://brutus.localhost:3000` e `http://dontony.localhost:3000` mostram barbearias diferentes
- [ ] Agendar pelo fluxo público e abrir a página do código — a tela de confirmação carrega
