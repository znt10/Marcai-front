# Painel do barbeiro · Plano de Implementação

> **Para quem executa:** SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development`
> (recomendada) ou `superpowers:executing-plans` para implementar tarefa a tarefa.
> Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o barbeiro entra no sistema, vê a agenda do dia, marca cliente na
mão e cancela — para o caderno do balcão acabar.

**Arquitetura:** sessão em JWT (`jose`) num cookie `httpOnly`, conferida em duas
camadas — o `proxy.ts` (Edge) barra quem não tem assinatura válida, e cada rota
confere `bid`, `tokenVersion` e `ativo`, que precisam do banco. A autorização
"só o que é dele" passa por uma função só (`filtroDoBarbeiro`). A escrita
reaproveita a transação e a *exclusion constraint* que o fluxo público já usa.

**Stack:** Next 16 (`proxy.ts`, route handlers), Prisma 7 + Postgres 16 com RLS,
`jose`, `@node-rs/argon2`, `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-07-brutus-painel-do-barbeiro-design.md`

## Restrições globais

Valem para **todas** as tarefas, somadas às dos planos da Etapa 1 e do admin:

- **Nunca** consultar dado de barbearia fora de `comBarbearia()`. O RLS devolve
  zero linhas e o bug parece "sumiu tudo".
- **`proxy.ts` roda em Edge.** O que ele importa entra no bundle dele: nada de
  Prisma nem de `@node-rs/argon2` na cadeia de importação de `src/lib/auth.ts`.
- **`SESSAO_JWT_SECRET` é diferente de `ADMIN_JWT_SECRET`.** É o que faz cookie
  de admin não abrir o painel e vice-versa, sem checagem escrita para isso.
- **Resposta de login é sempre a mesma** — `celular ou senha inválidos` — e o
  `verify` do argon2 roda mesmo quando o barbeiro não existe.
- Nenhuma consulta do painel monta filtro de barbeiro por fora de
  `filtroDoBarbeiro()`.
- Ação sobre registro de outro barbeiro responde **404**, nunca 403.
- Rodar os testes com `npm test` (o `dotenv -e .env` já vem no script). O banco
  de teste precisa estar de pé: `docker compose up -d db`.
- Um commit por tarefa, mensagem em português no imperativo, sem acentos na
  primeira linha (o histórico do projeto é assim).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/auth.ts` | **Criar.** Emitir e ler o JWT da sessão. Sem Prisma, sem argon2 — é o que o Edge importa |
| `src/lib/trava-barbeiro.ts` | **Criar.** Funções puras da trava: está travado? qual o próximo estado? |
| `src/lib/sessao-painel.ts` | **Criar.** Abre a sessão dentro da rota: cookie → `bid` → `tokenVersion` → `ativo`. Importa Prisma; **nunca** entra no proxy |
| `src/lib/autorizacao.ts` | **Criar.** `filtroDoBarbeiro()`, o ponto de passagem único |
| `src/app/api/auth/login/route.ts` | **Criar.** Login, trava por barbeiro |
| `src/app/api/auth/logout/route.ts` | **Criar.** Apaga o cookie |
| `src/app/api/auth/eu/route.ts` | **Criar.** Nome, papel e id para a tela |
| `src/app/api/painel/agenda/route.ts` | **Criar.** Agenda do dia no alcance da sessão |
| `src/app/api/painel/agendamentos/route.ts` | **Criar.** Marcar na mão |
| `src/app/api/painel/agendamentos/[id]/cancelar/route.ts` | **Criar.** Cancelar |
| `src/app/painel/login/page.tsx` | **Criar.** Tela de entrada |
| `src/app/painel/page.tsx` | **Substituir o stub.** Agenda do dia |
| `src/app/painel/novo/page.tsx` | **Criar.** Marcar na mão |
| `src/components/painel/*` | **Criar.** Formulário de login, lista do dia, formulário de marcação |
| `src/proxy.ts` | **Modificar.** Peneira grossa de `/painel` e `/api/painel` |
| `src/lib/config.ts` | **Modificar.** Quatro constantes novas |
| `src/lib/mensagens.ts` | **Modificar.** Texto do cancelamento pela barbearia |
| `tests/auth.test.ts` | **Criar.** Sessão, senha, trava, os dois cruzamentos |
| `tests/painel.test.ts` | **Criar.** Alcance, 404 do colega, 409, cancelar |

---

## Tarefa 1: A sessão do barbeiro

**Arquivos:**
- Criar: `src/lib/auth.ts`
- Modificar: `src/lib/config.ts`, `.env`, `.env.example`
- Testar: `tests/auth.test.ts`

**Interfaces:**
- Consome: `SESSAO_BARBEIRO_HORAS` de `config.ts`
- Produz: `COOKIE_SESSAO: string`, `type Sessao = { sub: string; bid: string; papel: 'DONO' | 'BARBEIRO'; tv: number }`, `emitirSessao(s: Sessao): Promise<string>`, `lerSessao(jwt: string | undefined): Promise<Sessao | null>`

- [ ] **Passo 1: Acrescentar as constantes em `src/lib/config.ts`**

Ao fim do arquivo:

```ts
// Sessão do barbeiro (cliente §9.5, painel §3)
export const SESSAO_BARBEIRO_HORAS = 12;      // um turno
export const BARBEIRO_TRAVA_TENTATIVAS = 5;
export const BARBEIRO_TRAVA_MIN = 15;

// Padrão da tela de marcar na mão (painel §7)
export const PAINEL_ANTECEDENCIA_PADRAO_MIN = 30;
```

- [ ] **Passo 2: Acrescentar a variável de ambiente**

No `.env.example`, embaixo das três do admin:

```
# Sessao do barbeiro — DIFERENTE do ADMIN_JWT_SECRET de proposito (painel §3)
SESSAO_JWT_SECRET=""
```

No `.env` (que não vai para o versionamento), gerar um valor de verdade:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- [ ] **Passo 3: Escrever o teste que deve falhar**

Criar `tests/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { emitirSessao, lerSessao, type Sessao } from '@/lib/auth';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
  process.env.ADMIN_JWT_SECRET  = 'segredo-do-admin-com-mais-de-32-bytes-aqui';
});

const sessao: Sessao = {
  sub: '11111111-1111-1111-1111-111111111111',
  bid: '22222222-2222-2222-2222-222222222222',
  papel: 'BARBEIRO',
  tv: 0,
};

describe('sessão do barbeiro', () => {
  it('o que é emitido volta inteiro', async () => {
    expect(await lerSessao(await emitirSessao(sessao))).toEqual(sessao);
  });

  it('cookie ausente não é sessão', async () => {
    expect(await lerSessao(undefined)).toBeNull();
  });

  it('token adulterado é recusado', async () => {
    const jwt = await emitirSessao(sessao);
    expect(await lerSessao(jwt.slice(0, -2) + 'xx')).toBeNull();
  });

  // O mecanismo por trás do teste cruzado da Tarefa 4: os dois segredos são
  // diferentes, então nem o painel lê cookie de admin nem o contrário.
  it('token assinado com o segredo do admin não abre o painel', async () => {
    const { SignJWT } = await import('jose');
    const doAdmin = await new SignJWT({ bid: sessao.bid, papel: 'DONO', tv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(sessao.sub)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET));
    expect(await lerSessao(doAdmin)).toBeNull();
  });
});
```

- [ ] **Passo 4: Rodar e ver falhar**

```bash
npm test -- tests/auth.test.ts
```

Esperado: FALHA com "Cannot find module '@/lib/auth'".

- [ ] **Passo 5: Escrever `src/lib/auth.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';
import { SESSAO_BARBEIRO_HORAS } from './config';

/// Só `jose` aqui. Este módulo é importado pelo `proxy.ts`, que roda no
/// runtime Edge: Prisma e argon2 (binário nativo) não rodam lá. A conferência
/// que precisa de banco mora em `sessao-painel.ts`, que o proxy não importa.

export const COOKIE_SESSAO = 'sessao';

export type Sessao = {
  sub: string;                        // barbeiroId
  bid: string;                        // barbeariaId — a conferência de §3
  papel: 'DONO' | 'BARBEIRO';
  tv: number;                         // tokenVersion
};

/// Lido a cada uso, não capturado numa constante de módulo: trocar
/// SESSAO_JWT_SECRET tem que derrubar toda sessão na hora.
const segredo = () => new TextEncoder().encode(process.env.SESSAO_JWT_SECRET);

export function emitirSessao(s: Sessao): Promise<string> {
  return new SignJWT({ bid: s.bid, papel: s.papel, tv: s.tv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSAO_BARBEIRO_HORAS}h`)
    .sign(segredo());
}

