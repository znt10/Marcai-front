<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Contexto do frontend

Projeto: Marcai (agendamento de barbearia)
Parte: Frontend
Stack: Next.js 16 (App Router), React, TypeScript, Tailwind, vitest

**São DOIS repositórios irmãos**, lado a lado: `Marcai-front` (este) e `Marcai-back`
(Django + Postgres). Mudança que atravessa os dois precisa de commit nos dois.
As specs e os planos de implementação de **ambos** moram aqui, em `docs/superpowers/`.

## Estrutura

```
src/
├── app/              # Páginas (App Router)
│   ├── admin/        # Painel da plataforma (só no host admin.<domínio>)
│   ├── painel/       # Painel do barbeiro/dono: agenda, dia, equipe, resumo, ...
│   ├── agendar/      # A tela pública do cliente
│   └── convite/      # Convite de barbeiro
├── components/
│   ├── painel/       # Telas do painel (Resumo, PizzaDeCortes, NavPainel, ...)
│   ├── admin/
│   └── wf/           # Os primitivos visuais (Lbl, botões, ...)
├── lib/
│   ├── api/client.ts # A lista MIGRADAS — leia antes de mexer em rota
│   ├── datas.ts      # somarDias, diaSemanaDe — o fuso mora aqui
│   ├── resumo.ts     # Períodos do resumo (dia/semana/mês)
│   └── slug.ts       # Host -> barbearia (espelha tenant/slug.py do back)
└── proxy.ts          # Middleware: espelha as barreiras do Django por posição
tests/                # vitest
```

## O que você precisa saber antes de escrever qualquer linha

**O tenant vem do Host.** O subdomínio **é** a barbearia (`brutus.localhost`), e
`admin.<domínio>` é o painel da plataforma. Não há parâmetro de barbearia em lugar
nenhum.

**`MIGRADAS`, em `src/lib/api/client.ts`, decide quem atende cada rota.** Prefixo que
está na lista vai direto para o Django (porta 8000); o que não está fica no Next.
**Esquecer uma linha ali manda o pedido para um handler que não existe — 404 mudo,
longe da causa.** Já aconteceu duas vezes (`/painel/foto` e `/painel/resumo`).

**O `proxy.ts` espelha as barreiras do Django.** `/admin*` só existe no host do admin;
`/painel*` exige sessão. As duas regras vivem dos dois lados de propósito — é o que
faz uma rota atravessar do Next para o Django sem ficar desprotegida em nenhum instante.

**Navegação usa `<Link>` do `next/link`, nunca `<a href>`.** Um `<a>` faz recarga
completa do documento e a troca de aba do painel fica travada.

**Data e fuso são só `src/lib/datas.ts`.** `diaSemanaDe` é `getDay()`: **domingo = 0**.
Essa é a linha mais fácil de errar do projeto — a convenção segunda=0 desloca a semana
inteira em um dia e o resultado fica coerente consigo mesmo o bastante para ninguém
desconfiar.

**Escrita na API exige o header `X-Brutus-Cliente`.** Sem ele o Django responde 403 em
POST/PATCH/PUT/DELETE. O valor não importa e não é segredo — o que protege é a
exigência, que obriga preflight.

## Como rodar

```bash
npm run dev
npx vitest run          # a suíte
docker compose up -d    # sobe o front; o back é o compose do outro repositório
```

O front e o back compartilham a rede Docker `brutus` (externa, criada à mão) e
precisam do **mesmo** `SESSAO_JWT_SECRET` e `ADMIN_JWT_SECRET` nos dois `.env` — o
cookie é emitido por um lado e lido pelo outro.

## Regras

- Comentário e texto de tela em **português**, explicando *por quê*, não *o quê*.
- Mensagem de commit minúscula, `área: frase em português`. Sem `feat:`/`fix:`.
- Nunca `git add -A`, `git add .` nem `git commit -a` — liste os arquivos um a um.
- Nome de variável, função e arquivo em português, como o resto do projeto.

## Antes de finalizar

- `npx vitest run` — o número **nunca** pode cair.
- Se mexeu em rota de API: conferir se o prefixo está no `MIGRADAS`.
- Se mexeu em gráfico ou layout: **olhar o resultado renderizado**, não só o código.
  O erro de a pizza somar 99% só apareceu quando o SVG virou PNG e alguém olhou.
- Diga quais telas, componentes ou libs mudaram e por quê.

## "Rodar na net" — abrir pelo celular, na rede local

Quando o dono pedir para **"rodar na net"**, ele quer abrir o app **no celular
dele, pela rede de casa** — não é deploy. A receita completa está no
`AGENTS.md` do `Marcai-back`, porque ela mexe nos dois repositórios; aqui fica
só a parte que é deste lado e a armadilha que ela tem.

No `.env` DESTE repositório a variável chama-se **`TENANT_PADRAO`**, sem o
prefixo `NEXT_PUBLIC_`. O `docker-compose.yml` daqui interpola
`${TENANT_PADRAO}` e é ele quem define `NEXT_PUBLIC_TENANT_PADRAO` dentro do
contêiner — escrever o nome com prefixo no `.env` **não faz nada**, porque a
compose sobrescreve.

O sintoma quando se erra isso: o Django resolve a barbearia certo
(`/api/saude` traz o slug) e o Next serve a página institucional no mesmo
endereço, porque `proxy.ts` lê `NEXT_PUBLIC_TENANT_PADRAO` vazio e conclui que
o host nu não é barbearia nenhuma.
