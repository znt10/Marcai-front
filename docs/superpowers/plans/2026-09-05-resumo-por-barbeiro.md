# Resumo de cortes por barbeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao dono uma tela `/painel/resumo` que responde, por barbeiro, quantos cortes ele fez e quantas pessoas distintas ele atendeu num período escolhido.

**Architecture:** Uma rota de leitura nova (`GET /api/painel/resumo`), no mesmo molde de `/api/painel/dia`: serviço puro-de-banco em `app/services/resumo.py`, view fina com `ExigeDono`, e uma tela cliente que fala com ela pela camada de API centralizada. Nenhum model novo, nenhuma migration, nenhuma escrita — é só agregação sobre `Agendamento`.

**Tech Stack:** Django 5.2 + DRF + Postgres com RLS por tenant (`Marcai-back`); Next.js + React + Tailwind + vitest (`Marcai-front`). Dois repositórios git separados, ambos no branch `resumo-por-barbeiro`.

**Spec:** Não há documento de spec — a tarefa foi classificada como **bounded** no brainstorming de 05/09/2026 e o desenho aprovado está reproduzido na íntegra em "Decisões de produto" logo abaixo. Executores leem esta seção como leriam uma spec.

---

## Decisões de produto (o contrato desta tela)

Estas quatro respostas vieram do dono do produto e não são negociáveis pelo executor:

1. **A métrica é dupla, por barbeiro:** `cortes` (quantos atendimentos) e `clientes` (quantas pessoas distintas). O mesmo cliente voltando três vezes conta 3 cortes e 1 cliente.
2. **O período tem atalhos e intervalo livre:** botões *hoje* / *7 dias* / *este mês*, mais dois campos de data para qualquer intervalo. Um só endpoint, com `de` e `ate`.
3. **Só entra corte que ACONTECEU:** `status="CONFIRMADO"` **e** `fim <= agora`. Cancelado fora; agendamento futuro fora. Isto é o que separa "corte feito" de "agenda vendida", e é a diferença que dá sentido ao número.
4. **Só o dono vê, em aba nova "resumo".** Barbeiro comum recebe 403 na rota e não vê a aba.

**Fora de escopo, deliberadamente (YAGNI):** faturamento e preço, ranking por serviço, gráfico de evolução no tempo, exportação, comparação com período anterior. Não os acrescente "de brinde".

## Global Constraints

Valem para **toda** tarefa deste plano; cada tarefa herda esta lista sem repeti-la.

- **Dois repositórios.** `Marcai-back` (Django) e `Marcai-front` (Next) são repos git independentes. Cada um commita no seu. Ambos já estão no branch `resumo-por-barbeiro`, criado a partir de `painel-e-avisos`.
- **Ambos os repos têm trabalho não commitado anterior a este plano** (mexidas em `.env.example`, `docker-compose.yml`, `middleware.py`, `proxy.ts` e outros). **Nunca use `git add -A`, `git add .` ou `git commit -a`.** Todo commit deste plano lista os arquivos um a um, exatamente como escrito nos passos.
- **Toda consulta a model de tenant roda dentro de `with com_barbearia(barbearia_id):`.** `tests/test_varredura.py` é uma varredura de AST que reprova o build se um `Agendamento.objects` ou `Barbeiro.objects` aparecer fora do wrapper. Não é convenção, é teste.
- **`com_barbearia` usa `atomic(durable=True)`** — aninhar dois estoura `RuntimeError` de propósito. Um serviço abre o wrapper **uma vez**; quem chama de dentro de outro wrapper não abre de novo.
- **Fuso é só `tenant/datas.py`** no back e só `src/lib/datas.ts` no front. Nenhum outro arquivo converte fuso, nem "só uma linha".
- **Testes primeiro (TDD).** Cada tarefa escreve o teste, roda para ver falhar pelo motivo certo, implementa o mínimo, roda para ver passar, commita.
- **Comentário em português, no estilo da casa:** o repo explica *por que*, não *o que*. Comentário que narra a linha seguinte é ruído; comentário que registra a decisão e o defeito que ela evita é o padrão daqui. Siga `app/services/agenda.py` e `src/components/painel/QuadroDoDia.tsx` como referência de tom.
- **Rodapé de commit** em todos os commits deste plano:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **Mensagem de commit** no estilo do histórico: minúscula, `área: frase em português`. Ex.: `resumo: o dono ve quantos cortes cada barbeiro fez`. Sem `feat:`/`fix:`.

### Caminhos absolutos dos dois repos

- Back: `/home/jose/Área de trabalho/marcai/Marcai-back`
- Front: `/home/jose/Área de trabalho/marcai/Marcai-front`

### Como rodar os testes

**Back** (de `Marcai-back`), preferencialmente pelo compose, que já tem o Postgres:
```bash
docker compose run --rm api pytest -q tests/test_resumo.py
```
Alternativa na máquina nua, com o Postgres do compose publicado em `localhost:5433`:
```bash
python -m pytest tests/test_resumo.py -v
```

**Front** (de `Marcai-front`):
```bash
npm test -- tests/resumo.test.ts
```

---

## Estrutura de arquivos

| Arquivo | Repo | Responsabilidade |
|---|---|---|
| `backend/app/services/resumo.py` | back | **Criar.** A agregação (`cortes_por_barbeiro`) e a normalização do período pedido (`periodo_pedido`, função pura). |
| `backend/app/api/v1/views/resumo.py` | back | **Criar.** View fina: lê a query, chama o serviço, devolve. Zero regra. |
| `backend/app/api/v1/router.py` | back | **Modificar.** Uma linha de rota + um import. |
| `backend/tenant/config.py` | back | **Modificar.** O teto de dias da janela do resumo. |
| `tests/test_resumo.py` | back | **Criar.** Contagem, exclusões, papel, isolamento entre barbearias. |
| `src/lib/resumo.ts` | front | **Criar.** Aritmética pura dos atalhos de período. Sem React, sem fetch. |
| `tests/resumo.test.ts` | front | **Criar.** Testa `src/lib/resumo.ts`. |
| `src/lib/api/painelAPI.ts` | front | **Modificar.** `resumoApi` + os tipos da resposta. |
| `src/lib/api/client.ts` | front | **Modificar.** `'/painel/resumo'` na lista `MIGRADAS`. |
| `src/lib/api/index.ts` | front | **Modificar.** Reexportar `resumoApi` e os tipos. |
| `src/components/painel/Resumo.tsx` | front | **Criar.** A tela: controles de período + tabela com barra. |
| `src/app/painel/resumo/page.tsx` | front | **Criar.** A página (server component) que monta a moldura. |
| `src/components/painel/NavPainel.tsx` | front | **Modificar.** A aba nova, `soDono: true`. |

---

## Task 1: O serviço de agregação no back

**Files:**
- Create: `/home/jose/Área de trabalho/marcai/Marcai-back/backend/app/services/resumo.py`
- Modify: `/home/jose/Área de trabalho/marcai/Marcai-back/backend/tenant/config.py` (acrescentar uma constante no fim do arquivo)
- Test: `/home/jose/Área de trabalho/marcai/Marcai-back/tests/test_resumo.py`