export async function lerSessao(jwt: string | undefined): Promise<Sessao | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, segredo());
    const { sub, bid, papel, tv } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof bid !== 'string') return null;
    if (papel !== 'DONO' && papel !== 'BARBEIRO') return null;
    if (typeof tv !== 'number') return null;
    return { sub, bid, papel, tv };
  } catch {
    return null;
  }
}
```

- [ ] **Passo 6: Rodar até passar**

```bash
npm test -- tests/auth.test.ts
```

Esperado: 4 passam.

- [ ] **Passo 7: Commit**

```bash
git add src/lib/auth.ts src/lib/config.ts .env.example tests/auth.test.ts
git commit -m "Adiciona a sessao do barbeiro com segredo proprio"
```

---

## Tarefa 2: A trava por barbeiro

**Arquivos:**
- Criar: `src/lib/trava-barbeiro.ts`
- Testar: `tests/auth.test.ts` (acrescentar bloco)

**Interfaces:**
- Consome: `BARBEIRO_TRAVA_TENTATIVAS`, `BARBEIRO_TRAVA_MIN` de `config.ts`
- Produz: `estaTravado(b: { bloqueadoAte: Date | null }, agora?: Date): boolean`, `aposFalha(tentativas: number, agora?: Date): { tentativasLogin: number; bloqueadoAte: Date | null }`, `LIMPO: { tentativasLogin: 0; bloqueadoAte: null }`

Funções **puras**, sem banco: a rota do login aplica o resultado com um
`update`. Assim a regra é testável sem cenário, e o teste da regra não depende
de Postgres de pé.

- [ ] **Passo 1: Escrever o teste que deve falhar**

Acrescentar a `tests/auth.test.ts`:

```ts
import { estaTravado, aposFalha, LIMPO } from '@/lib/trava-barbeiro';
import { BARBEIRO_TRAVA_TENTATIVAS, BARBEIRO_TRAVA_MIN } from '@/lib/config';

