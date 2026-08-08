# Expediente e bloqueios · Plano de Implementação

> **Para quem executa:** SKILL OBRIGATÓRIA: `superpowers:executing-plans` ou
> `superpowers:subagent-driven-development`. Passos com caixas (`- [ ]`).

**Objetivo:** cada barbeiro passa a ter jornada e folga editáveis, e o motor de
horários enxerga isso sem nenhuma mudança nele.

**Arquitetura:** seis rotas sob `/api/painel`, todas passando por
`filtroDoBarbeiro` (dono edita de todos, barbeiro só o seu). A escrita mexe em
`HorarioTrabalho` e `Bloqueio` — as duas tabelas que `slots.ts` já lê. Nenhuma
linha de `slots.ts` muda.

**Spec:** `docs/superpowers/specs/2026-08-07-brutus-expediente-design.md`

## Restrições globais

Somadas às dos planos anteriores:

- **`src/lib/slots.ts` não é alterado.** Se parecer que precisa, é sinal de que
  a escrita está produzindo estado errado — conserta a escrita.
- Alcance por `filtroDoBarbeiro`; mexer em registro alheio é **404**.
- Todo teste de escrita confere o efeito em `slotsDoDia`, não só a linha.
- Nenhuma URL de API em componente: tudo por `src/lib/api/`.
- `fetch` em `useEffect` com `AbortController`.
- Um commit por tarefa. `docker compose up -d db` antes de `npm test`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/horarios.ts` | **Criar.** Validações puras de jornada e bloqueio |
| `src/app/api/painel/expediente/route.ts` | **Criar.** `GET`, `PUT`, `DELETE` |
| `src/app/api/painel/bloqueios/route.ts` | **Criar.** `POST` |
| `src/app/api/painel/bloqueios/[id]/route.ts` | **Criar.** `DELETE` |
| `src/app/api/painel/conflitos/route.ts` | **Criar.** `GET` |
| `src/lib/api/painelAPI.ts` | **Modificar.** `horariosApi` |
| `src/components/painel/Horarios.tsx` | **Criar.** Sete dias + bloqueios |
| `src/app/painel/horarios/page.tsx` | **Criar.** |
| `src/components/painel/AgendaDoDia.tsx` | **Modificar.** Link "horários" |
| `tests/expediente.test.ts` | **Criar.** |

---

## Tarefa 1: Validações puras

**Interfaces:** produz `jornadaValida(p): string | null`,
`bloqueioValido(p): string | null` em `src/lib/horarios.ts`.

- [ ] **Passo 1: Teste que falha** — `tests/expediente.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { jornadaValida, bloqueioValido } from '@/lib/horarios';

describe('jornadaValida', () => {
  it('9h às 20h passa', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540, minutosFim: 1200 })).toBeNull();
  });
  it('fim antes do início é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 1200, minutosFim: 540 })).not.toBeNull();
  });
  it('fim igual ao início é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540, minutosFim: 540 })).not.toBeNull();
  });
  it('além das 24h é recusado', () => {
    expect(jornadaValida({ diaSemana: 3, minutosInicio: 540, minutosFim: 1500 })).not.toBeNull();
  });
  it('dia fora de 0..6 é recusado', () => {
    expect(jornadaValida({ diaSemana: 7, minutosInicio: 540, minutosFim: 1200 })).not.toBeNull();
  });
});