**Interfaces:**
- Consumes: `tenant.models.Agendamento`, `tenant.models.Barbeiro`; `tenant.datas.local_para_utc(dia: str, minutos: int) -> datetime`, `tenant.datas.somar_dias(dia: str, n: int) -> str`; `tenant.rls.com_barbearia(barbearia_id)`.
- Produces:
  - `periodo_pedido(de: str | None, ate: str | None, hoje: str) -> tuple[str, str]` — função **pura**, sem banco.
  - `cortes_por_barbeiro(barbearia_id, de: str, ate: str, agora: datetime) -> dict` com a forma:
    ```python
    {
      "de": "2026-09-01",
      "ate": "2026-09-05",
      "linhas": [
        {"barbeiroId": UUID(...), "barbeiroNome": "Zeca", "ativo": True,
         "cortes": 3, "clientes": 2},
      ],
      "totais": {"cortes": 3, "clientes": 2},
    }
    ```
    A Task 2 consome exatamente essas chaves e as devolve sem reembrulhar.

### Por que três consultas e não uma

A tentação é uma consulta só: `Barbeiro.objects.filter(Q(ativo=True) | Q(agendamentos__...)).annotate(cortes=Count("agendamentos", filter=...))`. **Não faça.** Filtrar por uma relação *e* anotar sobre a mesma relação faz o Django emitir dois JOINs sobre `tenant_agendamento`, e a contagem sai multiplicada — o clássico erro de agregação com join múltiplo do ORM. O sintoma é o pior possível aqui: número plausível, e errado. As três consultas separadas abaixo não têm esse buraco e cabem todas na mesma transação do `com_barbearia`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/test_resumo.py` com o conteúdo abaixo. Os helpers `_barbeiro`, `_logar` e `_servico_vinculado` são copiados de `tests/test_dia.py` de propósito — os testes deste repo repetem helper por arquivo em vez de compartilhar, e seguir isso é mais barato que criar um `conftest` novo.

```python
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.services.resumo import cortes_por_barbeiro, periodo_pedido

pytestmark = pytest.mark.django_db(databases=["default", "owner"], transaction=True)

# 2026-09-05 e' um sabado. AGORA e' o meio da tarde, para que "as 9h" seja
# passado e "as 18h" seja futuro dentro do MESMO dia — e' o que separa
# "corte feito" de "agenda vendida" sem precisar de dois dias diferentes.
AGORA = datetime(2026, 9, 5, 17, 0, tzinfo=timezone.utc)  # 14h em Sao Paulo
DIA = "2026-09-05"


def _barbeiro(barbearia_id, nome="Zeca", papel="BARBEIRO", ordem=0, ativo=True):
    from tenant.models import Barbeiro

    return Barbeiro.objects.using("owner").create(
        id=str(uuid.uuid4()), barbearia_id=barbearia_id, nome=nome,
        whatsapp=f"1199{uuid.uuid4().int % 10**7:07d}", papel=papel,
        ativo=ativo, ordem=ordem,
    )


def _cliente(barbearia_id, nome="Cliente"):
    from tenant.models import Cliente

    return Cliente.objects.using("owner").create(
        id=str(uuid.uuid4()), barbearia_id=barbearia_id, nome=nome,
        whatsapp=f"1198{uuid.uuid4().int % 10**7:07d}",
    )


def _servico(barbearia_id, nome="Corte"):
    from tenant.models import Servico

    return Servico.objects.using("owner").create(
        id=str(uuid.uuid4()), barbearia_id=barbearia_id,
        nome=f"{nome} {uuid.uuid4().hex[:6]}",
        duracao_minima_min=15, duracao_sugerida_min=30,
    )


def _agendamento(barbearia_id, barbeiro, cliente, servico, inicio,
                 duracao_min=30, status="CONFIRMADO"):
    from tenant.models import Agendamento

    return Agendamento.objects.using("owner").create(
        id=str(uuid.uuid4()), barbearia_id=barbearia_id,
        codigo=uuid.uuid4().hex[:10], barbeiro_id=barbeiro.id,
        cliente_id=cliente.id, servico_id=servico.id, servico_nome=servico.nome,
        inicio=inicio, fim=inicio + timedelta(minutes=duracao_min),
        duracao_min=duracao_min, status=status,
    )


def _linha_de(saida, barbeiro_id):
    """Busca por id, nunca por posicao: a fixture `cenario` ja cria um
    barbeiro padrao por barbearia, entao linhas[0] nem sempre e' o barbeiro
    que o teste configurou."""
    return next(l for l in saida["linhas"] if l["barbeiroId"] == barbeiro_id)


# ---------------------------------------------------------------- contagem


def test_conta_cortes_e_clientes_distintos(cenario):
    """O mesmo cliente voltando duas vezes conta 2 cortes e 1 cliente — e' a
    razao das duas colunas existirem em vez de uma."""
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    servico = _servico(b.id)
    volta = _cliente(b.id, "Volta Sempre")
    outro = _cliente(b.id, "Passou Uma Vez")

    _agendamento(b.id, zeca, volta, servico, datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))
    _agendamento(b.id, zeca, volta, servico, datetime(2026, 9, 5, 13, 0, tzinfo=timezone.utc))
    _agendamento(b.id, zeca, outro, servico, datetime(2026, 9, 5, 14, 0, tzinfo=timezone.utc))

    saida = cortes_por_barbeiro(b.id, DIA, DIA, AGORA)
    linha = _linha_de(saida, zeca.id)
    assert linha["cortes"] == 3
    assert linha["clientes"] == 2


def test_cancelado_nao_conta(cenario):
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    servico = _servico(b.id)
    cliente = _cliente(b.id)

    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))
    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 13, 0, tzinfo=timezone.utc),
                 status="CANCELADO_CLIENTE")
    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 14, 0, tzinfo=timezone.utc),
                 status="CANCELADO_BARBEIRO")

    assert _linha_de(cortes_por_barbeiro(b.id, DIA, DIA, AGORA), zeca.id)["cortes"] == 1


def test_agendamento_futuro_nao_conta(cenario):
    """Marcado para as 18h de hoje, com AGORA as 14h: e' agenda vendida, nao
    corte feito. Contar isso faria o numero do dia so' cair conforme
    cancelamentos aparecessem."""
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    servico = _servico(b.id)
    cliente = _cliente(b.id)

    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))  # 9h local, passado
    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 21, 0, tzinfo=timezone.utc))  # 18h local, futuro

    assert _linha_de(cortes_por_barbeiro(b.id, DIA, DIA, AGORA), zeca.id)["cortes"] == 1


def test_em_andamento_nao_conta(cenario):
    """Comecou as 13h50 e termina as 14h20, com AGORA as 14h. O criterio e'
    `fim <= agora`: enquanto a tesoura esta na mao, o corte nao entrou."""
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    _agendamento(b.id, zeca, _cliente(b.id), _servico(b.id),
                 datetime(2026, 9, 5, 16, 50, tzinfo=timezone.utc), duracao_min=30)

    assert _linha_de(cortes_por_barbeiro(b.id, DIA, DIA, AGORA), zeca.id)["cortes"] == 0