describe('trava por barbeiro', () => {
  const agora = new Date('2026-08-07T12:00:00Z');

  it('barbeiro sem bloqueio não está travado', () => {
    expect(estaTravado({ bloqueadoAte: null }, agora)).toBe(false);
  });

  it('bloqueio que já venceu não trava', () => {
    const antes = new Date(agora.getTime() - 60_000);
    expect(estaTravado({ bloqueadoAte: antes }, agora)).toBe(false);
  });

  it('bloqueio no futuro trava', () => {
    const depois = new Date(agora.getTime() + 60_000);
    expect(estaTravado({ bloqueadoAte: depois }, agora)).toBe(true);
  });

  it('errar antes do limite só conta', () => {
    const r = aposFalha(0, agora);
    expect(r).toEqual({ tentativasLogin: 1, bloqueadoAte: null });
  });

  it('a quinta falha bloqueia por 15 minutos', () => {
    const r = aposFalha(BARBEIRO_TRAVA_TENTATIVAS - 1, agora);
    expect(r.tentativasLogin).toBe(BARBEIRO_TRAVA_TENTATIVAS);
    expect(r.bloqueadoAte).not.toBeNull();
    const min = (r.bloqueadoAte!.getTime() - agora.getTime()) / 60_000;
    expect(Math.round(min)).toBe(BARBEIRO_TRAVA_MIN);
  });

  it('acertar zera tudo', () => {
    expect(LIMPO).toEqual({ tentativasLogin: 0, bloqueadoAte: null });
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/auth.test.ts
```

Esperado: FALHA com "Cannot find module '@/lib/trava-barbeiro'".

- [ ] **Passo 3: Escrever `src/lib/trava-barbeiro.ts`**

```ts
import { BARBEIRO_TRAVA_TENTATIVAS, BARBEIRO_TRAVA_MIN } from './config';

/// A trava do barbeiro é POR CONTA e mora no BANCO — o oposto da trava do
/// admin, que é por IP e vive em memória (admin §4). Os dois motivos:
///
/// - a barbearia inteira sai do mesmo IP, e travar o IP derrubaria a equipe
///   por causa de um funcionário desmemoriado;
/// - são muitas contas, então o atacante que espera o processo reciclar
///   zeraria o contador de graça.

export const LIMPO = { tentativasLogin: 0, bloqueadoAte: null } as const;

export function estaTravado(
  b: { bloqueadoAte: Date | null },
  agora: Date = new Date(),
): boolean {
  return b.bloqueadoAte !== null && b.bloqueadoAte > agora;
}

export function aposFalha(
  tentativas: number,
  agora: Date = new Date(),
): { tentativasLogin: number; bloqueadoAte: Date | null } {
  const tentativasLogin = tentativas + 1;
  return {
    tentativasLogin,
    bloqueadoAte: tentativasLogin >= BARBEIRO_TRAVA_TENTATIVAS
      ? new Date(agora.getTime() + BARBEIRO_TRAVA_MIN * 60_000)
      : null,
  };
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/auth.test.ts
```

Esperado: 10 passam.

- [ ] **Passo 5: Commit**

```bash
git add src/lib/trava-barbeiro.ts tests/auth.test.ts
git commit -m "Trava o barbeiro por 15 minutos depois de 5 erros"
```

---

## Tarefa 3: Login, logout e `eu`

**Arquivos:**
- Criar: `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/api/auth/eu/route.ts`
- Criar: `src/lib/sessao-painel.ts`
- Testar: `tests/auth.test.ts` (acrescentar bloco)

**Interfaces:**
- Consome: `emitirSessao`, `lerSessao`, `COOKIE_SESSAO`, `Sessao` (Tarefa 1); `estaTravado`, `aposFalha`, `LIMPO` (Tarefa 2); `barbeariaDaRequisicao`, `comBarbearia` de `@/lib/tenant`; `normalizar` de `@/lib/telefone`
- Produz: `lerCookie(req: Request, nome: string): string | undefined`, `sessaoDaRequisicao(req: Request): Promise<{ sessao: Sessao; barbearia: Barbearia } | null>`, `naoAutorizado(): NextResponse` — todos em `sessao-painel.ts`

- [ ] **Passo 1: Escrever o teste que deve falhar**

Acrescentar a `tests/auth.test.ts` (o arquivo passa a precisar do banco, como
`tests/api-agendar.test.ts` já faz):

```ts
import { beforeEach } from 'vitest';
import { hash } from '@node-rs/argon2';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { POST as login } from '@/app/api/auth/login/route';

/// Sem isto, a segunda chamada de montarCenarioBrutus() estoura o slug único
/// — e o `limparBanco` também zera o cache de slug→Barbearia, que guardaria
/// um id que o TRUNCATE acabou de apagar.
beforeEach(limparBanco);

const pedidoLogin = (corpo: unknown, host = 'brutus') =>
  new Request(`http://${host}.localhost/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-barbearia-slug': host },
    body: JSON.stringify(corpo),
  });

describe('POST /api/auth/login', () => {
  it('celular e senha certos devolvem cookie de sessão', async () => {
    const { teo } = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: teo.id }, data: { senhaHash: await hash('senha-do-teo') },
    });

    const res = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'senha-do-teo' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('sessao=');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('senha errada responde o mesmo que celular inexistente', async () => {
    const { teo } = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: teo.id }, data: { senhaHash: await hash('senha-do-teo') },
    });

    const errada = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'chutando' }));
    const inexistente = await login(pedidoLogin({ whatsapp: '11900000000', senha: 'chutando' }));

    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(await errada.json()).toEqual(await inexistente.json());
  });

  it('barbeiro sem senha ainda não entra', async () => {
    await montarCenarioBrutus();   // Téo e Rael nascem com senhaHash nulo
    const res = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'qualquer' }));
    expect(res.status).toBe(401);
  });

  it('cinco erros travam a conta', async () => {
    const { teo } = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: teo.id }, data: { senhaHash: await hash('senha-do-teo') },
    });

    for (let i = 0; i < 5; i++) {
      await login(pedidoLogin({ whatsapp: '11911112222', senha: 'chutando' }));
    }
    // Agora nem a senha certa entra.
    const res = await login(pedidoLogin({ whatsapp: '11911112222', senha: 'senha-do-teo' }));
    expect(res.status).toBe(429);

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: teo.id } });
    expect(depois.bloqueadoAte).not.toBeNull();
  });

  it('acertar zera o contador', async () => {
    const { teo } = await montarCenarioBrutus();
    await prismaOwner.barbeiro.update({
      where: { id: teo.id }, data: { senhaHash: await hash('senha-do-teo') },
    });

    await login(pedidoLogin({ whatsapp: '11911112222', senha: 'chutando' }));
    await login(pedidoLogin({ whatsapp: '11911112222', senha: 'senha-do-teo' }));

    const depois = await prismaOwner.barbeiro.findUniqueOrThrow({ where: { id: teo.id } });
    expect(depois.tentativasLogin).toBe(0);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose up -d db && npm test -- tests/auth.test.ts
```

Esperado: FALHA com "Cannot find module '@/app/api/auth/login/route'".

- [ ] **Passo 3: Escrever `src/lib/sessao-painel.ts`**

```ts
import { NextResponse } from 'next/server';
import type { Barbearia } from '@prisma/client';
import { barbeariaDaRequisicao, comBarbearia } from './tenant';
import { lerSessao, COOKIE_SESSAO, type Sessao } from './auth';

/// Este módulo importa Prisma: NUNCA pode ser importado pelo `proxy.ts`.
/// O proxy é a peneira grossa (assinatura e validade, que rodam em Edge); as
/// três conferências que precisam do banco moram aqui (painel §3).

export function lerCookie(req: Request, nome: string): string | undefined {
  for (const parte of (req.headers.get('cookie') ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return undefined;
}

/// 401 com o cookie APAGADO. Sessão morta que fica no navegador vira 401 em
/// laço na tela seguinte, e o barbeiro liga achando que o sistema caiu.
export function naoAutorizado(): NextResponse {
  const res = NextResponse.json({ erro: 'não autorizado' }, { status: 401 });
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', maxAge: 0 });
  return res;
}

export async function sessaoDaRequisicao(
  req: Request,
): Promise<{ sessao: Sessao; barbearia: Barbearia } | null> {
  const barbearia = await barbeariaDaRequisicao(req);
  const sessao = await lerSessao(lerCookie(req, COOKIE_SESSAO));
  if (!sessao) return null;

  // A conferência que impede o pior bug do multi-tenant (cliente §9.5): o
  // token é válido, o barbeiro existe — e mesmo assim não vale neste host.
  if (sessao.bid !== barbearia.id) return null;

  const barbeiro = await comBarbearia(barbearia.id, (tx) =>
    tx.barbeiro.findUnique({
      where: { id: sessao.sub },
      select: { ativo: true, tokenVersion: true },
    }),
  );
  if (!barbeiro || !barbeiro.ativo) return null;
  if (barbeiro.tokenVersion !== sessao.tv) return null;

  return { sessao, barbearia };
}
```

- [ ] **Passo 4: Escrever `src/app/api/auth/login/route.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { barbeariaDaRequisicao, comBarbearia } from '@/lib/tenant';
import { normalizar } from '@/lib/telefone';
import { emitirSessao, COOKIE_SESSAO } from '@/lib/auth';
import { estaTravado, aposFalha, LIMPO } from '@/lib/trava-barbeiro';
import { SESSAO_BARBEIRO_HORAS } from '@/lib/config';

const Corpo = z.object({ whatsapp: z.string(), senha: z.string() });

/// Uma resposta só, para celular inexistente, senha errada e barbeiro sem
/// senha. Enumerar a equipe pelo formulário de login não pode ser possível.
const INVALIDO = { erro: 'Celular ou senha inválidos.' };

/// O `verify` roda SEMPRE, mesmo sem barbeiro, contra este hash descartável.
/// Sem isso o tempo de resposta denuncia quais números existem, e a resposta
/// genérica vira teatro: o atacante lê a diferença no relógio.
let descartavel: Promise<string> | null = null;
const hashDescartavel = () => (descartavel ??= hash(randomUUID()));

export async function POST(req: Request) {
  const barbearia = await barbeariaDaRequisicao(req);

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) return NextResponse.json(INVALIDO, { status: 401 });

  const whatsapp = normalizar(parse.data.whatsapp);
  const agora = new Date();

  const resultado = await comBarbearia(barbearia.id, async (tx) => {
    const barbeiro = whatsapp
      ? await tx.barbeiro.findUnique({
          where: { barbeariaId_whatsapp: { barbeariaId: barbearia.id, whatsapp } },
        })
      : null;

    if (barbeiro && estaTravado(barbeiro, agora)) return { tipo: 'travado' as const };

    const confere = barbeiro?.senhaHash
      ? await verify(barbeiro.senhaHash, parse.data.senha).catch(() => false)
      : await verify(await hashDescartavel(), parse.data.senha).catch(() => false);

    if (!barbeiro || !barbeiro.senhaHash || !confere) {
      if (barbeiro) {
        await tx.barbeiro.update({
          where: { id: barbeiro.id },
          data: aposFalha(barbeiro.tentativasLogin, agora),
        });
      }
      return { tipo: 'invalido' as const };
    }

    if (barbeiro.tentativasLogin !== 0 || barbeiro.bloqueadoAte !== null) {
      await tx.barbeiro.update({ where: { id: barbeiro.id }, data: LIMPO });
    }
    return { tipo: 'ok' as const, barbeiro };
  });

  if (resultado.tipo === 'travado') {
    return NextResponse.json(
      { erro: 'Muitas tentativas. Tenta de novo daqui a pouco.' }, { status: 429 });
  }
  if (resultado.tipo === 'invalido') {
    return NextResponse.json(INVALIDO, { status: 401 });
  }

  const { barbeiro } = resultado;
  const jwt = await emitirSessao({
    sub: barbeiro.id, bid: barbearia.id,
    papel: barbeiro.papel, tv: barbeiro.tokenVersion,
  });

  const res = NextResponse.json({ nome: barbeiro.nome, papel: barbeiro.papel });
  res.cookies.set(COOKIE_SESSAO, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSAO_BARBEIRO_HORAS * 3600,
  });
  return res;
}
```

- [ ] **Passo 5: Escrever `src/app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { COOKIE_SESSAO } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, '', { path: '/', maxAge: 0 });
  return res;
}
```

- [ ] **Passo 6: Escrever `src/app/api/auth/eu/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const barbeiro = await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.barbeiro.findUniqueOrThrow({
      where: { id: aberta.sessao.sub },
      select: { id: true, nome: true, papel: true },
    }),
  );
  return NextResponse.json(barbeiro);
}
```

- [ ] **Passo 7: Rodar até passar**

```bash
npm test -- tests/auth.test.ts
```

Esperado: 15 passam.

- [ ] **Passo 8: Commit**

```bash
git add src/lib/sessao-painel.ts src/app/api/auth tests/auth.test.ts
git commit -m "Adiciona login, logout e sessao do barbeiro"
```

---

## Tarefa 4: Os dois cruzamentos

**Arquivos:**
- Testar: `tests/auth.test.ts` (acrescentar bloco)

Esta tarefa **não escreve código de produção**. Ela prova duas garantias que
ninguém encontra por acidente — e se alguma falhar, o conserto é na tarefa que
a quebrou, não aqui.

**Interfaces:**
- Consome: `sessaoDaRequisicao` (Tarefa 3); `GET as eu` de `@/app/api/auth/eu/route`; `emitirSessao` (Tarefa 1); `emitirSessao as emitirAdmin` de `@/lib/admin-sessao`

- [ ] **Passo 1: Escrever os testes**

```ts
import { GET as eu } from '@/app/api/auth/eu/route';
import { emitirSessao as emitirAdmin, COOKIE_ADMIN } from '@/lib/admin-sessao';

const comCookie = (host: string, cookie: string) =>
  new Request(`http://${host}.localhost/api/auth/eu`, {
    headers: { 'x-barbearia-slug': host, cookie },
  });

describe('os dois cruzamentos', () => {
  it('cookie da BRUTUS não vale no host da Dom Tony', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    await prismaOwner.barbearia.create({
      data: { slug: 'dontony', nome: 'Dom Tony', endereco: 'Av. Central, 12',
              horarioResumo: 'ter a sáb', whatsappContato: '11977778888' },
    });

    const jwt = await emitirSessao({
      sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0,
    });

    // No host certo, abre.
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(200);

    // No host errado, 401 — assinatura válida, não expirado, barbeiro
    // existente. É o `bid` que recusa, e é o pior bug do multi-tenant.
    const cruzado = await eu(comCookie('dontony', `sessao=${jwt}`));
    expect(cruzado.status).toBe(401);
    expect(cruzado.headers.get('set-cookie')).toContain('sessao=;');
  });

  it('cookie de admin não abre rota do painel', async () => {
    await montarCenarioBrutus();
    const doAdmin = await emitirAdmin();
    expect((await eu(comCookie('brutus', `sessao=${doAdmin}`))).status).toBe(401);
    expect((await eu(comCookie('brutus', `${COOKIE_ADMIN}=${doAdmin}`))).status).toBe(401);
  });

  it('cookie de barbeiro não abre rota de admin', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0,
    });
    const { lerSessao: lerAdmin } = await import('@/lib/admin-sessao');
    expect(await lerAdmin(jwt)).toBe(false);
  });

  it('tokenVersion incrementado derruba a sessão já emitida', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0,
    });
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(200);

    await prismaOwner.barbeiro.update({
      where: { id: teo.id }, data: { tokenVersion: { increment: 1 } },
    });
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(401);
  });

  it('barbeiro desativado perde a sessão', async () => {
    const { teo, barbearia } = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: teo.id, bid: barbearia.id, papel: 'DONO', tv: 0,
    });
    await prismaOwner.barbeiro.update({ where: { id: teo.id }, data: { ativo: false } });
    expect((await eu(comCookie('brutus', `sessao=${jwt}`))).status).toBe(401);
  });
});
```

- [ ] **Passo 2: Rodar**

```bash
npm test -- tests/auth.test.ts
```

Esperado: 20 passam. Falhando algum, o defeito está na Tarefa 1 ou 3 — corrigir
lá e voltar.

- [ ] **Passo 3: Commit**

```bash
git add tests/auth.test.ts
git commit -m "Prova que cookie nao atravessa tenant nem papel"
```

---

## Tarefa 5: Autorização e a agenda do dia

**Arquivos:**
- Criar: `src/lib/autorizacao.ts`, `src/app/api/painel/agenda/route.ts`
- Testar: `tests/painel.test.ts`

**Interfaces:**
- Consome: `Sessao` (Tarefa 1); `sessaoDaRequisicao`, `naoAutorizado` (Tarefa 3); `localParaUtc`, `diaDeHoje` de `@/lib/datas`
- Produz: `filtroDoBarbeiro(sessao: Sessao): { barbeiroId?: string }`; `GET /api/painel/agenda` devolvendo `{ dia: string, itens: Array<{ id, inicio, fim, servicoNome, clienteNome, clienteWhatsapp, barbeiroId, barbeiroNome }> }`

- [ ] **Passo 1: Escrever o teste que deve falhar**

Criar `tests/painel.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaOwner, limparBanco } from './setup';
import { montarCenarioBrutus } from './cenarios';
import { emitirSessao } from '@/lib/auth';
import { GET as agenda } from '@/app/api/painel/agenda/route';
import { localParaUtc, diaDeHoje } from '@/lib/datas';

