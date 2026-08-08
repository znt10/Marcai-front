# Equipe do dono · Plano de Implementação

> **Para quem executa:** SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> ou `superpowers:executing-plans`. Os passos usam caixas (`- [ ]`).

**Objetivo:** o dono monta e mantém a própria equipe, sem passar pelo admin da
plataforma.

**Arquitetura:** seis rotas sob `/api/painel/equipe`, todas atrás de uma guarda
de papel (`ehDono`) que responde 403. A escrita mexe em `Barbeiro` dentro de
`comBarbearia()`, e três mudanças incrementam `tokenVersion` porque `papel`
viaja no token. O link do convite passa a ser montado por um helper único.

**Stack:** Next 16 (route handlers), Prisma 7 + Postgres com RLS, `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-brutus-equipe-design.md`

## Restrições globais

Valem para todas as tarefas, somadas às dos planos anteriores:

- Consulta de dado de barbearia **sempre** dentro de `comBarbearia()`.
- Toda rota de equipe começa por `sessaoDaRequisicao()` + `ehDono()` → **403**.
- **404 continua reservado** para quando a existência do registro é o segredo
  (agendamento de colega). Papel insuficiente é 403.
- `normalizar()` do `telefone.ts` antes de qualquer coisa com celular.
- Nenhuma URL de API em página ou componente: tudo por `src/lib/api/`.
- `fetch` em `useEffect` nasce com `AbortController`.
- Um commit por tarefa, mensagem no imperativo e sem acento na primeira linha.
- `docker compose up -d db` antes de `npm test`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/config.ts` | **Modificar.** `URL_BASE_PUBLICA` |
| `src/lib/convite.ts` | **Modificar.** `linkDoConvite(slug, token)` |
| `src/lib/autorizacao.ts` | **Modificar.** `ehDono(sessao)` |
| `src/lib/mensagens.ts` | **Modificar.** `msgConvite` |
| `src/lib/equipe.ts` | **Criar.** Regras puras: as três recusas |
| `src/app/api/painel/equipe/route.ts` | **Criar.** `GET` e `POST` |
| `src/app/api/painel/equipe/[id]/route.ts` | **Criar.** `PATCH` |
| `src/app/api/painel/equipe/[id]/convite/route.ts` | **Criar.** Reemitir |
| `src/app/api/painel/equipe/[id]/desativar/route.ts` | **Criar.** |
| `src/app/api/painel/equipe/[id]/reativar/route.ts` | **Criar.** |
| `src/lib/api/painelAPI.ts` | **Modificar.** `equipeApi` |
| `src/components/painel/Equipe.tsx` | **Criar.** Lista + estados |
| `src/components/painel/FormBarbeiro.tsx` | **Criar.** Cadastro |
| `src/app/painel/equipe/page.tsx` | **Criar.** |
| `src/components/painel/AgendaDoDia.tsx` | **Modificar.** Link "equipe" só para o dono |
| `tests/equipe.test.ts` | **Criar.** |

---

## Tarefa 1: A URL base sai do código

**Arquivos:** modificar `src/lib/config.ts`, `src/lib/convite.ts`,
`src/app/api/admin/barbearias/route.ts`,
`src/app/api/admin/barbearias/[id]/convite/route.ts`, `.env.example`;
testar em `tests/admin-convite.test.ts`.

**Interfaces:**
- Produz: `URL_BASE_PUBLICA: string`, `linkDoConvite(slug: string, token: string): string`

- [ ] **Passo 1: Escrever o teste que deve falhar**

Acrescentar a `tests/admin-convite.test.ts`:

```ts
import { linkDoConvite } from '@/lib/convite';