def test_fora_da_janela_nao_conta(cenario):
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    servico = _servico(b.id)
    cliente = _cliente(b.id)

    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc))  # vespera
    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))  # o dia

    assert _linha_de(cortes_por_barbeiro(b.id, DIA, DIA, AGORA), zeca.id)["cortes"] == 1
    assert _linha_de(
        cortes_por_barbeiro(b.id, "2026-09-04", DIA, AGORA), zeca.id
    )["cortes"] == 2


# ---------------------------------------------------------------- o eixo


def test_barbeiro_sem_corte_aparece_com_zero(cenario):
    """Quem PAROU e' exatamente o que o dono precisa ver. Se a linha sumisse,
    a tela mostraria so' quem trabalhou e o resumo perderia a metade util."""
    b = cenario["brutus"]
    parado = _barbeiro(b.id, "Parado")

    linha = _linha_de(cortes_por_barbeiro(b.id, DIA, DIA, AGORA), parado.id)
    assert linha["cortes"] == 0
    assert linha["clientes"] == 0


def test_inativo_com_corte_no_periodo_aparece(cenario):
    """Mesma regra do quadro do dia: desligar o barbeiro nao pode reescrever
    o passado — o resumo de agosto continua tendo que fechar."""
    b = cenario["brutus"]
    saiu = _barbeiro(b.id, "Saiu da equipe", ativo=False)
    _agendamento(b.id, saiu, _cliente(b.id), _servico(b.id),
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))

    linha = _linha_de(cortes_por_barbeiro(b.id, DIA, DIA, AGORA), saiu.id)
    assert linha["cortes"] == 1
    assert linha["ativo"] is False


def test_inativo_sem_corte_no_periodo_nao_aparece(cenario):
    b = cenario["brutus"]
    saiu = _barbeiro(b.id, "Saiu ha' tempos", ativo=False)

    saida = cortes_por_barbeiro(b.id, DIA, DIA, AGORA)
    assert all(l["barbeiroId"] != saiu.id for l in saida["linhas"])


def test_ordem_segue_a_da_equipe(cenario):
    b = cenario["brutus"]
    segundo = _barbeiro(b.id, "Segundo", ordem=2)
    primeiro = _barbeiro(b.id, "Primeiro", ordem=1)

    ids = [l["barbeiroId"] for l in cortes_por_barbeiro(b.id, DIA, DIA, AGORA)["linhas"]]
    assert ids.index(primeiro.id) < ids.index(segundo.id)


# ---------------------------------------------------------------- totais


def test_total_de_clientes_e_distinto_na_barbearia(cenario):
    """O mesmo cliente cortando com dois barbeiros conta 1 em cada linha e 1
    no total — entao a soma das linhas PODE passar do total, e isso e' certo,
    nao bug. A tela rotula em vez de esconder."""
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    tuca = _barbeiro(b.id, "Tuca")
    servico = _servico(b.id)
    cliente = _cliente(b.id, "O mesmo")

    _agendamento(b.id, zeca, cliente, servico,
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))
    _agendamento(b.id, tuca, cliente, servico,
                 datetime(2026, 9, 5, 13, 0, tzinfo=timezone.utc))

    saida = cortes_por_barbeiro(b.id, DIA, DIA, AGORA)
    assert saida["totais"]["cortes"] == 2
    assert saida["totais"]["clientes"] == 1
    assert _linha_de(saida, zeca.id)["clientes"] == 1
    assert _linha_de(saida, tuca.id)["clientes"] == 1


# ---------------------------------------------------------------- isolamento


def test_nao_ve_corte_de_outra_barbearia(cenario):
    """O unico teste de isolamento que vale e' o que tem de quem se isolar."""
    b, d = cenario["brutus"], cenario["dontony"]
    zeca = _barbeiro(b.id, "Zeca")
    alheio = _barbeiro(d.id, "Alheio")
    _agendamento(d.id, alheio, _cliente(d.id), _servico(d.id),
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))

    saida = cortes_por_barbeiro(b.id, DIA, DIA, AGORA)
    assert saida["totais"]["cortes"] == 0
    assert all(l["barbeiroId"] != alheio.id for l in saida["linhas"])
    assert _linha_de(saida, zeca.id)["cortes"] == 0


# ------------------------------------------------------- periodo (puro)


def test_periodo_padrao_e_o_mes_corrente():
    assert periodo_pedido(None, None, "2026-09-05") == ("2026-09-01", "2026-09-05")


def test_periodo_aceita_intervalo_valido():
    assert periodo_pedido("2026-08-01", "2026-08-31", "2026-09-05") == (
        "2026-08-01", "2026-08-31",
    )


def test_periodo_recusa_forma_invalida():
    assert periodo_pedido("ontem", "hoje", "2026-09-05") == ("2026-09-01", "2026-09-05")


def test_periodo_recusa_data_impossivel():
    """`\\d{4}-\\d{2}-\\d{2}` casa com 2026-13-45, que nao e' data. Sem o
    `fromisoformat`, isso viraria ValueError la' dentro do servico — 500 numa
    query string malformada."""
    assert periodo_pedido("2026-13-45", "2026-09-05", "2026-09-05") == (
        "2026-09-01", "2026-09-05",
    )


def test_periodo_recusa_invertido():
    assert periodo_pedido("2026-09-05", "2026-09-01", "2026-09-05") == (
        "2026-09-01", "2026-09-05",
    )


def test_periodo_recusa_janela_absurda():
    """Sem teto, um `?de=1900-01-01` nao derruba nada (a agregacao e' uma
    consulta so'), mas devolve um numero que ninguem pediu e esconde o
    engano. O teto torna o engano visivel: volta para o mes."""
    assert periodo_pedido("1900-01-01", "2026-09-05", "2026-09-05") == (
        "2026-09-01", "2026-09-05",
    )
```

- [ ] **Step 2: Rodar os testes e ver falhar pelo motivo certo**

Run: `docker compose run --rm api pytest -q tests/test_resumo.py`
Expected: erro de coleta — `ModuleNotFoundError: No module named 'app.services.resumo'`. Se falhar por outra coisa (banco fora do ar, import de helper errado), conserte antes de seguir: um teste que falha pelo motivo errado não prova nada quando passar.

- [ ] **Step 3: Acrescentar o teto de janela em `tenant/config.py`**

No fim de `backend/tenant/config.py`:

```python
# ---- Resumo de cortes por barbeiro (painel do dono) ----
#
# Teto da janela que `/api/painel/resumo` aceita. Nao existe para proteger o
# banco — a agregacao e' uma consulta so', e um ano ou um seculo custam
# praticamente o mesmo. Existe para que um `?de=1900-01-01` (digitado errado,
# ou herdado de um link velho) apareca como periodo recusado em vez de
# devolver um numero que ninguem pediu e parece certo.
#
# 366 e nao 365: um intervalo de "um ano inteiro" que cruze ano bissexto tem
# 366 dias, e recusar exatamente esse caso seria a regra falhando na unica
# vez em que ela nao deveria.
RESUMO_JANELA_MAXIMA_DIAS = 366
```

- [ ] **Step 4: Escrever o serviço**

Crie `backend/app/services/resumo.py`:

```python
"""O resumo do painel: quantos cortes cada barbeiro fez, e para quantas
pessoas diferentes, num periodo.

'Corte feito' e' `CONFIRMADO` com `fim <= agora`, e nao 'tudo que esta' na
agenda'. A diferenca aparece dentro do proprio dia: as 14h, o horario das 18h
ja' esta' marcado e ainda nao aconteceu. Contando-o, o numero de hoje comecaria
alto e so' cairia conforme cancelamentos chegassem — um resumo que anda para
tras. Contando so' o que terminou, ele so' cresce, que e' como o dono le.
"""