beforeAll(() => {
  process.env.SESSAO_JWT_SECRET = 'segredo-do-painel-com-mais-de-32-bytes-aqui';
});

beforeEach(limparBanco);

const pedido = (jwt: string, busca = '') =>
  new Request(`http://brutus.localhost/api/painel/agenda${busca}`, {
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  });

/// Um agendamento CONFIRMADO hoje às `hora`, para o barbeiro dado.
async function marcar(ctx: Awaited<ReturnType<typeof montarCenarioBrutus>>,
                      barbeiroId: string, hora: number, nome: string) {
  const dia = diaDeHoje(new Date());
  const inicio = localParaUtc(dia, hora * 60);
  const cliente = await prismaOwner.cliente.create({
    data: { barbeariaId: ctx.barbearia.id, nome, whatsapp: `1199999${hora}${hora}${hora}${hora}` },
  });
  return prismaOwner.agendamento.create({
    data: {
      barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
      barbeiroId, clienteId: cliente.id, servicoId: ctx.corte.id,
      servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 40 * 60_000),
      duracaoMin: 40, status: 'CONFIRMADO',
    },
  });
}

describe('GET /api/painel/agenda', () => {
  it('o dono vê a agenda de todos', async () => {
    const ctx = await montarCenarioBrutus();
    await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
    await marcar(ctx, ctx.rael.id, 11, 'Cliente do Rael');

    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await agenda(pedido(jwt));
    expect(res.status).toBe(200);
    const { itens } = await res.json();
    expect(itens).toHaveLength(2);
  });

  it('o barbeiro vê só a dele', async () => {
    const ctx = await montarCenarioBrutus();
    await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
    await marcar(ctx, ctx.rael.id, 11, 'Cliente do Rael');

    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    const { itens } = await (await agenda(pedido(jwt))).json();
    expect(itens).toHaveLength(1);
    expect(itens[0].clienteNome).toBe('Cliente do Rael');
  });

  it('barbeiro pedindo a agenda do colega continua vendo a dele', async () => {
    const ctx = await montarCenarioBrutus();
    await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
    await marcar(ctx, ctx.rael.id, 11, 'Cliente do Rael');

    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    const { itens } = await (await agenda(pedido(jwt, `?barbeiroId=${ctx.teo.id}`))).json();
    expect(itens).toHaveLength(1);
    expect(itens[0].clienteNome).toBe('Cliente do Rael');
  });

  it('o dono filtrando por um barbeiro vê só aquele', async () => {
    const ctx = await montarCenarioBrutus();
    await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
    await marcar(ctx, ctx.rael.id, 11, 'Cliente do Rael');

    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const { itens } = await (await agenda(pedido(jwt, `?barbeiroId=${ctx.rael.id}`))).json();
    expect(itens).toHaveLength(1);
    expect(itens[0].clienteNome).toBe('Cliente do Rael');
  });

  it('sem cookie é 401', async () => {
    await montarCenarioBrutus();
    const res = await agenda(new Request('http://brutus.localhost/api/painel/agenda', {
      headers: { 'x-barbearia-slug': 'brutus' },
    }));
    expect(res.status).toBe(401);
  });

  it('cancelado não aparece', async () => {
    const ctx = await montarCenarioBrutus();
    const a = await marcar(ctx, ctx.teo.id, 10, 'Cliente do Téo');
    await prismaOwner.agendamento.update({
      where: { id: a.id }, data: { status: 'CANCELADO_BARBEIRO', canceladoEm: new Date() },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const { itens } = await (await agenda(pedido(jwt))).json();
    expect(itens).toHaveLength(0);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/painel.test.ts
```

Esperado: FALHA com "Cannot find module '@/app/api/painel/agenda/route'".

- [ ] **Passo 3: Escrever `src/lib/autorizacao.ts`**

```ts
import type { Sessao } from './auth';

/// O ÚNICO lugar onde o alcance do barbeiro é decidido. Nenhuma consulta do
/// painel monta este filtro por fora — a garantia "só o que é dele" vale
/// exatamente enquanto isso for verdade.
///
/// Por que isto não foi para o RLS, sendo que o tenant foi: a área pública
/// precisa ler a ocupação de TODOS os barbeiros para calcular horário livre
/// (§6.3 do cliente). Tenant no banco, barbeiro na aplicação.
export function filtroDoBarbeiro(sessao: Sessao): { barbeiroId?: string } {
  return sessao.papel === 'DONO' ? {} : { barbeiroId: sessao.sub };
}
```

- [ ] **Passo 4: Escrever `src/app/api/painel/agenda/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { localParaUtc, diaDeHoje } from '@/lib/datas';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();

  const url = new URL(req.url);
  const pedido = url.searchParams.get('dia');
  const dia = pedido && DIA.test(pedido) ? pedido : diaDeHoje(new Date());

  // O filtro da sessão vence o da query, SEMPRE: o parâmetro só é honrado
  // quando o filtro da sessão é vazio, que é o caso do dono.
  const doFiltro = filtroDoBarbeiro(aberta.sessao);
  const pedidoBarbeiro = url.searchParams.get('barbeiroId');
  const barbeiroId = doFiltro.barbeiroId ?? pedidoBarbeiro ?? undefined;

  const itens = await comBarbearia(aberta.barbearia.id, (tx) =>
    tx.agendamento.findMany({
      where: {
        status: 'CONFIRMADO',
        inicio: { gte: localParaUtc(dia, 0), lt: localParaUtc(dia, 24 * 60) },
        ...(barbeiroId ? { barbeiroId } : {}),
      },
      orderBy: { inicio: 'asc' },
      select: {
        id: true, inicio: true, fim: true, servicoNome: true, barbeiroId: true,
        cliente:  { select: { nome: true, whatsapp: true } },
        barbeiro: { select: { nome: true } },
      },
    }),
  );

  return NextResponse.json({
    dia,
    itens: itens.map((a) => ({
      id: a.id, inicio: a.inicio, fim: a.fim, servicoNome: a.servicoNome,
      barbeiroId: a.barbeiroId, barbeiroNome: a.barbeiro.nome,
      clienteNome: a.cliente.nome, clienteWhatsapp: a.cliente.whatsapp,
    })),
  });
}
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -- tests/painel.test.ts
```

Esperado: 6 passam.

- [ ] **Passo 6: Commit**

```bash
git add src/lib/autorizacao.ts src/app/api/painel/agenda tests/painel.test.ts
git commit -m "Mostra a agenda do dia no alcance de cada um"
```

---

## Tarefa 6: Marcar na mão

**Arquivos:**
- Criar: `src/app/api/painel/agendamentos/route.ts`
- Testar: `tests/painel.test.ts` (acrescentar bloco)

**Interfaces:**
- Consome: `sessaoDaRequisicao`, `naoAutorizado` (Tarefa 3); `filtroDoBarbeiro` (Tarefa 5); `slotsDoDia` de `@/lib/agenda`; `normalizar` de `@/lib/telefone`; `enviarTexto` de `@/lib/whatsapp`; `msgConfirmacao` de `@/lib/mensagens`
- Produz: `POST /api/painel/agendamentos` → `201 { codigo }`

- [ ] **Passo 1: Escrever o teste que deve falhar**

```ts
import { POST as marcar_ } from '@/app/api/painel/agendamentos/route';

const pedidoMarcar = (jwt: string, corpo: unknown) =>
  new Request('http://brutus.localhost/api/painel/agendamentos', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-barbearia-slug': 'brutus',
      cookie: `sessao=${jwt}`,
    },
    body: JSON.stringify(corpo),
  });

describe('POST /api/painel/agendamentos', () => {
  it('o barbeiro marca para si', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    const inicio = new Date(Date.now() + 60 * 60_000);
    inicio.setSeconds(0, 0);
    inicio.setMinutes(inicio.getMinutes() < 30 ? 0 : 30);

    const res = await marcar_(pedidoMarcar(jwt, {
      barbeiroId: ctx.rael.id, servicoId: ctx.corte.id,
      inicio: inicio.toISOString(), nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).codigo).toHaveLength(10);
  });

  it('o barbeiro não marca na agenda do colega', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });
    const inicio = new Date(Date.now() + 60 * 60_000);
    inicio.setSeconds(0, 0);
    inicio.setMinutes(inicio.getMinutes() < 30 ? 0 : 30);

    const res = await marcar_(pedidoMarcar(jwt, {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: inicio.toISOString(), nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));
    expect(res.status).toBe(404);
  });

  it('horário ocupado responde 409 e não duplica', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const inicio = new Date(Date.now() + 90 * 60_000);
    inicio.setSeconds(0, 0);
    inicio.setMinutes(inicio.getMinutes() < 30 ? 0 : 30);
    const corpo = {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: inicio.toISOString(), nome: 'Seu Osvaldo', whatsapp: '11955554444',
    };

    expect((await marcar_(pedidoMarcar(jwt, corpo))).status).toBe(201);
    expect((await marcar_(pedidoMarcar(jwt, corpo))).status).toBe(409);

    const quantos = await prismaOwner.agendamento.count({
      where: { barbeariaId: ctx.barbearia.id, inicio, status: 'CONFIRMADO' },
    });
    expect(quantos).toBe(1);
  });

  it('horário que já passou é 422', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await marcar_(pedidoMarcar(jwt, {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: new Date(Date.now() - 60 * 60_000).toISOString(),
      nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));
    expect(res.status).toBe(422);
  });

  it('cliente que já existe é reaproveitado e o nome é atualizado', async () => {
    const ctx = await montarCenarioBrutus();
    await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'osvaldo', whatsapp: '11955554444' },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const inicio = new Date(Date.now() + 120 * 60_000);
    inicio.setSeconds(0, 0);
    inicio.setMinutes(inicio.getMinutes() < 30 ? 0 : 30);

    await marcar_(pedidoMarcar(jwt, {
      barbeiroId: ctx.teo.id, servicoId: ctx.corte.id,
      inicio: inicio.toISOString(), nome: 'Seu Osvaldo', whatsapp: '11955554444',
    }));

    const clientes = await prismaOwner.cliente.findMany({
      where: { barbeariaId: ctx.barbearia.id, whatsapp: '11955554444' },
    });
    expect(clientes).toHaveLength(1);
    expect(clientes[0].nome).toBe('Seu Osvaldo');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/painel.test.ts
```

Esperado: FALHA com "Cannot find module '@/app/api/painel/agendamentos/route'".

- [ ] **Passo 3: Escrever `src/app/api/painel/agendamentos/route.ts`**

A escrita é a mesma do fluxo público (`src/app/api/agendamentos/route.ts:44`),
com três diferenças marcadas no código. `ehSobreposicao` é copiada de lá — são
quinze linhas que existem para não confundir 409 com 500, e movê-las para um
módulo comum é refatoração de outra tarefa.

```ts
import { NextResponse } from 'next/server';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { slotsDoDia } from '@/lib/agenda';
import { normalizar } from '@/lib/telefone';
import { enviarTexto } from '@/lib/whatsapp';
import { msgConfirmacao } from '@/lib/mensagens';
import { utcParaLocal } from '@/lib/datas';

const gerarCodigo = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 10);

const Corpo = z.object({
  barbeiroId: z.uuid(),
  servicoId: z.uuid(),
  inicio: z.iso.datetime(),
  nome: z.string().trim().min(2).max(80),
  whatsapp: z.string(),
});

class ErroCliente extends Error {
  constructor(public status: number, public mensagem: string) { super(mensagem); }
}

/// 23P01 = exclusion_violation, de `agendamento_sem_sobreposicao` (§5.4).
function ehSobreposicao(e: unknown): boolean {
  for (let atual: unknown = e, i = 0; atual && i < 5; i++) {
    const o = atual as { code?: unknown; meta?: { code?: unknown }; cause?: unknown };
    if (o.code === '23P01' || o.meta?.code === '23P01') return true;
    atual = o.cause;
  }
  return String((e as { message?: string })?.message ?? '')
    .includes('agendamento_sem_sobreposicao');
}

export async function POST(req: Request) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  const { sessao, barbearia } = aberta;

  const parse = Corpo.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ erro: 'Preenche nome e WhatsApp.' }, { status: 422 });
  }
  const { barbeiroId, servicoId, inicio: inicioIso, nome } = parse.data;

  // Diferença 1: o formato é validado, a existência no WhatsApp NÃO. A
  // verificação da Evolution é um oráculo de enumeração defendido por 10
  // chamadas/hora por IP — e o balcão da barbearia é um IP só (§7).
  const whatsapp = normalizar(parse.data.whatsapp);
  if (!whatsapp) {
    return NextResponse.json({ erro: 'Confere o WhatsApp — parece faltar dígito.' },
                             { status: 422 });
  }

  // Marcar na agenda de outro barbeiro é 404, não 403: 403 confirmaria que
  // aquele barbeiro existe nesta barbearia.
  const doFiltro = filtroDoBarbeiro(sessao);
  if (doFiltro.barbeiroId && doFiltro.barbeiroId !== barbeiroId) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }

  const inicio = new Date(inicioIso);
  const agora = new Date();

  try {
    const criado = await comBarbearia(barbearia.id, async (tx) => {
      const vinculo = await tx.barbeiroServico.findUnique({
        where: { barbeiroId_servicoId: { barbeiroId, servicoId } },
        include: { servico: { select: { nome: true, ativo: true } } },
      });
      if (!vinculo || !vinculo.ativo || !vinculo.servico.ativo) {
        throw new ErroCliente(422, 'Esse barbeiro não faz esse serviço.');
      }

      const duracaoMin = vinculo.duracaoMin;
      const fim = new Date(inicio.getTime() + duracaoMin * 60_000);

      // Diferença 2: sem antecedência mínima. O barbeiro marca para daqui a
      // cinco minutos. Marcar no passado continua recusado — agenda não é
      // histórico.
      if (inicio <= agora) throw new ErroCliente(422, 'Esse horário já passou.');

      const { dia } = utcParaLocal(inicio);
      const livres = await slotsDoDia(tx, barbearia.id, barbeiroId, servicoId, dia, agora);
      if (!livres.some((s) => s.inicio.getTime() === inicio.getTime())) {
        throw new ErroCliente(409, 'Esse horário não está mais disponível.');
      }

      // Diferença 3: o nome é ATUALIZADO. O barbeiro está com a pessoa na
      // frente e sabe o nome melhor que o formulário de três meses atrás.
      const cliente = await tx.cliente.upsert({
        where: { barbeariaId_whatsapp: { barbeariaId: barbearia.id, whatsapp } },
        create: { barbeariaId: barbearia.id, nome, whatsapp },
        update: { nome },
      });

      return tx.agendamento.create({
        data: {
          barbeariaId: barbearia.id, codigo: gerarCodigo(),
          barbeiroId, clienteId: cliente.id, servicoId,
          servicoNome: vinculo.servico.nome,
          inicio, fim, duracaoMin, status: 'CONFIRMADO',
        },
        include: { barbeiro: { select: { nome: true } } },
      });
    });

    const link = `${req.headers.get('origin') ?? ''}/agendamento/${criado.codigo}`;
    void enviarTexto(whatsapp, msgConfirmacao({
      clienteNome: nome, barbeiroNome: criado.barbeiro.nome,
      servicoNome: criado.servicoNome, inicio: criado.inicio,
      endereco: barbearia.endereco, link,
    }));

    return NextResponse.json({ codigo: criado.codigo }, { status: 201 });
  } catch (e) {
    if (e instanceof ErroCliente) {
      return NextResponse.json({ erro: e.mensagem }, { status: e.status });
    }
    if (ehSobreposicao(e)) {
      return NextResponse.json({ erro: 'Esse horário acabou de ser pego.' },
                               { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Passo 4: Rodar até passar**

```bash
npm test -- tests/painel.test.ts
```

Esperado: 11 passam.

- [ ] **Passo 5: Commit**

```bash
git add src/app/api/painel/agendamentos/route.ts tests/painel.test.ts
git commit -m "Deixa o barbeiro marcar cliente na mao"
```

---

## Tarefa 7: Cancelar

**Arquivos:**
- Criar: `src/app/api/painel/agendamentos/[id]/cancelar/route.ts`
- Modificar: `src/lib/mensagens.ts`
- Testar: `tests/painel.test.ts` (acrescentar bloco)

**Interfaces:**
- Consome: `sessaoDaRequisicao`, `naoAutorizado` (Tarefa 3); `filtroDoBarbeiro` (Tarefa 5)
- Produz: `msgCancelamentoPelaBarbearia(d: { clienteNome, barbeiroNome, servicoNome, inicio, endereco })`; `POST /api/painel/agendamentos/[id]/cancelar` → `200 { ok: true }`

- [ ] **Passo 1: Escrever o teste que deve falhar**

```ts
import { POST as cancelar } from '@/app/api/painel/agendamentos/[id]/cancelar/route';

const pedidoCancelar = (jwt: string, id: string) => [
  new Request(`http://brutus.localhost/api/painel/agendamentos/${id}/cancelar`, {
    method: 'POST',
    headers: { 'x-barbearia-slug': 'brutus', cookie: `sessao=${jwt}` },
  }),
  { params: Promise.resolve({ id }) },
] as const;

describe('POST /api/painel/agendamentos/[id]/cancelar', () => {
  it('cancela o próprio e libera o horário', async () => {
    const ctx = await montarCenarioBrutus();
    const a = await marcar(ctx, ctx.rael.id, 15, 'Cliente do Rael');
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });

    const res = await cancelar(...pedidoCancelar(jwt, a.id));
    expect(res.status).toBe(200);

    const depois = await prismaOwner.agendamento.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois.status).toBe('CANCELADO_BARBEIRO');
    expect(depois.canceladoEm).not.toBeNull();
  });

  it('o agendamento do colega responde 404, não 403', async () => {
    const ctx = await montarCenarioBrutus();
    const doTeo = await marcar(ctx, ctx.teo.id, 16, 'Cliente do Téo');
    const jwt = await emitirSessao({
      sub: ctx.rael.id, bid: ctx.barbearia.id, papel: 'BARBEIRO', tv: 0,
    });

    const res = await cancelar(...pedidoCancelar(jwt, doTeo.id));
    expect(res.status).toBe(404);

    const intacto = await prismaOwner.agendamento.findUniqueOrThrow({ where: { id: doTeo.id } });
    expect(intacto.status).toBe('CONFIRMADO');
  });

  it('o dono cancela o de qualquer um', async () => {
    const ctx = await montarCenarioBrutus();
    const doRael = await marcar(ctx, ctx.rael.id, 17, 'Cliente do Rael');
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    expect((await cancelar(...pedidoCancelar(jwt, doRael.id))).status).toBe(200);
  });

  it('id que não existe é 404', async () => {
    const ctx = await montarCenarioBrutus();
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    const res = await cancelar(
      ...pedidoCancelar(jwt, '00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(404);
  });

  it('cancelar em cima da hora é permitido para o barbeiro', async () => {
    const ctx = await montarCenarioBrutus();
    const cliente = await prismaOwner.cliente.create({
      data: { barbeariaId: ctx.barbearia.id, nome: 'Daqui a pouco', whatsapp: '11944443333' },
    });
    const inicio = new Date(Date.now() + 10 * 60_000);   // dentro do prazo de 60 min
    const a = await prismaOwner.agendamento.create({
      data: {
        barbeariaId: ctx.barbearia.id, codigo: Math.random().toString(36).slice(2, 12),
        barbeiroId: ctx.teo.id, clienteId: cliente.id, servicoId: ctx.corte.id,
        servicoNome: 'Corte', inicio, fim: new Date(inicio.getTime() + 40 * 60_000),
        duracaoMin: 40, status: 'CONFIRMADO',
      },
    });
    const jwt = await emitirSessao({
      sub: ctx.teo.id, bid: ctx.barbearia.id, papel: 'DONO', tv: 0,
    });
    expect((await cancelar(...pedidoCancelar(jwt, a.id))).status).toBe(200);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npm test -- tests/painel.test.ts
```

Esperado: FALHA com "Cannot find module '@/app/api/painel/agendamentos/[id]/cancelar/route'".

- [ ] **Passo 3: Acrescentar o texto em `src/lib/mensagens.ts`**

```ts
/// Separada de msgCancelamento: aquela diz que o CLIENTE cancelou, e mandá-la
/// aqui seria mentira na cara de quem perdeu o horário.
export const msgCancelamentoPelaBarbearia = (d: Omit<Dados, 'link'>) =>
  `Oi, ${d.clienteNome.split(' ')[0]}. Precisamos cancelar seu ` +
  `${d.servicoNome.toLowerCase()} de ${formatarDiaLongo(d.inicio)} às ` +
  `${formatarHora(d.inicio)} com ${d.barbeiroNome}. Desculpa pelo transtorno — ` +
  `chama a gente que remarcamos.`;
```

- [ ] **Passo 4: Escrever `src/app/api/painel/agendamentos/[id]/cancelar/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { comBarbearia } from '@/lib/tenant';
import { sessaoDaRequisicao, naoAutorizado } from '@/lib/sessao-painel';
import { filtroDoBarbeiro } from '@/lib/autorizacao';
import { enviarTexto } from '@/lib/whatsapp';
import { msgCancelamentoPelaBarbearia } from '@/lib/mensagens';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const aberta = await sessaoDaRequisicao(req);
  if (!aberta) return naoAutorizado();
  const { sessao, barbearia } = aberta;
  const { id } = await params;

  const NAO_ENCONTRADO = NextResponse.json({ erro: 'não encontrado' }, { status: 404 });

  const cancelado = await comBarbearia(barbearia.id, async (tx) => {
    const a = await tx.agendamento.findUnique({
      where: { id },
      include: {
        cliente:  { select: { nome: true, whatsapp: true } },
        barbeiro: { select: { nome: true } },
      },
    });
    if (!a || a.status !== 'CONFIRMADO') return null;

    // Reconferência DEPOIS de carregar: um BARBEIRO que forje o id de um
    // agendamento do colega recebe 404 — 403 confirmaria que ele existe.
    const doFiltro = filtroDoBarbeiro(sessao);
    if (doFiltro.barbeiroId && doFiltro.barbeiroId !== a.barbeiroId) return null;

    // O prazo de PRAZO_CANCELAMENTO_MIN NÃO é conferido aqui: é regra contra
    // o cliente sumir em cima da hora, e o barbeiro que quebrou o braço
    // precisa desmarcar a tarde inteira agora.
    await tx.agendamento.update({
      where: { id },
      data: { status: 'CANCELADO_BARBEIRO', canceladoEm: new Date() },
    });
    return a;
  });

  if (!cancelado) return NAO_ENCONTRADO;

  // Depois do commit, fire-and-forget: falha de WhatsApp não desfaz nada.
  void enviarTexto(cancelado.cliente.whatsapp, msgCancelamentoPelaBarbearia({
    clienteNome: cancelado.cliente.nome, barbeiroNome: cancelado.barbeiro.nome,
    servicoNome: cancelado.servicoNome, inicio: cancelado.inicio,
    endereco: barbearia.endereco,
  }));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Passo 5: Rodar até passar**

```bash
npm test -- tests/painel.test.ts
```

Esperado: 16 passam.

- [ ] **Passo 6: Commit**

```bash
git add src/app/api/painel/agendamentos src/lib/mensagens.ts tests/painel.test.ts
git commit -m "Deixa o barbeiro cancelar e avisa o cliente"
```

---

## Tarefa 8: A peneira do proxy

**Arquivos:**
- Modificar: `src/proxy.ts`

**Interfaces:**
- Consome: `lerSessao`, `COOKIE_SESSAO` (Tarefa 1)

O `proxy.ts` não é executado pelo Vitest (o plano do admin registrou isso): a
verificação é por `curl`, como a barreira do `/api/admin/*` foi.

- [ ] **Passo 1: Modificar `src/proxy.ts`**

Acrescentar o import no topo:

```ts
import { lerSessao as lerSessaoBarbeiro, COOKIE_SESSAO } from '@/lib/auth';
```

E, logo **depois** do bloco que devolve 404 para `/admin` fora do host de admin
(`src/proxy.ts:36-38`), antes do `const slug = extrairSlug(...)`:

```ts
  // ---- O painel: peneira grossa ----
  // Aqui só dá para conferir assinatura e validade — `jose` roda em Edge, o
  // Prisma não. O `bid`, o `tokenVersion` e o `ativo` são conferidos na rota
  // (painel §3), porque resolver slug -> barbeariaId é consulta ao banco.
  const ehPainel = caminho.startsWith('/painel') || caminho.startsWith('/api/painel');
  const ehLoginPainel = caminho === '/painel/login' || caminho === '/api/auth/login';
  if (ehPainel && !ehLoginPainel) {
    const sessao = await lerSessaoBarbeiro(req.cookies.get(COOKIE_SESSAO)?.value);
    if (!sessao) {
      return caminho.startsWith('/api/')
        ? NextResponse.json({ erro: 'não autorizado' }, { status: 401 })
        : NextResponse.redirect(new URL('/painel/login', req.url));
    }
  }
```

- [ ] **Passo 2: Conferir no ar**

```bash
docker compose up -d
docker compose restart app     # rota nova não é vista pelo watcher no bind mount
curl -s -o /dev/null -w "%{http_code}\n" http://brutus.localhost:3000/api/painel/agenda
curl -s -o /dev/null -w "%{http_code}\n" -L http://brutus.localhost:3000/painel
```

Esperado: `401` na primeira; a segunda termina em `200` na tela de login
(seguindo o redirecionamento).

- [ ] **Passo 3: Rodar a suíte inteira**

```bash
npm test
```

Esperado: tudo verde — o proxy não é exercitado pelo Vitest, mas uma importação
errada no `auth.ts` quebraria outros arquivos.

- [ ] **Passo 4: Commit**

```bash
git add src/proxy.ts
git commit -m "Barra o painel sem sessao ja no proxy"
```

---

## Tarefa 9: As telas

**Arquivos:**
- Criar: `src/app/painel/login/page.tsx`, `src/app/painel/novo/page.tsx`
- Criar: `src/components/painel/FormLoginBarbeiro.tsx`, `src/components/painel/AgendaDoDia.tsx`, `src/components/painel/FormMarcar.tsx`
- Substituir: `src/app/painel/page.tsx`

As telas seguem os componentes de `src/components/wf` e o layout desktop já
estabelecido. `src/components/admin/FormLogin.tsx` é o modelo mais próximo para
o formulário de entrada — mesmo formato de erro e de estado de envio.

**Reaproveita duas rotas públicas que já existem** — `GET /api/servicos?barbeiroId=`
e `GET /api/horarios?barbeiroId=&servicoId=&de=&dias=1`. A segunda devolve
`{ dias: [{ data, rotulo, slots: [{ hora, inicio, fim, barbeiroId }] }] }` e
mostra **só o que está livre**, sem nome de cliente (§9.1 do cliente). Nenhuma
rota nova é necessária para a tela de marcar.

- [ ] **Passo 1: Escrever `src/components/painel/FormLoginBarbeiro.tsx`**

Mesmo formato do `src/components/admin/FormLogin.tsx`, inclusive o erro vindo
pronto da rota — inventar texto no cliente faria a resposta deixar de ser uma só.

```tsx
'use client';
import { useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';

export function FormLoginBarbeiro() {
  const [whatsapp, setWhatsapp] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const pronto = whatsapp.trim() && senha && !enviando;

  async function entrar() {
    if (!pronto) return;
    setEnviando(true); setErro('');
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ whatsapp, senha }),
    });
    if (r.ok) { window.location.href = '/painel'; return; }
    setErro((await r.json()).erro);
    setEnviando(false);
  }

  return (
    <>
      <Lbl>entrar</Lbl>
      <Box variante={whatsapp ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="seu celular"
               inputMode="numeric" autoComplete="username"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Box>
      <Box variante={senha ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" type="password"
               placeholder="senha" autoComplete="current-password"
               value={senha} onChange={(e) => setSenha(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && entrar()} />
      </Box>
      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={pronto ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={entrar}>
        {enviando ? 'entrando…' : 'entrar'}
      </Box>
    </>
  );
}
```

E `src/app/painel/login/page.tsx`:

```tsx
import { Frame } from '@/components/wf';
import { FormLoginBarbeiro } from '@/components/painel/FormLoginBarbeiro';

export default function LoginDoPainel() {
  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Painel</h1>
      <FormLoginBarbeiro />
    </Frame>
  );
}
```

- [ ] **Passo 2: Escrever `src/components/painel/AgendaDoDia.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Box, Lbl, Sub, Sep } from '@/components/wf';

type Item = {
  id: string; inicio: string; fim: string; servicoNome: string;
  barbeiroId: string; barbeiroNome: string;
  clienteNome: string; clienteWhatsapp: string;
};
type Eu = { id: string; nome: string; papel: 'DONO' | 'BARBEIRO' };

const hoje = () => new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD local
const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function AgendaDoDia() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [dia, setDia] = useState(hoje());
  const [itens, setItens] = useState<Item[] | null>(null);

  const carregar = useCallback(async (d: string) => {
    setItens(null);
    const r = await fetch(`/api/painel/agenda?dia=${d}`);
    if (r.status === 401) { window.location.href = '/painel/login'; return; }
    setItens((await r.json()).itens);
  }, []);

  useEffect(() => {
    fetch('/api/auth/eu')
      .then((r) => (r.ok ? r.json() : null))
      .then(setEu);
  }, []);

  useEffect(() => { void carregar(dia); }, [dia, carregar]);

  async function cancelar(item: Item) {
    if (!confirm(`Cancelar o horário de ${item.clienteNome} às ${hora(item.inicio)}?`)) return;
    const r = await fetch(`/api/painel/agendamentos/${item.id}/cancelar`, { method: 'POST' });
    if (r.ok) void carregar(dia);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, -1))}>←</Box>
        <Lbl>{dia === hoje() ? 'hoje' : dia}</Lbl>
        <Box className="cursor-pointer" onClick={() => setDia(somar(dia, 1))}>→</Box>
      </div>

      {itens === null && <Sub>carregando…</Sub>}
      {itens?.length === 0 && <Sub>nenhum horário marcado neste dia.</Sub>}

      {itens?.map((i) => (
        <Box key={i.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span>{hora(i.inicio)} · {i.clienteNome}</span>
            <Sub>{i.servicoNome}</Sub>
          </div>
          {/* O nome do barbeiro só faz sentido para quem vê a agenda de mais
              de um: para o barbeiro, seria a mesma linha repetida o dia todo. */}
          {eu?.papel === 'DONO' && <Sub>{i.barbeiroNome}</Sub>}
          <Sep />
          <div className="flex gap-3">
            <a href={`https://wa.me/55${i.clienteWhatsapp}`} target="_blank" rel="noreferrer">
              <Sub>whatsapp</Sub>
            </a>
            <button onClick={() => cancelar(i)}>
              <Sub className="text-acento">cancelar</Sub>
            </button>
          </div>
        </Box>
      ))}

      <a href="/painel/novo"><Box variante="fill">+ marcar na mão</Box></a>
    </>
  );
}
```

- [ ] **Passo 3: Substituir `src/app/painel/page.tsx`**

```tsx
import { Frame } from '@/components/wf';
import { AgendaDoDia } from '@/components/painel/AgendaDoDia';