describe('linkDoConvite', () => {
  it('em desenvolvimento monta http com porta', () => {
    process.env.NEXT_PUBLIC_DOMINIO_BASE = 'localhost:3000';
    expect(linkDoConvite('brutus', 'abc')).toBe('http://brutus.localhost:3000/convite/abc');
  });

  it('em produção monta https sem porta', () => {
    process.env.NEXT_PUBLIC_DOMINIO_BASE = 'brutus.app.br';
    expect(linkDoConvite('brutus', 'abc')).toBe('https://brutus.brutus.app.br/convite/abc');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar** — `npm test -- tests/admin-convite.test.ts`.
Esperado: FALHA, `linkDoConvite` não existe.

- [ ] **Passo 3: Acrescentar em `src/lib/config.ts`**

```ts
/// `localhost:3000` em desenvolvimento; o domínio de verdade em produção. O
/// esquema é deduzido: quem fala em localhost fala http, o resto fala https —
/// evita uma segunda variável que alguém esqueceria de trocar no deploy.
export const DOMINIO_BASE_PUBLICO =
  process.env.NEXT_PUBLIC_DOMINIO_BASE ?? 'localhost:3000';
```

- [ ] **Passo 4: Acrescentar em `src/lib/convite.ts`**

```ts
import { DOMINIO_BASE_PUBLICO } from './config';

/// O link viaja UMA vez, pelo WhatsApp e pela tela: o banco guarda só o hash.
/// Montado aqui e em nenhum outro lugar — eram três cópias com `http://` e
/// porta 3000 fixos, o que em produção entregaria link quebrado ao dono.
export function linkDoConvite(slug: string, token: string): string {
  const esquema = DOMINIO_BASE_PUBLICO.startsWith('localhost') ? 'http' : 'https';
  return `${esquema}://${slug}.${DOMINIO_BASE_PUBLICO}/convite/${token}`;
}
```

- [ ] **Passo 5: Trocar nos dois lugares do admin**

Em `src/app/api/admin/barbearias/route.ts` e
`src/app/api/admin/barbearias/[id]/convite/route.ts`, substituir a montagem à
mão por `linkDoConvite(slug, convite.token)` e apagar a leitura local de
`NEXT_PUBLIC_DOMINIO_BASE`.

- [ ] **Passo 6: Ajustar o `.env.example`**

`NEXT_PUBLIC_DOMINIO_BASE` passa a incluir a porta em desenvolvimento
(`localhost:3000`). Conferir se `src/lib/slug.ts` usa a mesma variável — se
usar, ela precisa continuar recebendo o host **sem** porta ali, e nesse caso
manter as duas separadas (`NEXT_PUBLIC_DOMINIO_BASE` para o proxy e
`NEXT_PUBLIC_URL_BASE` para o link).

- [ ] **Passo 7: Suíte inteira e commit** — `npm test`, depois
`git commit -m "Monta o link do convite num lugar so"`.

---

## Tarefa 2: A guarda de papel e as regras puras

**Arquivos:** modificar `src/lib/autorizacao.ts`; criar `src/lib/equipe.ts`;
testar em `tests/equipe.test.ts`.

**Interfaces:**
- Produz: `ehDono(sessao: Sessao): boolean`, `naoEhDono(): NextResponse`;
  `podeDesativar(p): string | null`, `podeRebaixar(p): string | null`

- [ ] **Passo 1: Escrever o teste que deve falhar**

Criar `tests/equipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ehDono } from '@/lib/autorizacao';
import { podeDesativar, podeRebaixar } from '@/lib/equipe';

const dono = { sub: 'a', bid: 'b', papel: 'DONO' as const, tv: 0 };
const barbeiro = { ...dono, papel: 'BARBEIRO' as const };

describe('ehDono', () => {
  it('dono é dono, barbeiro não', () => {
    expect(ehDono(dono)).toBe(true);
    expect(ehDono(barbeiro)).toBe(false);
  });
});

describe('podeDesativar', () => {
  const base = {
    ehEuMesmo: false, papel: 'BARBEIRO' as const,
    donosAtivos: 2, agendamentosFuturos: 0, proximoEm: null as Date | null,
  };

  it('caso limpo passa', () => {
    expect(podeDesativar(base)).toBeNull();
  });

  it('a si mesmo é recusado', () => {
    expect(podeDesativar({ ...base, ehEuMesmo: true })).toMatch(/você/i);
  });

  it('último dono é recusado', () => {
    expect(podeDesativar({ ...base, papel: 'DONO', donosAtivos: 1 })).toMatch(/dono/i);
  });

  it('dono com outro dono na casa passa', () => {
    expect(podeDesativar({ ...base, papel: 'DONO', donosAtivos: 2 })).toBeNull();
  });

  it('agenda futura é recusada, e a mensagem traz a contagem', () => {
    const erro = podeDesativar({ ...base, agendamentosFuturos: 7 });
    expect(erro).toContain('7');
  });
});

describe('podeRebaixar', () => {
  it('rebaixar o último dono é recusado', () => {
    expect(podeRebaixar({ donosAtivos: 1 })).toMatch(/dono/i);
  });

  it('havendo outro dono, passa', () => {
    expect(podeRebaixar({ donosAtivos: 2 })).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar** — `npm test -- tests/equipe.test.ts`.

- [ ] **Passo 3: Acrescentar em `src/lib/autorizacao.ts`**

```ts
/// Guarda de PAPEL, irmã de `filtroDoBarbeiro` e com pergunta diferente: aquela
/// decide quais linhas alguém vê, esta decide se pode entrar na rota.
///
/// Quem falha aqui recebe 403, não 404. O 404 do painel existe para não
/// revelar a existência de um registro alheio; aqui não há registro nenhum em
/// jogo, e o barbeiro já sabe que não é dono.
export function ehDono(sessao: Sessao): boolean {
  return sessao.papel === 'DONO';
}
```

- [ ] **Passo 4: Escrever `src/lib/equipe.ts`**

Funções puras devolvendo `null` quando pode, ou a mensagem da recusa. Puras
porque as três recusas são a parte que precisa de teste exaustivo, e assim o
teste não monta cenário de banco.

```ts
export function podeDesativar(p: {
  ehEuMesmo: boolean;
  papel: 'DONO' | 'BARBEIRO';
  donosAtivos: number;
  agendamentosFuturos: number;
  proximoEm: Date | null;
}): string | null {
  if (p.ehEuMesmo) {
    return 'Você não pode se desativar — pede para outro dono fazer isso.';
  }
  if (p.papel === 'DONO' && p.donosAtivos <= 1) {
    return 'Esse é o único dono ativo. Promove outra pessoa antes.';
  }
  if (p.agendamentosFuturos > 0) {
    const quando = p.proximoEm
      ? ` até ${p.proximoEm.toLocaleDateString('pt-BR')}`
      : '';
    return `Tem ${p.agendamentosFuturos} horário(s) marcado(s)${quando}. ` +
           'Cancela ou remarca antes de desativar.';
  }
  return null;
}

export function podeRebaixar(p: { donosAtivos: number }): string | null {
  return p.donosAtivos <= 1
    ? 'Esse é o único dono ativo. Promove outra pessoa antes de rebaixar.'
    : null;
}
```

- [ ] **Passo 5: Rodar até passar e commitar** —
`git commit -m "Separa a guarda de dono e as recusas da equipe"`.

---

## Tarefa 3: `GET /api/painel/equipe`

**Arquivos:** criar `src/app/api/painel/equipe/route.ts`; testar em
`tests/equipe.test.ts`.

**Interfaces:**
- Produz: `GET` devolvendo `{ equipe: MembroDaEquipe[] }` com os campos do §8 do spec

- [ ] **Passo 1: Escrever o teste que deve falhar**

```ts
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { GET as equipe } from '@/app/api/painel/equipe/route';

beforeEach(limparBanco);

const pedido = (jwt: string) =>
  new Request('http://brutus.localhost/api/painel/equipe', {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

describe('GET /api/painel/equipe', () => {
  it('barbeiro recebe 403', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    expect((await equipe(pedido(jwt))).status).toBe(403);
  });

  it('dono vê a equipe com o estado de cada um', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const { equipe: lista } = await (await equipe(pedido(jwt))).json();

    const teo = lista.find((m: { nome: string }) => m.nome === 'Téo');
    expect(teo.papel).toBe('DONO');
    expect(teo.temSenha).toBe(false);          // o cenário nasce sem senha
    expect(teo.servicos).toBe(3);              // Corte, Barba, Pezinho
    expect(teo.expediente).toBe(7);            // o cenário abre os 7 dias
    expect(teo.agendamentosFuturos).toBe(0);
  });

  it('conta o agendamento futuro que impede desativar', async () => {
    const ctx = await montarCenarioBrutus();
    const cliente = await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Zé', whatsapp: '11922221111' },
    });
    const inicio = new Date(Date.now() + 3 * 3600_000);
    await prismaOwner.agendamento.create({
      data: {
        barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
        barbeiroId: ctx.rael.id, clienteId: cliente.id, servicoId: ctx.corte.id,
        servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 1800_000),
        duracaoMin: 30, status: 'CONFIRMADO',
      },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const { equipe: lista } = await (await equipe(pedido(jwt))).json();
    expect(lista.find((m: { nome: string }) => m.nome === 'Rael').agendamentosFuturos).toBe(1);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Escrever a rota**

`GET`: `sessaoDaRequisicao` → `ehDono` (403) → `comBarbearia` com
`tx.barbeiro.findMany({ orderBy: [{ ativo: 'desc' }, { ordem: 'asc' }],
include: { _count: { select: { servicos: true, horarios: true } } } })`, mais
uma contagem de agendamentos futuros por barbeiro
(`tx.agendamento.groupBy({ by: ['barbeiroId'], where: { status: 'CONFIRMADO',
inicio: { gt: new Date() } }, _count: true })`).

Mapear para os campos do §8: `temSenha: b.senhaHash !== null`,
`conviteExpirado: b.senhaHash === null && b.conviteExpiraEm !== null &&
b.conviteExpiraEm < new Date()`, `servicos: b._count.servicos`,
`expediente: b._count.horarios`, `agendamentosFuturos` do `groupBy`.

**`senhaHash` e `conviteTokenHash` nunca entram na resposta** — o `select`
nomeia campo por campo, sem espalhar o objeto do Prisma.

- [ ] **Passo 4: Rodar até passar e commitar** —
`git commit -m "Lista a equipe com o que falta em cada um"`.

---

## Tarefa 4: `POST /api/painel/equipe`

**Arquivos:** modificar `src/app/api/painel/equipe/route.ts`,
`src/lib/mensagens.ts`; testar em `tests/equipe.test.ts`.

- [ ] **Passo 1: Escrever o teste que deve falhar**

```ts
import { POST as cadastrar } from '@/app/api/painel/equipe/route';

const pedidoCadastro = (jwt: string, corpo: unknown) =>
  new Request('http://brutus.localhost/api/painel/equipe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

describe('POST /api/painel/equipe', () => {
  it('cadastra sem senha, com convite, e devolve o link uma vez', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await cadastrar(pedidoCadastro(jwt, {
      nome: 'Duda', whatsapp: '11955556666', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(201);

    const { linkConvite } = await res.json();
    expect(linkConvite).toContain('/convite/');

    const criado = await prismaOwner.barbeiro.findFirstOrThrow({
      where: { barbeariaId: ctx.barbearia.id, nome: 'Duda' },
    });
    expect(criado.senhaHash).toBeNull();
    expect(criado.conviteTokenHash).not.toBeNull();
    expect(criado.conviteExpiraEm!.getTime()).toBeGreaterThan(Date.now());
    // O token em claro NÃO fica no banco: só o hash dele.
    expect(linkConvite).not.toContain(criado.conviteTokenHash!);
  });

  it('celular repetido é 409, inclusive de desativado', async () => {
    const ctx = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: ctx.rael.id }, data: { ativo: false, desativadoEm: new Date() },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await cadastrar(pedidoCadastro(jwt, {
      nome: 'Outro', whatsapp: '11933334444', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).erro).toMatch(/desativado/i);
  });

  it('celular torto é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await cadastrar(pedidoCadastro(jwt, {
      nome: 'Duda', whatsapp: '119', papel: 'BARBEIRO',
    }));
    expect(res.status).toBe(422);
  });

  it('barbeiro sem serviço não aparece na rota pública', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    await cadastrar(pedidoCadastro(jwt, {
      nome: 'Duda', whatsapp: '11955556666', papel: 'BARBEIRO',
    }));

    const { GET: publicos } = await import('@/app/api/barbeiros/route');
    const { barbeiros } = await (await publicos(
      new Request('http://brutus.localhost/api/barbeiros',
                  { headers: { 'x-barbearia-slug': 'brutus' } }),
    )).json();
    expect(barbeiros.map((b: { nome: string }) => b.nome)).not.toContain('Duda');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Texto novo em `src/lib/mensagens.ts`**

```ts
/// Fala com colega de trabalho, não com cliente — e não repete o link no
/// corpo do texto por engano: ele entra uma vez, no fim.
export const msgConvite = (d: { nome: string; barbeariaNome: string; link: string }) =>
  `Oi, ${d.nome.split(' ')[0]}! Você entrou na equipe da ${d.barbeariaNome}. ` +
  `Cria sua senha por aqui pra ver sua agenda:\n\n${d.link}\n\n` +
  `O link vale por 48 horas.`;
```

- [ ] **Passo 4: Escrever o `POST`**

Ordem: `ehDono` → `zod` (`nome` 2–80, `whatsapp` string, `papel` enum) →
`normalizar()` (nulo → 422) → dentro de `comBarbearia`: procurar barbeiro com
aquele `whatsapp` (**sem** filtrar por `ativo`) e devolver 409 com mensagem que
menciona desativado quando for o caso → `gerarConvite()` → `create` com
`senhaHash: null`, `conviteTokenHash`, `conviteExpiraEm`, `ordem` = maior + 1.

Depois do commit: `void enviarTexto(whatsapp, msgConvite({...}))` — o envio é
`fire-and-forget` (§10.2), então WhatsApp fora do ar não derruba o cadastro.
Responder **201** com `{ id, linkConvite }`.

- [ ] **Passo 5: Rodar até passar e commitar** —
`git commit -m "Deixa o dono cadastrar barbeiro e disparar o convite"`.

---

## Tarefa 5: `PATCH`, desativar, reativar e reemitir

**Arquivos:** criar `src/app/api/painel/equipe/[id]/route.ts`,
`.../[id]/desativar/route.ts`, `.../[id]/reativar/route.ts`,
`.../[id]/convite/route.ts`; testar em `tests/equipe.test.ts`.

- [ ] **Passo 1: Escrever o teste que deve falhar**

```ts
import { PATCH as editar } from '@/app/api/painel/equipe/[id]/route';
import { POST as desativar } from '@/app/api/painel/equipe/[id]/desativar/route';
import { POST as reativar } from '@/app/api/painel/equipe/[id]/reativar/route';

const comId = (jwt: string, id: string, caminho: string, corpo?: unknown) => [
  new Request(`http://brutus.localhost/api/painel/equipe/${id}${caminho}`, {
    method: corpo ? 'PATCH' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}`,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }),
  { params: Promise.resolve({ id }) },
] as const;

describe('PATCH e desativar', () => {
  it('rebaixar dono incrementa o tokenVersion', async () => {
    const ctx = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: ctx.rael.id }, data: { papel: 'DONO' },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await editar(...comId(jwt, ctx.rael.id, '', { papel: 'BARBEIRO' }));
    expect(res.status).toBe(200);

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.rael.id } });
    expect(depois.papel).toBe('BARBEIRO');
    expect(depois.tokenVersion).toBe(1);
  });

  it('trocar o celular incrementa o tokenVersion', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    await editar(...comId(jwt, ctx.rael.id, '', { whatsapp: '11988887777' }));
    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.rael.id } });
    expect(depois.whatsapp).toBe('11988887777');
    expect(depois.tokenVersion).toBe(1);
  });

  it('trocar só o nome NÃO derruba a sessão', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    await editar(...comId(jwt, ctx.rael.id, '', { nome: 'Raelzito' }));
    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.rael.id } });
    expect(depois.tokenVersion).toBe(0);
  });

  it('rebaixar o último dono é 409', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await editar(...comId(jwt, ctx.teo.id, '', { papel: 'BARBEIRO' }));
    expect(res.status).toBe(409);
  });

  it('desativar a si mesmo é 409', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    expect((await desativar(...comId(jwt, ctx.teo.id, '/desativar'))).status).toBe(409);
  });

  it('desativar com agenda futura é 409 com a contagem', async () => {
    const ctx = await montarCenarioBrutus();
    const cliente = await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Zé', whatsapp: '11922221111' },
    });
    const inicio = new Date(Date.now() + 3 * 3600_000);
    await prismaOwner.agendamento.create({
      data: {
        barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
        barbeiroId: ctx.rael.id, clienteId: cliente.id, servicoId: ctx.corte.id,
        servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 1800_000),
        duracaoMin: 30, status: 'CONFIRMADO',
      },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await desativar(...comId(jwt, ctx.rael.id, '/desativar'));
    expect(res.status).toBe(409);
    expect((await res.json()).erro).toContain('1');
  });

  it('desativar limpo derruba a sessão e marca a data', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    expect((await desativar(...comId(jwt, ctx.rael.id, '/desativar'))).status).toBe(200);

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.rael.id } });
    expect(depois.ativo).toBe(false);
    expect(depois.desativadoEm).not.toBeNull();
    expect(depois.tokenVersion).toBe(1);
  });

  it('reativar volta atrás', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    await desativar(...comId(jwt, ctx.rael.id, '/desativar'));
    expect((await reativar(...comId(jwt, ctx.rael.id, '/reativar'))).status).toBe(200);

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: ctx.rael.id } });
    expect(depois.ativo).toBe(true);
    expect(depois.desativadoEm).toBeNull();
  });

  it('barbeiro de outra barbearia é 404', async () => {
    const ctx = await montarCenarioBrutus();
    const outra = await prismaOwner.barbearia.create({
      data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
              horarioResumo: 'ter a sáb', whatsappContato: '11977778888' },
    });
    const tony = await prismaOwner.barbeiro.create({
      data: { barbeariaId: outra.id, nome: 'Tony', whatsapp: '11977778888', papel: 'DONO' },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    // O RLS não devolve a linha, e a rota não pode inventar 200.
    expect((await desativar(...comId(jwt, tony.id, '/desativar'))).status).toBe(404);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar.**

- [ ] **Passo 3: Escrever as quatro rotas**

Todas: `sessaoDaRequisicao` → `ehDono` (403) → `comBarbearia` → carregar o
barbeiro pelo id (**não achou é 404** — aqui o 404 é honesto: dentro do tenant
aquele id não existe).

- **`PATCH`**: `zod` com os três campos opcionais. `whatsapp` passa por
  `normalizar` (422) e por unicidade (409). Rebaixar `DONO`→`BARBEIRO` consulta
  `donosAtivos` e chama `podeRebaixar` (409). `tokenVersion: { increment: 1 }`
  **só** quando `papel` ou `whatsapp` mudaram de fato — trocar o nome não pode
  derrubar ninguém.
- **`/desativar`**: contar `donosAtivos` e agendamentos futuros
  (`status: 'CONFIRMADO', inicio: { gt: agora }`, com `_max: { inicio: true }`
  para a data da mensagem), chamar `podeDesativar` (409) e então
  `{ ativo: false, desativadoEm: new Date(), tokenVersion: { increment: 1 } }`.
- **`/reativar`**: `{ ativo: true, desativadoEm: null }`. Não incrementa nada —
  ninguém tem sessão para derrubar.
- **`/convite`**: `gerarConvite()`, gravar `senhaHash: null`,
  `conviteTokenHash`, `conviteExpiraEm`, `tokenVersion: { increment: 1 }`,
  devolver `linkDoConvite(...)` e disparar `msgConvite`. É o mesmo desenho da
  rota do admin — inclusive o `senhaHash: null`, que é o que faz "reemitir
  convite" servir como reset de senha.

- [ ] **Passo 4: Rodar até passar e commitar** —
`git commit -m "Edita, desativa e reativa barbeiro com as tres recusas"`.

---

## Tarefa 6: A tela e o fechamento

**Arquivos:** modificar `src/lib/api/painelAPI.ts`, `src/lib/api/index.ts`,
`src/components/painel/AgendaDoDia.tsx`, `README.md`; criar
`src/components/painel/Equipe.tsx`, `src/components/painel/FormBarbeiro.tsx`,
`src/app/painel/equipe/page.tsx`.

- [ ] **Passo 1: Acrescentar `equipeApi` em `src/lib/api/painelAPI.ts`**

```ts
export type MembroDaEquipe = {
  id: string; nome: string; whatsapp: string;
  papel: 'DONO' | 'BARBEIRO'; ativo: boolean; desativadoEm: string | null;
  temSenha: boolean; conviteExpirado: boolean;
  servicos: number; expediente: number; agendamentosFuturos: number;
};

export const equipeApi = {
  listar: (signal?: AbortSignal) =>
    pedir<{ equipe: MembroDaEquipe[] }>('/painel/equipe', {
      signal, loginEm: LOGIN_DO_PAINEL,
    }).then((d) => d.equipe),

  cadastrar: (dados: { nome: string; whatsapp: string; papel: MembroDaEquipe['papel'] }) =>
    pedir<{ id: string; linkConvite: string }>('/painel/equipe', {
      metodo: 'POST', corpo: dados,
    }),

  editar: (id: string, dados: Partial<{ nome: string; whatsapp: string; papel: MembroDaEquipe['papel'] }>) =>
    pedir<{ ok: true }>(`/painel/equipe/${id}`, { metodo: 'PATCH', corpo: dados }),

  reemitirConvite: (id: string) =>
    pedir<{ linkConvite: string }>(`/painel/equipe/${id}/convite`, { metodo: 'POST' }),

  desativar: (id: string) =>
    pedir<{ ok: true }>(`/painel/equipe/${id}/desativar`, { metodo: 'POST' }),

  reativar: (id: string) =>
    pedir<{ ok: true }>(`/painel/equipe/${id}/reativar`, { metodo: 'POST' }),
};
```

Exportar em `src/lib/api/index.ts`.

- [ ] **Passo 2: Escrever `Equipe.tsx` e `FormBarbeiro.tsx`**

No padrão de `ListaBarbearias.tsx` e `FormBarbearia.tsx` do admin — a
semelhança é útil: as duas telas fazem a mesma coisa em níveis diferentes.

O item da lista mostra nome, celular por `formatar()`, papel, e **os avisos em
destaque**: `sem senha ainda`, `convite expirado`, `sem serviço`, `sem
expediente`. Os dois últimos com a explicação do porquê — "não aparece para o
cliente" —, que é o pedido explícito do design da Etapa 1.

Ações por item: `novo convite`, `promover`/`rebaixar`, `desativar`/`reativar`. A
mensagem de recusa (409) aparece no lugar do erro, sem `alert`.

`fetch` nenhum: tudo por `equipeApi`, e o carregamento em `useEffect` com
`AbortController`.

- [ ] **Passo 3: Escrever `src/app/painel/equipe/page.tsx`**

Formulário em cima, lista embaixo, como o admin.

- [ ] **Passo 4: Link no painel, só para o dono**

Em `AgendaDoDia.tsx`, ao lado de "+ marcar na mão":

```tsx
{eu?.papel === 'DONO' && <a href="/painel/equipe"><Box>equipe</Box></a>}
```

O barbeiro não vê o link. Não é a segurança — essa está no 403 da rota —, é não
oferecer o que vai ser negado.

- [ ] **Passo 5: Conferir no navegador**

```bash
docker compose restart app
```

Entrar como Téo, abrir `/painel/equipe`, cadastrar alguém, ver o link do
convite, tentar desativar quem tem agenda futura, tentar se desativar. Entrar
como Rael e confirmar que o link não aparece e que `/painel/equipe` responde
com a tela vazia (a rota dá 403).

- [ ] **Passo 6: Suíte, README e commit**

```bash
npm test
npx tsc --noEmit
```

Seção nova no README: o dono monta a equipe em `/painel/equipe`; barbeiro novo
nasce sem senha e sem serviço, então **não aparece para o cliente** até a fatia
C existir; desativar é recusado com agenda futura; o último dono não sai.

```bash
git commit -m "Fecha a equipe do dono com suite verde e README"
```

---

## Autorrevisão

**Cobertura do spec:**

| Seção | Tarefa |
|---|---|
| §3 403 aqui, 404 lá | 2, 3, 5 |
| §4 `tokenVersion` nas três mudanças | 5 |
| §5 As três recusas | 2 (regra), 5 (rota) |
| §6 Celular repetido, incluindo desativado | 4 |
| §7 Convite por dois caminhos | 4, 5 |
| §7 A URL base sai do código | 1 |
| §8 Rotas | 3, 4, 5 |
| §9 A tela e os avisos | 6 |
| §10 Testes | 2, 3, 4, 5 |

**Lacunas conhecidas e conscientes:**

- O `GET` faz duas consultas (barbeiros + `groupBy` de agendamentos) em vez de
  uma. Uma equipe tem unidades, não milhares; juntar tudo num `select` com
  subconsulta correlacionada custaria legibilidade sem ganho medível.
- `podeDesativar` formata data com `toLocaleDateString('pt-BR')` no servidor, o
  que ignora o fuso do §7 do cliente. Para "até sexta" numa mensagem de erro a
  diferença é irrelevante; se virar texto de tela, passa por `datas.ts`.
- A tela não tem confirmação dupla em desativar — a recusa por agenda futura já
  é o freio que importa, e reativar é um clique.
- Não há teste de que o dono **não** consegue mexer em barbeiro de outra
  barbearia por `PATCH` (só por `desativar`). O caminho é o mesmo e o RLS é o
  que barra; um caso por rota seria repetição do mesmo mecanismo.
- Nada impede promover todo mundo a `DONO`. Barbearia com cinco donos é escolha
  da casa, não erro do sistema.