import re
from datetime import date, datetime

from django.db.models import Count, Q

from tenant.config import RESUMO_JANELA_MAXIMA_DIAS
from tenant.datas import local_para_utc, somar_dias
from tenant.models import Agendamento, Barbeiro
from tenant.rls import com_barbearia

_DIA = re.compile(r"\d{4}-\d{2}-\d{2}")


def periodo_pedido(de: str | None, ate: str | None, hoje: str) -> tuple[str, str]:
    """Normaliza o que chegou na query string. Pura: nao toca banco, e por
    isso da' teste por combinacao sem fixture nenhuma.

    Toda recusa cai no MESMO padrao (o mes corrente) em vez de virar 422. E'
    uma tela de leitura chegada por link: responder 422 para um `de` torto
    troca um numero util por uma tela de erro, e o dono nao tem o que
    consertar — ele nao digitou aquilo, o link digitou.

    Os dois filtros de data sao necessarios e nenhum basta: o regex garante a
    FORMA (o `fromisoformat` do Python 3.11+ tambem aceita `20260101` e
    `2026-W01-1`, que nao e' o contrato desta rota) e o `fromisoformat`
    garante que a data EXISTE — `2026-13-45` passa pelo regex inteiro.
    """
    padrao = (f"{hoje[:7]}-01", hoje)

    if not (de and ate and _DIA.fullmatch(de) and _DIA.fullmatch(ate)):
        return padrao
    try:
        d, a = date.fromisoformat(de), date.fromisoformat(ate)
    except ValueError:
        return padrao
    if d > a or (a - d).days + 1 > RESUMO_JANELA_MAXIMA_DIAS:
        return padrao
    return de, ate


def cortes_por_barbeiro(barbearia_id, de: str, ate: str, agora: datetime) -> dict:
    """Uma linha por barbeiro, mais os totais da barbearia.

    Sao TRES consultas, e nao uma, de proposito. A versao de uma consulta
    (`Barbeiro.objects.filter(Q(ativo=True) | Q(agendamentos__...))
    .annotate(Count("agendamentos", filter=...))`) filtra e anota sobre a
    MESMA relacao, e o ORM emite dois JOINs sobre `tenant_agendamento`: a
    contagem sai multiplicada. O sintoma e' o pior possivel numa tela de
    numero — plausivel, e errado. Separar tira o join ambiguo do caminho; as
    tres cabem na mesma transacao e nenhuma delas cresce com o tamanho da
    equipe.

    `ate` e' INCLUSIVO: a janela vai da meia-noite de `de` a' meia-noite do
    dia seguinte a `ate`, meio-aberta. Um resumo em que pedir 01 a 05
    devolvesse ate' o dia 04 seria descoberto tarde e por um numero que nao
    fecha com o caixa.
    """
    abre = local_para_utc(de, 0)
    fecha = local_para_utc(somar_dias(ate, 1), 0)

    feitos = dict(
        status="CONFIRMADO", inicio__gte=abre, inicio__lt=fecha, fim__lte=agora,
    )

    with com_barbearia(barbearia_id):
        # Ativo, OU inativo que atendeu na janela. A segunda metade e' a mesma
        # regra do quadro do dia (`app/services/agenda.py`): desligar um
        # barbeiro exige agenda futura vazia, mas o passado continua la' — sem
        # ela, o resumo de um mes fechado encolheria toda vez que alguem
        # saisse da equipe.
        barbeiros = list(
            Barbeiro.objects.filter(
                Q(ativo=True)
                | Q(
                    agendamentos__status="CONFIRMADO",
                    agendamentos__inicio__gte=abre,
                    agendamentos__inicio__lt=fecha,
                    agendamentos__fim__lte=agora,
                )
            )
            .distinct()
            .order_by("ordem", "criado_em")
            .values("id", "nome", "ativo")
        )

        contagem = {
            r["barbeiro_id"]: r
            for r in Agendamento.objects.filter(**feitos)
            .values("barbeiro_id")
            .annotate(cortes=Count("id"), clientes=Count("cliente_id", distinct=True))
        }

        # `clientes` aqui e' distinto na BARBEARIA, e nao a soma das linhas:
        # quem cortou com dois barbeiros e' uma pessoa so'. Por isso a soma
        # das linhas pode passar do total — e' aritmetica certa de conjunto,
        # e a tela rotula em vez de esconder.
        totais = Agendamento.objects.filter(**feitos).aggregate(
            cortes=Count("id"), clientes=Count("cliente_id", distinct=True),
        )

    return {
        "de": de,
        "ate": ate,
        "linhas": [
            {
                "barbeiroId": b["id"],
                "barbeiroNome": b["nome"],
                "ativo": b["ativo"],
                "cortes": contagem.get(b["id"], {}).get("cortes", 0),
                "clientes": contagem.get(b["id"], {}).get("clientes", 0),
            }
            for b in barbeiros
        ],
        # `aggregate` devolve None (nao 0) quando nao ha linha nenhuma para
        # agregar em algumas combinacoes; o `or 0` e' o que impede um `null`
        # de chegar na tela e virar "NaN" no lugar do numero.
        "totais": {"cortes": totais["cortes"] or 0, "clientes": totais["clientes"] or 0},
    }
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `docker compose run --rm api pytest -q tests/test_resumo.py`
Expected: PASS em todos. Se `test_varredura.py` for afetado, rode-o também:
Run: `docker compose run --rm api pytest -q tests/test_varredura.py`
Expected: PASS — `resumo.py` está sob `app/services/`, e a varredura só olha `backend/tenant/`, mas confirmar é barato.

- [ ] **Step 6: Commit**

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-back"
git add backend/app/services/resumo.py backend/tenant/config.py tests/test_resumo.py
git commit -m "resumo: quantos cortes cada barbeiro fez, e para quanta gente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: A rota `GET /api/painel/resumo`

**Files:**
- Create: `/home/jose/Área de trabalho/marcai/Marcai-back/backend/app/api/v1/views/resumo.py`
- Modify: `/home/jose/Área de trabalho/marcai/Marcai-back/backend/app/api/v1/router.py`
- Test: `/home/jose/Área de trabalho/marcai/Marcai-back/tests/test_resumo.py` (acrescentar ao arquivo da Task 1)