export default function Painel() {
  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Agenda</h1>
      <AgendaDoDia />
    </Frame>
  );
}
```

- [ ] **Passo 4: Escrever `src/components/painel/FormMarcar.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Box, Lbl, Sub } from '@/components/wf';
import { GRANULARIDADE_MIN, PAINEL_ANTECEDENCIA_PADRAO_MIN } from '@/lib/config';

type Servico = { id: string; nome: string; duracaoMin: number };
type Slot = { hora: string; inicio: string; barbeiroId: string };

/// O caso do balcão: o cliente está ali e quer o próximo horário. O padrão
/// economiza toque; não é regra — os dois campos continuam trocáveis.
function padraoDeHorario() {
  const d = new Date(Date.now() + PAINEL_ANTECEDENCIA_PADRAO_MIN * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / GRANULARIDADE_MIN) * GRANULARIDADE_MIN);
  return d;
}

export function FormMarcar({ eu }: { eu: { id: string; papel: 'DONO' | 'BARBEIRO' } }) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [servicoId, setServicoId] = useState('');
  const [dia, setDia] = useState(padraoDeHorario().toLocaleDateString('sv-SE'));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [inicio, setInicio] = useState('');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // O primeiro da lista já vem escolhido — é o serviço mais comum da casa.
  useEffect(() => {
    fetch(`/api/servicos?barbeiroId=${eu.id}`)
      .then((r) => r.json())
      .then((s: Servico[]) => { setServicos(s); setServicoId(s[0]?.id ?? ''); });
  }, [eu.id]);

  useEffect(() => {
    if (!servicoId) return;
    fetch(`/api/horarios?barbeiroId=${eu.id}&servicoId=${servicoId}&de=${dia}&dias=1`)
      .then((r) => r.json())
      .then((d) => {
        const livres: Slot[] = d.dias?.[0]?.slots ?? [];
        setSlots(livres);
        const alvo = padraoDeHorario().toISOString();
        setInicio(livres.find((s) => s.inicio >= alvo)?.inicio ?? livres[0]?.inicio ?? '');
      });
  }, [servicoId, dia, eu.id]);

  const pronto = servicoId && inicio && nome.trim().length >= 2 && whatsapp && !enviando;

  async function marcar() {
    if (!pronto) return;
    setEnviando(true); setErro('');
    const r = await fetch('/api/painel/agendamentos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ barbeiroId: eu.id, servicoId, inicio, nome, whatsapp }),
    });
    if (r.ok) { window.location.href = '/painel'; return; }
    setErro((await r.json()).erro);
    setEnviando(false);
    // 409 é horário que acabou de ser pego: recarregar a lista é o conserto.
    if (r.status === 409) setDia((d) => d);
  }

  return (
    <>
      <Lbl>serviço</Lbl>
      <div className="flex flex-wrap gap-2">
        {servicos.map((s) => (
          <Box key={s.id} variante={s.id === servicoId ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setServicoId(s.id)}>
            {s.nome}
          </Box>
        ))}
      </div>

      <Lbl>dia</Lbl>
      <Box>
        <input type="date" className="w-full outline-none bg-transparent"
               value={dia} onChange={(e) => setDia(e.target.value)} />
      </Box>

      <Lbl>hora</Lbl>
      {slots.length === 0 && <Sub>nenhum horário livre neste dia.</Sub>}
      <div className="flex flex-wrap gap-2">
        {slots.map((s) => (
          <Box key={s.inicio} variante={s.inicio === inicio ? 'fill' : 'normal'}
               className="cursor-pointer" onClick={() => setInicio(s.inicio)}>
            {s.hora}
          </Box>
        ))}
      </div>

      <Lbl>cliente</Lbl>
      <Box variante={nome ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="nome"
               value={nome} onChange={(e) => setNome(e.target.value)} />
      </Box>
      <Box variante={whatsapp ? 'normal' : 'dash'}>
        <input className="w-full outline-none bg-transparent" placeholder="whatsapp"
               inputMode="numeric"
               value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      </Box>

      {erro && <Sub className="text-acento">{erro}</Sub>}
      <Box variante={pronto ? 'fill' : 'mut'}
           className={pronto ? 'cursor-pointer' : ''} onClick={marcar}>
        {enviando ? 'marcando…' : 'marcar'}
      </Box>
      <a href="/painel"><Box>← voltar para a agenda</Box></a>
    </>
  );
}
```

**Nota para o dono:** esta versão marca sempre na agenda de quem está logado
(`eu.id`). O dono marcando para outro barbeiro precisa de um seletor a mais —
a rota já aceita (`barbeiroId` no corpo, e o filtro só barra o BARBEIRO). Se o
seletor não couber no tempo desta tarefa, ele é aditivo e não muda a API.

- [ ] **Passo 5: Escrever `src/app/painel/novo/page.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Frame, Sub } from '@/components/wf';
import { FormMarcar } from '@/components/painel/FormMarcar';