describe('bloqueioValido', () => {
  const semanal = { repeteSemanalmente: true, diaSemana: 3,
                    minutosInicio: 720, minutosFim: 780, inicio: null, fim: null };
  const pontual = { repeteSemanalmente: false, diaSemana: null,
                    minutosInicio: null, minutosFim: null,
                    inicio: new Date('2026-08-10T12:00:00Z'),
                    fim: new Date('2026-08-10T13:00:00Z') };

  it('semanal completo passa', () => expect(bloqueioValido(semanal)).toBeNull());
  it('pontual completo passa', () => expect(bloqueioValido(pontual)).toBeNull());

  it('semanal sem dia é recusado', () => {
    expect(bloqueioValido({ ...semanal, diaSemana: null })).not.toBeNull();
  });
  it('pontual sem fim é recusado', () => {
    expect(bloqueioValido({ ...pontual, fim: null })).not.toBeNull();
  });
  it('pontual com fim antes do início é recusado', () => {
    expect(bloqueioValido({ ...pontual, fim: new Date('2026-08-10T11:00:00Z') })).not.toBeNull();
  });
  // Os dois conjuntos juntos criariam uma linha cuja interpretação depende de
  // qual campo alguém leu primeiro.
  it('os dois formatos juntos é recusado', () => {
    expect(bloqueioValido({ ...semanal, inicio: pontual.inicio, fim: pontual.fim })).not.toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Escrever `src/lib/horarios.ts`** — funções puras devolvendo
  `null` ou a mensagem, no mesmo formato de `src/lib/equipe.ts`. `MINUTOS_DIA =
  24 * 60`.
- [ ] **Passo 4: Rodar até passar e commitar.**

---

## Tarefa 2: Expediente

**Rotas:** `GET`, `PUT`, `DELETE` em `/api/painel/expediente`.

- [ ] **Passo 1: Teste que falha** — além do CRUD, os dois que atravessam a
fronteira:

```ts
it('definir jornada faz o motor oferecer horário', async () => {
  const ctx = await montarCenarioBrutus();
  // O cenário abre os 7 dias; fecha-se um para provar o efeito de criar.
  await prismaOwner.horarioTrabalho.deleteMany({ where: { barbeiroId: ctx.rael.id } });
  const jwt = await sessaoDe(ctx, 'rael');

  const antes = await slotsDoDiaDe(ctx, ctx.rael.id);
  expect(antes).toHaveLength(0);

  await definir(pedidoPut(jwt, {
    diaSemana: diaSemanaDe(diaDeHoje(new Date())),
    minutosInicio: 0, minutosFim: 24 * 60,
  }));

  const depois = await slotsDoDiaDe(ctx, ctx.rael.id);
  expect(depois.length).toBeGreaterThan(0);
});

it('fechar o dia zera a agenda daquele dia', async () => { /* DELETE, mesma forma */ });
it('mexer no expediente do colega é 404', async () => { /* barbeiro -> id do Téo */ });
it('o dono define o de qualquer um', async () => { /* 200 */ });
```

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Escrever a rota.** `GET` devolve
  `{ expediente: [...7 dias...], bloqueios: [...] }` do barbeiro pedido (ou de
  quem está logado). `PUT` faz `upsert` por `barbeiroId_diaSemana`. `DELETE`
  apaga a linha do dia. Alcance por `filtroDoBarbeiro`: o `barbeiroId` da query
  só é honrado para `DONO`; barbeiro pedindo outro id recebe **404**.
- [ ] **Passo 4: Rodar até passar e commitar.**

---

## Tarefa 3: Bloqueios

- [ ] **Passo 1: Teste que falha**

```ts
it('bloqueio semanal tira os slots daquela faixa', async () => { /* … */ });
it('bloqueio semanal não afeta outro dia da semana', async () => { /* … */ });
it('bloqueio pontual tira os slots do dia', async () => { /* … */ });
it('bloqueio pontual não afeta a mesma hora na semana seguinte', async () => { /* … */ });
it('apagar o bloqueio devolve os slots', async () => { /* … */ });
it('bloqueio de colega é 404 ao apagar', async () => { /* … */ });
it('os dois formatos juntos é 422', async () => { /* … */ });
```

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Escrever `POST /api/painel/bloqueios` e
  `DELETE /api/painel/bloqueios/[id]`.** `POST` valida por `bloqueioValido` e
  grava com o `barbeiroId` do alcance. `DELETE` carrega o bloqueio, confere o
  alcance **depois** de carregar (404, nunca 403) e apaga.
- [ ] **Passo 4: Rodar até passar e commitar.**

---

## Tarefa 4: Conflitos

- [ ] **Passo 1: Teste que falha**

```ts
it('lista o agendamento que ficou fora do expediente encurtado', async () => { /* … */ });
it('lista o que caiu dentro de bloqueio novo', async () => { /* … */ });
it('não lista agendamento passado nem cancelado', async () => { /* … */ });
```

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Escrever `GET /api/painel/conflitos`.** Carrega os
  `CONFIRMADO` futuros do alcance, mais expediente e bloqueios, e marca como
  conflito quem cai fora da jornada do seu dia da semana **ou** colide com
  bloqueio. A colisão usa a mesma regra de intervalo semiaberto do motor —
  exportar `colide` de `slots.ts` se preciso, **sem alterar o cálculo**.
- [ ] **Passo 4: Rodar até passar e commitar.**

---

## Tarefa 5: A tela

- [ ] **Passo 1:** `horariosApi` em `src/lib/api/painelAPI.ts` (listar, definir
  dia, fechar dia, criar bloqueio, apagar bloqueio, conflitos), exportado no
  `index.ts`.
- [ ] **Passo 2:** `src/components/painel/Horarios.tsx` — sete linhas de dia com
  início/fim ou "fechado", lista de bloqueios separada em "toda semana" e "uma
  vez", e o painel de conflitos depois de salvar, com o botão que chama o
  cancelamento que já existe.
- [ ] **Passo 3:** `src/app/painel/horarios/page.tsx` e o link em
  `AgendaDoDia.tsx` (para todos, não só o dono — cada um mexe no seu).
- [ ] **Passo 4: Conferir no navegador** e commitar.

---

## Tarefa 6: Fechamento

- [ ] `npm test`, `npx tsc --noEmit`, seção no README, commit e PR.

---

## Autorrevisão

| Seção do spec | Tarefa |
|---|---|
| §3 Quem edita, 404 no alheio | 2, 3 |
| §4 Um intervalo por dia; fechar é apagar | 2 |
| §5 Conflito passa e é listado | 4 |
| §6 Rotas e validação | 1, 2, 3, 4 |
| §7 Tela | 5 |
| §8 Testes | 1–4 |

**Lacunas conscientes:**

- `GET /conflitos` recalcula tudo a cada chamada, sem cache. São dezenas de
  agendamentos por barbeiro; medir antes de otimizar.
- Bloqueio pontual não valida se cai dentro do expediente — bloquear domingo
  inteiro é inútil, mas não é erro, e recusar exigiria explicar por quê.
- O `PUT` de expediente não avisa que existem conflitos; quem quer saber chama
  `/conflitos`. A tela chama as duas em sequência.