**Interfaces:**
- Consumes: `app.services.resumo.cortes_por_barbeiro`, `app.services.resumo.periodo_pedido` (Task 1); `app.api.v1.mixins.ExigeDono`; `tenant.datas.dia_de_hoje`.
- Produces: `GET /api/painel/resumo?de=YYYY-MM-DD&ate=YYYY-MM-DD` respondendo 200 com o dicionário da Task 1 tal e qual (UUID vira string pelo encoder do DRF), 403 para `BARBEIRO`, 401 sem cookie. A Task 4 do front consome exatamente esse contrato.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/test_resumo.py`:

```python
# ---------------------------------------------------------------- a rota
#
# `from app.services.sessao import COOKIE_SESSAO, emitir` vai junto dos
# imports NO TOPO do arquivo, e nao aqui: import no meio do modulo e' erro de
# lint (E402) e esconde de quem le' o cabecalho que este arquivo fala HTTP.


def _logar(client, barbeiro, barbearia_id, host="brutus.localhost"):
    client.cookies[COOKIE_SESSAO] = emitir(
        sub=barbeiro.id, bid=barbearia_id, papel=barbeiro.papel, tv=0,
    )
    return host


def test_rota_responde_o_resumo(client, cenario):
    b = cenario["brutus"]
    dono = _barbeiro(b.id, "Dono", papel="DONO")
    host = _logar(client, dono, b.id)
    _agendamento(b.id, dono, _cliente(b.id), _servico(b.id),
                 datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc))

    r = client.get("/api/painel/resumo", {"de": DIA, "ate": DIA}, headers={"host": host})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["de"] == DIA and corpo["ate"] == DIA
    linha = next(l for l in corpo["linhas"] if l["barbeiroId"] == str(dono.id))
    assert linha["cortes"] == 1
    assert linha["clientes"] == 1


def test_rota_recusa_barbeiro_comum(client, cenario):
    """403 e nao 404: quem chega aqui ja' tem sessao valida e ja' sabe que nao
    e' dono — a mensagem nao conta nada novo. O 404 do painel existe para nao
    revelar REGISTRO alheio, e aqui nao ha registro nenhum em jogo."""
    b = cenario["brutus"]
    zeca = _barbeiro(b.id, "Zeca")
    host = _logar(client, zeca, b.id)

    r = client.get("/api/painel/resumo", headers={"host": host})
    assert r.status_code == 403
    assert r.json()["erro"] == "Só o dono vê o resumo."


def test_rota_recusa_sem_sessao(client, cenario):
    r = client.get("/api/painel/resumo", headers={"host": "brutus.localhost"})
    assert r.status_code == 401


def test_rota_sem_periodo_devolve_o_mes_corrente(client, cenario):
    """A tela abre sem parametro nenhum; o padrao tem que ser util, e util
    aqui e' o mes que esta' correndo."""
    b = cenario["brutus"]
    dono = _barbeiro(b.id, "Dono", papel="DONO")
    host = _logar(client, dono, b.id)

    r = client.get("/api/painel/resumo", headers={"host": host})
    assert r.status_code == 200
    corpo = r.json()
    # Sem recalcular "que mes e' hoje" aqui: o teste conferiria a rota contra
    # a MESMA conta que a rota faz, e os dois errariam juntos. O que da' para
    # afirmar de fora e' a FORMA do padrao — comeca no dia 1, e as duas pontas
    # caem no mesmo mes.
    assert corpo["de"].endswith("-01")
    assert corpo["de"][:7] == corpo["ate"][:7]
    assert corpo["ate"] >= corpo["de"]


def test_rota_com_periodo_torto_nao_estoura(client, cenario):
    """A query string vem de link, nao de formulario: `?de=2026-13-45` tem que
    virar o padrao, nunca 500."""
    b = cenario["brutus"]
    dono = _barbeiro(b.id, "Dono", papel="DONO")
    host = _logar(client, dono, b.id)

    r = client.get("/api/painel/resumo", {"de": "2026-13-45", "ate": "amanha"},
                   headers={"host": host})
    assert r.status_code == 200
    assert r.json()["de"].endswith("-01")
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker compose run --rm api pytest -q tests/test_resumo.py -k rota`
Expected: os cinco falham com 404 (a rota ainda não existe no router).

- [ ] **Step 3: Escrever a view**

Crie `backend/app/api/v1/views/resumo.py`:

```python
from datetime import datetime, timezone

from rest_framework.response import Response
from rest_framework.views import APIView

from app.api.v1.mixins import ExigeDono
from app.services.resumo import cortes_por_barbeiro, periodo_pedido
from tenant.datas import dia_de_hoje


class ResumoView(ExigeDono, APIView):
    """GET /api/painel/resumo?de=YYYY-MM-DD&ate=YYYY-MM-DD — quantos cortes
    cada barbeiro fez no periodo, e para quantas pessoas diferentes.

    `ExigeDono` e nao `ExigeSessao`: o resumo compara a equipe inteira lado a
    lado, e isso e' informacao de quem administra. Um barbeiro vendo a coluna
    do colega e' uma decisao de produto que ninguem tomou — se um dia for
    tomada, a mudanca e' trocar por `ExigeSessao` e aplicar
    `filtro_do_barbeiro(self.sessao)`, exatamente como `/painel/dia` ja' faz.

    A view nao tem regra nenhuma de proposito: le a query, chama, devolve. O
    que decide o periodo e' `periodo_pedido`, que e' puro e por isso e' o que
    tem teste por combinacao.
    """

    mensagem_papel_insuficiente = "Só o dono vê o resumo."

    def get(self, request):
        agora = datetime.now(timezone.utc)
        de, ate = periodo_pedido(
            request.query_params.get("de"),
            request.query_params.get("ate"),
            dia_de_hoje(agora),
        )
        return Response(cortes_por_barbeiro(self.barbearia_id, de, ate, agora))
```

- [ ] **Step 4: Registrar a rota**

Em `backend/app/api/v1/router.py`, acrescente o import junto dos outros (ordem alfabética, entre `from .views.horarios import ...` e `from .views.servicos import ...`):

```python
from .views.resumo import ResumoView
```

E a rota, logo depois da linha de `painel/barbearia` (bloco 4 do painel):

```python
    # O resumo do dono — quantos cortes cada barbeiro fez no periodo. Le so'
    # o que ja' aconteceu (`fim <= agora`), entao nunca conflita com a agenda
    # que as rotas vizinhas mostram: aquelas respondem "o que vem", esta
    # responde "o que foi".
    path("painel/resumo", ResumoView.as_view(), name="painel-resumo"),