export default function Novo() {
  const [eu, setEu] = useState<{ id: string; papel: 'DONO' | 'BARBEIRO' } | null>(null);

  useEffect(() => {
    fetch('/api/auth/eu').then(async (r) => {
      if (!r.ok) { window.location.href = '/painel/login'; return; }
      setEu(await r.json());
    });
  }, []);

  return (
    <Frame>
      <h1 className="text-[17px] font-normal">Marcar na mão</h1>
      {eu ? <FormMarcar eu={eu} /> : <Sub>carregando…</Sub>}
    </Frame>
  );
}
```

- [ ] **Passo 4: Conferir no navegador**

```bash
docker compose restart app
```

- `http://brutus.localhost:3000/painel` sem cookie → cai no login
- entrar com `11911112222` e a senha do seed (`123456`) → agenda do dia
- entrar como Rael (`11933334444`) → só a agenda dele, sem seletor de barbeiro
- marcar na mão e ver o item aparecer
- cancelar e ver sumir

- [ ] **Passo 5: Commit**

```bash
git add src/app/painel src/components/painel
git commit -m "Monta as telas do painel do barbeiro"
```

---

## Tarefa 10: Fechamento

**Arquivos:**
- Modificar: `README.md`, `.env.example`

- [ ] **Passo 1: Rodar a suíte inteira**

