# Marcai — front

Agendamento para barbearias, **uma barbearia por subdomínio**: cada casa tem o
próprio endereço (`brutus.exemplo.com`, `dontony.exemplo.com`), a própria
equipe e a própria agenda. Este repositório é a aplicação Next.js — as telas do
cliente, o painel do barbeiro e o painel da plataforma.

O banco, a API Django, o WhatsApp (Evolution API) e o agendador de lembretes
moram no repositório irmão: **[Marcai-back](https://github.com/znt10/Marcai-back)**.

## Stack

- **Next.js 16** (App Router) e **React 19**, em TypeScript
- **Tailwind** com os tokens no bloco `@theme` de `src/app/globals.css`
- **zod** para validação, **jose** para os cookies assinados,
  **date-fns / date-fns-tz** para fuso
- **Vitest** para os testes
- Sem ORM e sem acesso a banco: toda leitura passa por `fetch()` para a API
  Django

## Subir

O front não sobe sozinho — ele depende da API e do Postgres do back. Suba
aquele lado primeiro, seguindo o README de
[Marcai-back](https://github.com/znt10/Marcai-back).

Os dois `docker compose` (um em cada repositório) dividem uma rede externa, que
precisa existir antes de qualquer um dos dois subir. Uma vez por máquina:

```bash
docker network create brutus
```

A rede é declarada como `external: true` de propósito nos dois lados: ela vive
mais que qualquer um dos composes, porque Postgres, Redis e Evolution são
compartilhados. Se um compose a criasse, ela morreria no `down` de quem a criou
e o outro lado perderia o banco no meio do trabalho.

Com o back no ar, aqui:

```bash
cp .env.example .env
docker compose up
```

- `http://brutus.localhost:3000`
- `http://dontony.localhost:3000`

`*.localhost` resolve sozinho no Chrome e no Firefox — não precisa mexer em DNS.

Para popular o banco com duas barbearias de exemplo e a equipe de cada uma, o
comando é do lado do back:

```bash
docker compose run --rm api python manage.py semear
```

## Variáveis de ambiente

`.env.example` documenta cada uma. As que exigem atenção:

| variável | por quê |
|---|---|
| `NEXT_PUBLIC_DOMINIO_BASE` | precisa ser **igual** ao `DOMINIO_BASE` do back; divergir dá 404 em tudo |
| `SESSAO_JWT_SECRET` | precisa ser **idêntico** ao do back — o cookie do barbeiro é emitido de um lado e lido do outro |
| `ADMIN_JWT_SECRET` | idem, para o painel da plataforma; e **diferente** do de sessão de propósito |
| `NEXT_PUBLIC_URL_BASE` | onde o link de convite abre — sempre este app, que é quem serve `/convite/[token]` |

`SESSAO_JWT_SECRET` e `ADMIN_JWT_SECRET` serem diferentes é o que faz um cookie
de admin não abrir o painel do barbeiro, e vice-versa, sem nenhuma checagem
escrita para esse fim.

## As telas

### Painel da plataforma — `admin.localhost:3000`

Cria barbearias com o primeiro dono, lista o que está no ar, liga e desliga
cada uma, e reemite o convite do dono.

**Cinco campos, e os dois que faltam, faltam de propósito.** Sem **horário**: o
admin não sabe o horário da casa, e pedir era pedir para ele inventar um valor
— quem escreve a frase da home é o dono, na tela de serviços. Sem **WhatsApp do
dono**: no cadastro é a mesma pessoa do contato da barbearia, então o número da
barbearia vira o login do dono. Ele separa depois pela tela de equipe.

**O link de convite vai por dois caminhos**: a tela mostra uma vez e o WhatsApp
da barbearia guarda. O token só existe em hash no banco, então admin que
fechasse a aba deixava o dono sem caminho de volta.

O painel só existe no host `admin.`. Em qualquer subdomínio de barbearia,
`/admin` e `/api/admin/*` respondem **404** — a barreira está no `proxy.ts`,
então rota nova sob esse prefixo nasce protegida.

Cinco erros de senha do mesmo IP bloqueiam aquele IP por **10 minutos**. A
trava é por IP e não por conta de propósito: a conta é uma só, e travá-la
deixaria qualquer um trancar você fora do próprio painel.

**Desativar uma barbearia leva até um minuto** para fazer efeito: o tenant fica
em cache por `TTL_CACHE_TENANT_MS`.

### Painel do barbeiro — `/painel`

Agenda do dia, marcar cliente na mão e cancelar. Entra com o celular e a senha.

O dono vê a agenda de todos e pode filtrar por barbeiro; o barbeiro vê só a
dele. Quem decide isso é `filtroDoBarbeiro()` — **nenhuma consulta do painel
monta esse filtro por fora**, e a garantia vale exatamente enquanto isso for
verdade. Barbeiro que manda `?barbeiroId=` do colega continua vendo a agenda
dele.

Ação sobre agendamento de outro barbeiro responde **404**, nunca 403 — 403
confirmaria que o registro existe.

Cinco erros de senha travam **aquela conta** por 15 minutos. É diferente da
trava do admin, que é por IP: a barbearia inteira sai do mesmo IP, e travar o
IP derrubaria a equipe junto.

### Equipe — `/painel/equipe` (só o dono)

Cadastrar barbeiro, corrigir nome, celular e papel, reemitir convite, desativar
e reativar. Barbeiro que abrir a rota recebe **403**, e o link nem aparece no
painel dele.

O convite vai por **dois caminhos**: pelo WhatsApp e na tela, uma vez só. O
envio é fire-and-forget, então API fora do ar não pode deixar o barbeiro sem
convite — e o token só existe em hash no banco, então perdido não se recupera:
reemite. Reemitir convite **é** o reset de senha: `senhaHash` volta a nulo.

**Quem entra agora não aparece para o cliente.** Sem serviço vinculado e sem
expediente, a agenda dele é vazia e ele desaparece da tela pública em silêncio.
A lista avisa isso em destaque.

**Três recusas**, todas para não deixar a barbearia sem saída: desativar quem
tem horário marcado no futuro (mostra a contagem e a data); desativar ou
rebaixar o **último dono ativo**; desativar a si mesmo.

**Trocar papel ou celular derruba a sessão** daquela pessoa na hora — o `papel`
viaja no token, então rebaixar sem invalidar deixaria alcance de dono valendo
por até 12 h. Trocar só o nome não derruba nada.

### Horários — `/painel/horarios`

Expediente por dia da semana, folgas e pausas. **Dono mexe no de todos,
barbeiro só no seu**; expediente de colega responde 404.

**Fechar um dia é apagar a linha** de `HorarioTrabalho`. A ausência já é a
representação de "não trabalho", e ter uma segunda forma de dizer isso (jornada
de duração zero) daria dois jeitos de expressar o mesmo estado.

**Um intervalo por dia.** Jornada partida se escreve como expediente 9h–20h
mais um bloqueio semanal de 12h–13h.

**Bloqueio é semanal ou pontual, nunca os dois.** Mandar os dois conjuntos de
campos é 422: uma linha com os dois teria interpretação dependente de qual
campo alguém leu primeiro.

**Encurtar o expediente por cima de horário vendido é permitido** — e a tela
lista o que ficou pendurado, com o botão de cancelar (que avisa o cliente). É
diferente da recusa ao desativar barbeiro de propósito: fechar a agenda é o que
se faz agora, com o braço quebrado, e recusar deixaria o cliente batendo numa
porta fechada.

### Serviços — `/painel/servicos`

O que cada um faz e em quanto tempo; embaixo, para o dono, o catálogo da
barbearia e a frase de horário da home.

**O catálogo é decisão da casa**, então é só do dono; **quem faz o quê e em
quanto tempo começa na pessoa**, então o barbeiro mexe no seu e o dono em
todos.

**Marcar cria o vínculo com a duração sugerida do serviço**, e a duração fica
editável por barbeiro — é ela que o motor de horários usa, e é o que deixa o
barbeiro rápido atender mais gente. **Desmarcar preserva o número praticado**:
remarcar devolve o que era, não a sugerida.

**Serviço se desativa, nunca se apaga.** Agendamentos antigos guardam o nome do
serviço copiado no momento da marcação, então o histórico não depende do
catálogo de hoje.

**As três condições para receber cliente**: estar ativo, ter expediente e fazer
algum serviço ativo. Faltando qualquer uma, o barbeiro não aparece na home.

### Quadro do dia — `/painel/dia`

Uma coluna por barbeiro, no mesmo dia, com a jornada, quanto da agenda já está
vendida e **o próximo horário livre de cada um**.

Existe para a pergunta que a agenda não responde: com um cliente parado no
balcão, *quem pega esse cara agora?* Na tela de agenda isso é trocar o barbeiro
no seletor, procurar buraco, voltar e repetir — que é o tipo de coisa que faz o
dono voltar para o caderno, porque o caderno mostra a equipe inteira de uma vez.

**O horário livre nunca aparece sozinho**: ele sai do serviço *mais curto* que
aquele barbeiro pratica, então vem com o nome dele (`16:00 (pezinho)`).
Prometer "16:00" e o corte de 40 min não caber seria pior que não mostrar nada.

**Ocupação desconta o almoço do denominador**, não conta como cliente. Com o
bloqueio no denominador, um dia genuinamente lotado marcaria 88% e o dono nunca
veria 100% — o número perderia a única leitura que interessa.

Três estados no cabeçalho, porque pedem ações diferentes: `próximo livre 16:00`
(encaixa), `sem buraco` (manda para outro) e `sem serviço marcado` (esse
barbeiro também não aparece para o cliente).

O barbeiro vê uma coluna, a dele. Quem filtra é o `filtroDoBarbeiro` da rota:
pedir a coluna do colega devolve a própria.

## WhatsApp

Todo contato com gente de fora sai por lá: confirmação, cancelamento, lembrete
e convite de barbeiro. Quem manda é o serviço `evolution`, que mora no compose
do back — e é o **Django**, não este repositório, quem fala com ele. A chave
(`EVOLUTION_API_KEY`) e a instância vivem só no `.env` do back.

A promessa da tela de confirmado — *"mandamos o lembrete 1h antes"* — também é
cumprida lá: uma tarefa de Celery beat a cada 10 minutos dispara o envio.
Mensagem sai entre 50 e 60 minutos antes do horário, uma vez só por
agendamento; quem marca já dentro da janela não recebe lembrete, porque a
confirmação que acabou de receber já é o lembrete.

## Visual

Identidade única do produto: nogueira escura, latão e letreiro condensado. Uma
para todas as barbearias — cor por barbearia seria coluna nova, token injetado
em runtime e tela no painel.

**Toda cor mora no bloco `@theme` de `src/app/globals.css`.** Um `#c98a45`
solto num componente é como a próxima tela começa a divergir desta — e a
varredura que garante isso é um `grep` de hex em `src/`, hoje com zero
resultado.

Três fontes, três trabalhos:

| papel | face | onde |
|---|---|---|
| letreiro | Big Shoulders | títulos e o botão que conclui |
| corpo | Archivo | nomes, textos, rótulos |
| dado | Space Mono | **horas, contagens** |

A terceira justifica as outras duas: este app é sobre tempo. A tela do cliente
é uma lista de horas e o quadro do dia é uma coluna de horas por barbeiro — com
fonte proporcional, `09:00` e `14:30` não alinham e a varredura vertical se
perde. Hora nova na tela nasce com `font-dado`.

**A voz dos títulos está no `h1` do `globals.css`**, não repetida em cada
página. `<h1>` sem classe é o certo.

`Lbl` é rótulo curto — caixa alta com tracking largo, e uma frase inteira
dentro dele vira grito ilegível. Frase é `Sub`.

## Testar

```bash
npm test
```

A suíte daqui não toca banco nenhum — os testes de RLS e migração são do back,
e rodam lá com `docker compose run --rm api pytest -q`.

## O que saber antes de mexer

- **O front não toca o banco.** Toda leitura de barbearia passa por `fetch()`
  para o Django (`src/lib/tenant.ts`), que já vem filtrada. RLS e papéis do
  Postgres são inteiramente do back.
- O `proxy.ts` roda no runtime **Edge**: o que ele importa entra no bundle
  dele. Binário nativo não roda lá — vale lembrar antes de importar algo pesado
  em `slug.ts`, `admin-sessao.ts` ou `auth.ts`, os três módulos que `proxy.ts`
  carrega.
- Conversão de fuso só em `src/lib/datas.ts`.
- `tests/ambiente.test.ts` (a "varredura estrutural") confere que toda variável
  de ambiente **lida** pelo código está declarada em algum lugar — nunca o
  contrário. Variável declarada e nunca lida não aparece nela.
- **O watcher do Turbopack não enxerga bind mount do Windows.** Arquivo de rota
  criado com `docker compose up` rodando responde 404, e edição em componente
  não aparece na tela por mais que se recarregue — nos dois casos a saída é
  `docker compose restart app`.

## Licença

MIT — veja o arquivo [`LICENSE`](LICENSE).