```

- [ ] **Step 5: Rodar a suíte inteira e ver passar**

Run: `docker compose run --rm api pytest -q`
Expected: PASS. A suíte inteira, não só `test_resumo.py` — rota nova sob `/api/painel` entra no alcance do `CrivoPainelMiddleware` e de `tests/test_barreira.py`, e é aqui que uma regressão apareceria.

- [ ] **Step 6: Commit**

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-back"
git add backend/app/api/v1/views/resumo.py backend/app/api/v1/router.py tests/test_resumo.py
git commit -m "resumo: a rota do painel, so' para o dono

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: A aritmética dos atalhos de período, no front

**Files:**
- Create: `/home/jose/Área de trabalho/marcai/Marcai-front/src/lib/resumo.ts`
- Test: `/home/jose/Área de trabalho/marcai/Marcai-front/tests/resumo.test.ts`

**Interfaces:**
- Consumes: `somarDias(dia: string, n: number): string` de `@/lib/datas`.
- Produces:
  - `type Atalho = 'hoje' | '7dias' | 'mes'`
  - `type Periodo = { de: string; ate: string }`
  - `periodoDoAtalho(atalho: Atalho, hoje: string): Periodo`
  - `atalhoDoPeriodo(p: Periodo, hoje: string): Atalho | null`
  - `ATALHOS: readonly { chave: Atalho; rotulo: string }[]`

  A Task 4 importa os cinco.

**Por que este arquivo existe separado do componente:** é a única parte da tela que dá teste barato. A suíte do front é só de lógica pura (`vitest.config.ts` roda em `environment: 'node'`, sem setup e sem DOM), e enfiar esta aritmética dentro do `.tsx` a deixaria sem cobertura nenhuma. É o mesmo recorte de `src/lib/slots.ts` e `src/lib/datas.ts`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/resumo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { periodoDoAtalho, atalhoDoPeriodo } from '@/lib/resumo';

// 2026-09-05 e' um sabado, e o mes ja' comecou — os tres atalhos dao
// intervalos diferentes entre si, que e' o que faz o teste valer.
const HOJE = '2026-09-05';

describe('periodoDoAtalho', () => {
  it('hoje e um dia so', () => {
    expect(periodoDoAtalho('hoje', HOJE)).toEqual({ de: HOJE, ate: HOJE });
  });

  it('7 dias INCLUI hoje — sao sete dias, nao oito', () => {
    expect(periodoDoAtalho('7dias', HOJE)).toEqual({ de: '2026-08-30', ate: HOJE });
  });

  it('o mes vai do dia 1 ate hoje, nao ate o fim do mes', () => {
    // Ate' o fim do mes seria pedir dia que ainda nao aconteceu: o numero
    // sairia igual e o rotulo mentiria sobre o periodo.
    expect(periodoDoAtalho('mes', HOJE)).toEqual({ de: '2026-09-01', ate: HOJE });
  });

  it('o mes no dia 1 e um dia so', () => {
    expect(periodoDoAtalho('mes', '2026-09-01')).toEqual({
      de: '2026-09-01', ate: '2026-09-01',
    });
  });

  it('7 dias atravessa a virada do mes', () => {
    expect(periodoDoAtalho('7dias', '2026-09-02')).toEqual({
      de: '2026-08-27', ate: '2026-09-02',
    });
  });
});

describe('atalhoDoPeriodo', () => {
  it('reconhece cada atalho de volta', () => {
    for (const a of ['hoje', '7dias', 'mes'] as const) {
      expect(atalhoDoPeriodo(periodoDoAtalho(a, HOJE), HOJE)).toBe(a);
    }
  });

  it('intervalo digitado a mao nao acende atalho nenhum', () => {
    expect(atalhoDoPeriodo({ de: '2026-07-10', ate: '2026-08-03' }, HOJE)).toBeNull();
  });

  it('no dia 1 do mes, hoje e mes sao o mesmo intervalo e hoje ganha', () => {
    // Empate real: os dois produzem {de: 01, ate: 01}. Acender os dois seria
    // mentira; a ordem da lista decide, e `hoje` vem primeiro.
    expect(atalhoDoPeriodo({ de: '2026-09-01', ate: '2026-09-01' }, '2026-09-01'))
      .toBe('hoje');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd "/home/jose/Área de trabalho/marcai/Marcai-front" && npm test -- tests/resumo.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/resumo"`.

- [ ] **Step 3: Escrever o módulo**

Crie `src/lib/resumo.ts`:

```ts
import { somarDias } from '@/lib/datas';

/// Os atalhos de período do resumo, e a volta deles.
///
/// Mora aqui, e não dentro do componente, porque é a única parte da tela que
/// dá teste barato: a suíte do front roda em `node`, sem DOM, e o que estiver
/// no `.tsx` fica sem cobertura. Mesmo recorte de `slots.ts` e `datas.ts`.
///
/// Todo intervalo daqui é INCLUSIVO nas duas pontas — é o que a rota
/// `/painel/resumo` espera, e o que o dono lê quando escolhe "1 a 5".

export type Atalho = 'hoje' | '7dias' | 'mes';
export type Periodo = { de: string; ate: string };

/// A ordem importa duas vezes: é a ordem dos botões na tela e é o critério
/// de desempate de `atalhoDoPeriodo` (no dia 1 do mês, "hoje" e "mês" são o
/// mesmo intervalo, e acender os dois seria mentira).
export const ATALHOS: readonly { chave: Atalho; rotulo: string }[] = [
  { chave: 'hoje', rotulo: 'hoje' },
  { chave: '7dias', rotulo: '7 dias' },
  { chave: 'mes', rotulo: 'este mês' },
];

export function periodoDoAtalho(atalho: Atalho, hoje: string): Periodo {
  switch (atalho) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    // -6 e não -7: o intervalo inclui hoje, então sete dias são hoje mais
    // seis para trás. Com -7 o rótulo diria 7 e o número seria de 8.
    case '7dias':
      return { de: somarDias(hoje, -6), ate: hoje };
    // Até HOJE, e não até o fim do mês: o resumo só conta corte que já
    // aconteceu, então pedir dias futuros daria o mesmo número com um rótulo
    // que mente sobre o período.
    case 'mes':
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  }
}

/// Qual botão deve estar aceso para o intervalo atual — `null` quando o dono
/// digitou um intervalo próprio. Sem isso, mexer nos campos de data deixaria
/// um atalho aceso apontando para um período que não é mais o dele.
export function atalhoDoPeriodo(p: Periodo, hoje: string): Atalho | null {
  const igual = ATALHOS.find(({ chave }) => {
    const alvo = periodoDoAtalho(chave, hoje);
    return alvo.de === p.de && alvo.ate === p.ate;
  });
  return igual?.chave ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/resumo.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-front"
git add src/lib/resumo.ts tests/resumo.test.ts
git commit -m "resumo: os atalhos de periodo, separados para dar teste

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: A tela `/painel/resumo`

**Files:**
- Modify: `/home/jose/Área de trabalho/marcai/Marcai-front/src/lib/api/client.ts` (a lista `MIGRADAS`)
- Modify: `/home/jose/Área de trabalho/marcai/Marcai-front/src/lib/api/painelAPI.ts` (tipos + `resumoApi`, no fim do arquivo)
- Modify: `/home/jose/Área de trabalho/marcai/Marcai-front/src/lib/api/index.ts` (reexportar)
- Create: `/home/jose/Área de trabalho/marcai/Marcai-front/src/components/painel/Resumo.tsx`
- Create: `/home/jose/Área de trabalho/marcai/Marcai-front/src/app/painel/resumo/page.tsx`
- Modify: `/home/jose/Área de trabalho/marcai/Marcai-front/src/components/painel/NavPainel.tsx` (a constante `SECOES`)

**Interfaces:**
- Consumes: `periodoDoAtalho`, `atalhoDoPeriodo`, `ATALHOS`, `type Periodo` de `@/lib/resumo` (Task 3); `pedir`, `LOGIN_DO_PAINEL`, `ignorarAborto`, `mensagemDoErro` de `@/lib/api`; `Box`, `Lbl`, `Sub`, `Chip`, `Frame` de `@/components/wf`; o contrato HTTP da Task 2.
- Produces: a rota `/painel/resumo` funcionando no navegador, e `resumoApi.ver(de, ate, signal)` disponível para telas futuras.

### A armadilha que derruba esta tarefa se for esquecida

`baseDe()` em `src/lib/api/client.ts` decide, **por prefixo**, se o pedido vai para o Django (porta 8000) ou fica no Next. Um caminho fora de `MIGRADAS` é enviado para `/api/painel/resumo` **no Next**, onde não existe handler nenhum desde a fatia 8 — e a resposta é um 404 mudo, longe da causa. Esta é a primeira coisa a fazer nesta tarefa, não a última.

- [ ] **Step 1: Registrar a rota como migrada**

Em `src/lib/api/client.ts`, dentro do array `MIGRADAS`, logo depois da linha `'/painel/dia',`:

```ts
  // O resumo do dono. Sem esta linha o pedido vai para `/api/painel/resumo`
  // NO NEXT, que nao tem handler nenhum desde a fatia 8 — 404 mudo, longe da
  // causa. E' o mesmo esquecimento que `/painel/foto` levou na primeira
  // tentativa.
  '/painel/resumo',