```bash
npm test
```

Esperado: os 172 anteriores mais ~36 destas tarefas.

- [ ] **Passo 2: Conferir que o seed dá para entrar**

```bash
npm run seed
```

Téo e Rael nascem com `123456` (cliente §5.5), então o painel é testável na
hora, sem preparar cenário.

- [ ] **Passo 3: Acrescentar a seção ao `README.md`**

````markdown
## Painel do barbeiro

`http://brutus.localhost:3000/painel` — agenda do dia, marcar cliente na mão e
cancelar. Entra com o celular e a senha; no seed, Téo (`11911112222`) e Rael
(`11933334444`) nascem com `123456`.

O dono vê a agenda de todos e pode filtrar por barbeiro; o barbeiro vê só a
dele. Quem decide isso é `filtroDoBarbeiro()` — **nenhuma consulta do painel
monta esse filtro por fora**, e a garantia vale exatamente enquanto isso for
verdade.

Cinco erros de senha travam **aquela conta** por 15 minutos. É diferente da
trava do admin, que é por IP: a barbearia inteira sai do mesmo IP, e travar o
IP derrubaria a equipe junto.

`SESSAO_JWT_SECRET` é **diferente** de `ADMIN_JWT_SECRET` de propósito: é isso
que faz cookie de admin não abrir o painel, e vice-versa, sem nenhuma checagem
escrita para esse fim.

Ação sobre agendamento de outro barbeiro responde **404**, nunca 403 — 403
confirmaria que o registro existe.
````

- [ ] **Passo 4: Commit e PR**

```bash
git add README.md .env.example
git commit -m "Fecha o painel do barbeiro com suite verde e README"
```

Depois, a skill `superpowers:finishing-a-development-branch`.

---

## Autorrevisão

**Cobertura do spec:**

| Seção do design | Tarefa |
|---|---|
| §3 Token, cookie, duas camadas | 1, 3, 8 |
| §3 Segredo próprio | 1 (teste), 4 (cruzamento) |
| §3 Senha, verify sempre | 3 |
| §3 Força bruta por barbeiro no banco | 2, 3 |
| §4 `filtroDoBarbeiro`, 404 e não 403 | 5, 6, 7 |
| §5 Rotas | 3, 5, 6, 7 |
| §6 Telas | 9 |
| §7 Marcar na mão, as três diferenças | 6 |
| §7 Padrões da tela (serviço e agora+30) | 9 |
| §8 Cancelar, sem prazo, mensagem nova | 7 |
| §9 Constantes e variáveis | 1 |
| §10 Testes | 1, 2, 3, 4, 5, 6, 7 |

**Lacunas conhecidas e conscientes:**

- `ehSobreposicao` fica duplicada entre a rota pública e a do painel. São
  quinze linhas, e extrair um módulo comum mexeria numa rota coberta por
  testes que não são desta etapa. Se aparecer um terceiro uso, aí vale extrair.
- O `proxy.ts` continua sem teste automatizado — o Vitest não o executa. A
  Tarefa 8 verifica por `curl`, como a barreira do admin já é verificada.
- `GET /api/painel/agenda` devolve o WhatsApp do cliente. É informação que o
  barbeiro já teria no caderno, e é o que permite ligar para quem não apareceu;
  fica registrado aqui porque é o dado mais sensível que o painel expõe.
- Não há paginação na agenda do dia: um dia tem no máximo algumas dezenas de
  itens. Se a barbearia crescer a ponto de isso incomodar, o problema é outro.
- A tela de login não distingue "travado" de "senha errada" no texto, só no
  status 429. Quem errou cinco vezes vê a mensagem de espera; quem errou uma vê
  a genérica.