```

- [ ] **Step 2: Acrescentar os tipos e o cliente da rota**

No fim de `src/lib/api/painelAPI.ts`:

```ts
/// `clientes` é gente distinta, `cortes` é atendimento. O mesmo cliente
/// voltando três vezes é 3 e 1 — por isso são duas colunas e não uma.
export type LinhaDoResumo = {
  barbeiroId: string;
  barbeiroNome: string;
  /// Barbeiro desligado que atendeu no período continua aparecendo: desligar
  /// alguém não pode reescrever o mês que já fechou.
  ativo: boolean;
  cortes: number;
  clientes: number;
};

export type Resumo = {
  de: string;
  ate: string;
  linhas: LinhaDoResumo[];
  /// `totais.clientes` é distinto na BARBEARIA, não a soma das linhas: quem
  /// cortou com dois barbeiros é uma pessoa só. A soma das linhas pode passar
  /// do total, e está certo — a tela rotula em vez de esconder.
  totais: { cortes: number; clientes: number };
};

/// Só o dono chega aqui: a rota responde 403 para `BARBEIRO`.
export const resumoApi = {
  ver: (de: string, ate: string, signal?: AbortSignal) =>
    pedir<Resumo>('/painel/resumo', {
      busca: { de, ate }, signal, loginEm: LOGIN_DO_PAINEL,
    }),
};
```

Em `src/lib/api/index.ts`, acrescente `resumoApi` à lista de valores exportados de `./painelAPI` e `LinhaDoResumo, Resumo` à lista de tipos:

```ts
export {
  painelApi, equipeApi, horariosApi, servicosApi, quadroApi, barbeariaApi,
  resumoApi, LOGIN_DO_PAINEL,
} from './painelAPI';
export type {
  Eu, ItemDaAgenda, MembroDaEquipe, NovoBarbeiro,
  DiaDeTrabalho, Bloqueio, Conflito,
  ServicoDoCatalogo, VinculoDeServico,
  ColunaDoDia, ItemDoQuadro, DadosDaBarbearia,
  LinhaDoResumo, Resumo,
} from './painelAPI';
```

- [ ] **Step 3: Escrever o componente**

Crie `src/components/painel/Resumo.tsx`:

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Lbl, Sub } from '@/components/wf';
import {
  resumoApi, ignorarAborto, mensagemDoErro, type LinhaDoResumo, type Resumo as Dados,
} from '@/lib/api';
import { ATALHOS, atalhoDoPeriodo, periodoDoAtalho, type Periodo } from '@/lib/resumo';

/// `sv-SE` é o locale que formata como YYYY-MM-DD — o formato que a rota
/// espera — sem passar por UTC e cair no dia anterior. Mesmo truque do
/// QuadroDoDia, e pelo mesmo motivo.
const hoje = () => new Date().toLocaleDateString('sv-SE');

/// "01/09" — o intervalo é lido de relance, e YYYY-MM-DD por extenso duas
/// vezes seguidas vira um borrão de dígitos.
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function Resumo() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho('mes', hoje()));
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (p: Periodo, signal?: AbortSignal) => {
    setDados(null);
    try {
      setDados(await resumoApi.ver(p.de, p.ate, signal));
      setErro('');
    } catch (e) {
      ignorarAborto(e);
      setErro(mensagemDoErro(e));
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void carregar(periodo, ctrl.signal);
    return () => ctrl.abort();
  }, [periodo, carregar]);

  // Sem atualização periódica, ao contrário do quadro do dia: o resumo é
  // consultado de propósito, num momento de conta — não fica aberto no
  // balcão. Recarregar sozinho só trocaria o número embaixo do olho de quem
  // está somando.

  const aceso = atalhoDoPeriodo(periodo, hoje());
  // O teto da barra é o maior do período, e não um número fixo: a comparação
  // que interessa é entre os barbeiros deste período, não contra uma meta que
  // ninguém combinou.
  const teto = Math.max(1, ...(dados?.linhas.map((l) => l.cortes) ?? [0]));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {ATALHOS.map(({ chave, rotulo }) => (
          <Chip key={chave} ativo={aceso === chave}
                onClick={() => setPeriodo(periodoDoAtalho(chave, hoje()))}>
            {rotulo}
          </Chip>
        ))}
      </div>

      {/* Os campos de data ficam ABAIXO dos atalhos e sempre visíveis, não
          atrás de um "personalizar": escondê-los faria o dono acreditar que
          só existem três períodos. */}
      <div className="flex flex-wrap items-center gap-2">
        <Lbl>de</Lbl>
        <input type="date" value={periodo.de} max={periodo.ate}
               onChange={(e) => e.target.value && setPeriodo({ ...periodo, de: e.target.value })}
               className="bg-superficie border border-borda rounded-wf px-3 py-2
                          text-[13px] md:text-sm font-dado text-tinta" />
        <Lbl>até</Lbl>
        <input type="date" value={periodo.ate} min={periodo.de} max={hoje()}
               onChange={(e) => e.target.value && setPeriodo({ ...periodo, ate: e.target.value })}
               className="bg-superficie border border-borda rounded-wf px-3 py-2
                          text-[13px] md:text-sm font-dado text-tinta" />
      </div>

      {dados === null && !erro && <Sub>carregando…</Sub>}
      {erro && <Sub className="text-acento">{erro}</Sub>}

      {dados && (
        <>
          <Lbl className="font-dado">
            {curto(dados.de)} — {curto(dados.ate)}
          </Lbl>

          {dados.linhas.length === 0 && (
            <Box variante="dash">Nenhum barbeiro na equipe ainda.</Box>
          )}

          {dados.linhas.map((l) => <Linha key={l.barbeiroId} l={l} teto={teto} />)}

          {dados.linhas.length > 0 && (
            <Box variante="mut">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-letreiro uppercase tracking-[0.06em]">no período</span>
                <span className="font-dado">
                  {dados.totais.cortes} {dados.totais.cortes === 1 ? 'corte' : 'cortes'}
                </span>
              </div>
              {/* A frase é longa de propósito. `totais.clientes` conta gente
                  distinta na barbearia inteira, então a soma das linhas pode
                  passar dele — quem cortou com dois barbeiros é uma pessoa
                  só. Sem a explicação, o dono soma as colunas, não fecha, e
                  desconfia do número inteiro. */}
              <Sub className="mt-1">
                {dados.totais.clientes}{' '}
                {dados.totais.clientes === 1 ? 'pessoa diferente' : 'pessoas diferentes'} —
                quem cortou com mais de um barbeiro conta uma vez aqui e uma vez
                em cada linha.
              </Sub>
            </Box>
          )}
        </>
      )}
    </>
  );
}

function Linha({ l, teto }: { l: LinhaDoResumo; teto: number }) {
  return (
    <Box variante={l.cortes === 0 ? 'mut' : 'normal'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-letreiro uppercase tracking-[0.06em]">
          {l.barbeiroNome}
          {/* Só aparece para quem saiu da equipe. Sem a marca, uma linha com
              número alto parece gente que ainda está atendendo. */}
          {!l.ativo && <span className="ml-2 text-[10px] text-lbl">desligado</span>}
        </span>
        <span className="shrink-0 font-dado tabular-nums">
          <span className="text-base md:text-lg">{l.cortes}</span>
          <span className="text-lbl"> / {l.clientes}</span>
        </span>
      </div>

      {/* A barra é o que faz a comparação acontecer de relance; os números ao
          lado é que dão a resposta exata. `aria-hidden` porque ela não
          acrescenta nada a quem lê pelo leitor de tela — os dois números já
          estão escritos acima. */}
      <div aria-hidden className="mt-2 h-[3px] bg-mut">
        <div className="h-full bg-latao"
             style={{ width: `${Math.round((l.cortes / teto) * 100)}%` }} />
      </div>

      <Lbl className="mt-1.5">cortes / pessoas</Lbl>
    </Box>
  );
}
```

- [ ] **Step 4: Escrever a página**

Crie `src/app/painel/resumo/page.tsx`:

```tsx
import { Frame } from '@/components/wf';
import { Resumo } from '@/components/painel/Resumo';

/// Sem `largo`: são linhas empilhadas, e a 1100px o nome do barbeiro ficaria
/// numa ponta e o número na outra, com um vão de tela no meio. O quadro do
/// dia é largo porque colunas lado a lado são a razão dele existir; aqui não
/// há coluna nenhuma.
export default function ResumoDoPainel() {
  return (
    <Frame>
      <h1>Resumo</h1>
      <Resumo />
    </Frame>
  );
}
```

- [ ] **Step 5: Acrescentar a aba**

Em `src/components/painel/NavPainel.tsx`, na constante `SECOES`, **no fim da lista**:

```ts
const SECOES: Secao[] = [
  { href: '/painel', rotulo: 'agenda' },
  { href: '/painel/dia', rotulo: 'quadro' },
  { href: '/painel/horarios', rotulo: 'horários' },
  { href: '/painel/servicos', rotulo: 'serviços' },
  { href: '/painel/equipe', rotulo: 'equipe', soDono: true },
  // No fim, e junto de `equipe`, porque as duas são as seções de quem
  // administra — e porque entrar no meio reordenaria cinco abas que a equipe
  // já sabe onde ficam. O barbeiro comum continua vendo quatro.
  { href: '/painel/resumo', rotulo: 'resumo', soDono: true },
];
```

> **Nota de projeto:** para o dono, a barra do celular passa a ter 6 itens em `flex-1`. Confira no passo seguinte que "horários" e "resumo" não estão truncados num aparelho de 360px de largura. Se estiverem, a saída **não** é diminuir a fonte — é encurtar "horários" para "horas" ou tirar "resumo" da barra do celular. Leve a decisão para o dono do produto em vez de escolher sozinho.

- [ ] **Step 6: Conferir que a tela funciona de verdade**

Não há teste automatizado de componente neste repo (a suíte é `environment: 'node'`, sem DOM), então a verificação aqui é manual e é obrigatória. Suba o ambiente e confira, nesta ordem:

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-back" && docker compose up -d
cd "/home/jose/Área de trabalho/marcai/Marcai-front" && npm run dev
```

- [ ] Entrar em `http://brutus.localhost:3000/painel/login` como **dono**; a aba "resumo" aparece.
- [ ] `/painel/resumo` abre no mês corrente, com uma linha por barbeiro (inclusive quem tem zero).
- [ ] Os três atalhos trocam o intervalo e acendem sozinhos; mexer num campo de data apaga o atalho aceso.
- [ ] Na aba Rede do navegador, o pedido sai para **`:8000`** (`brutus.localhost:8000/api/painel/resumo`) e não para `:3000`. Se sair para `:3000` com 404, a linha do Step 1 não foi salva.
- [ ] Entrar como **barbeiro comum**: a aba "resumo" não aparece, e ir direto em `/painel/resumo` mostra a mensagem "Só o dono vê o resumo." em vez de tela em branco.
- [ ] Largura de 360px (modo dispositivo do navegador): a barra de baixo com 6 abas não trunca rótulo.

- [ ] **Step 7: Conferir tipos e a suíte do front**

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-front"
npx tsc --noEmit
npm test
```
Expected: `tsc` sem erro; suíte inteira passando.

- [ ] **Step 8: Commit**

```bash
cd "/home/jose/Área de trabalho/marcai/Marcai-front"
git add src/lib/api/client.ts src/lib/api/painelAPI.ts src/lib/api/index.ts \
        src/components/painel/Resumo.tsx src/app/painel/resumo/page.tsx \
        src/components/painel/NavPainel.tsx
git commit -m "resumo: a tela do dono, cortes e gente por barbeiro

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verificação final

Depois das quatro tarefas, antes de considerar pronto:

- [ ] `cd Marcai-back && docker compose run --rm api pytest -q` — suíte inteira verde.
- [ ] `cd Marcai-front && npx tsc --noEmit && npm test` — tipos e suíte verdes.
- [ ] `git -C Marcai-back log --oneline painel-e-avisos..resumo-por-barbeiro` mostra 2 commits; `git -C Marcai-front log --oneline painel-e-avisos..resumo-por-barbeiro` mostra 2.
- [ ] `git -C Marcai-back status --porcelain` e `git -C Marcai-front status --porcelain` mostram **apenas** as alterações que já existiam antes deste plano (`.env.example`, `docker-compose.yml`, `middleware.py`, `proxy.ts`, `rascunho.ts` e companhia). Nenhum arquivo deste plano ficou de fora de um commit.

## Notas para quem for além deste plano

- **Barbeiro ver o próprio número** é uma troca de duas linhas na view (`ExigeDono` → `ExigeSessao`, mais `filtro_do_barbeiro(self.sessao)` no serviço) e tirar o `soDono` da aba. Foi deixado de fora por decisão de produto, não por custo.
- **Faturamento** cabe na mesma consulta (`Sum("preco_centavos")`), mas `preco_centavos` é nulo até o barbeiro definir preço no vínculo — uma coluna de dinheiro com metade em branco é pior que nenhuma. Precisa de decisão de produto sobre o que mostrar no nulo antes de existir.
