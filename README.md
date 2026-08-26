# BRUTUS — agenda para barbearias

Agendamento multi-tenant: cada barbearia tem o próprio subdomínio.

## Subir

Duas pastas irmãs, duas responsabilidades: este repositório é o Next.js; o
banco, a API Django, a Evolution (WhatsApp) e o agendador de lembretes moram
em `../back` — suba aquele lado primeiro, pelo `../back/README.md` dele.

Os dois `docker compose` (um em cada pasta) dividem uma rede externa, que
precisa existir antes de qualquer um dos dois subir. Uma vez só, nunca mais:

```bash
docker network create brutus
```

Com o back no ar, aqui:

```bash
cp .env.example .env
docker compose up
```

- `http://brutus.localhost:3000`
- `http://dontony.localhost:3000`

`*.localhost` resolve sozinho no Chrome e no Firefox — não precisa mexer em DNS.

O seed mora no **back** desde a fatia 8, não mais aqui — `npm run seed`
chamava o `prisma/seed.ts`, que saiu junto com o Prisma. Para recriar os dois
tenants e a equipe de cada um:

```bash
docker compose run --rm api python manage.py semear
```

## Admin da plataforma

`http://admin.localhost:3000` — cria barbearias com o primeiro dono, lista o
que está no ar, liga e desliga cada uma, e reemite o convite do dono.

**Cinco campos, e os dois que faltam, faltam de propósito.** Sem **horário**: o
admin não sabe o horário da barbearia, e pedir era pedir para ele inventar um
valor — quem escreve a frase da home é o dono, na tela de serviços. Sem
**WhatsApp do dono**: no cadastro é a mesma pessoa do contato da barbearia, então
o número da barbearia vira o login do dono. Ele separa depois pela tela de
equipe, se a casa ganhar um número próprio.

**O link de convite vai por dois caminhos**: a tela mostra uma vez e o WhatsApp
da barbearia guarda. Antes ia só para a tela — e o token só existe em hash no
banco, então admin que fechasse a aba deixava o dono sem caminho de volta. Vale
igual para o "novo convite" da lista.

Antes da primeira vez, gerar a credencial. Desde a fatia 8 quem autentica é
o Django (`AdminLoginView`), então `ADMIN_USUARIO` e `ADMIN_SENHA_HASH_B64`
vão no `.env` do **back** agora, não mais aqui — `npm run admin:hash` saiu
junto com o Prisma; o comando equivalente mora lá:

```bash
docker compose run --rm api python manage.py admin_hash "uma senha longa"
```

Colar a saída em `ADMIN_SENHA_HASH_B64` no `.env` do back, ao lado de um
`ADMIN_USUARIO` escolhido à mão — nenhum dos dois vai para o versionamento.
Gerar também `ADMIN_JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

... e colar o **mesmo valor** nos dois `.env` (front e back, tampouco
versionado): o Django emite o cookie (`AdminLoginView`) e o `proxy.ts` daqui
só o lê, para guardar as páginas `/admin/*` no Edge antes de qualquer rota
rodar. Divergir desloga o admin a cada navegação.

O painel só existe no host `admin.`. Em qualquer subdomínio de barbearia,
`/admin` e `/api/admin/*` respondem **404** — a barreira está no `proxy.ts`,
então rota nova sob esse prefixo nasce protegida.

Cinco erros de senha do mesmo IP bloqueiam aquele IP por **10 minutos**. A
trava é por IP e não por conta de propósito: a conta é uma só, e travá-la
deixaria qualquer um trancar você fora do próprio painel.

**Desativar uma barbearia leva até um minuto** para fazer efeito: o tenant
fica em cache por `TTL_CACHE_TENANT_MS`.

## Painel do barbeiro

`http://brutus.localhost:3000/painel` — agenda do dia, marcar cliente na mão e
cancelar. Entra com o celular e a senha; no seed, Téo (`11911112222`), Rael
(`11933334444`) e Tony (`11977778888`, na Dom Tony) nascem com `123456`. Duda
nasce **sem** senha de propósito: é o convite pendente, e quem não tem
`senhaHash` não entra.

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

`SESSAO_JWT_SECRET` é **diferente** de `ADMIN_JWT_SECRET` de propósito: é isso
que faz cookie de admin não abrir o painel, e vice-versa, sem nenhuma checagem
escrita para esse fim.

Depois de `manage.py semear` (no back), o primeiro login pode falhar por até
um minuto: o seed recria a barbearia com um uuid novo e o processo ainda
guarda o antigo por `TTL_CACHE_TENANT_MS`. O sintoma é "celular ou senha
inválidos" com a senha certa.

## Equipe (só o dono)

`/painel/equipe` — cadastrar barbeiro, corrigir nome, celular e papel, reemitir
convite, desativar e reativar. Barbeiro que abrir a rota recebe **403**, e o
link nem aparece no painel dele.

O convite vai por **dois caminhos**: pelo WhatsApp e na tela, uma vez só. O
envio é fire-and-forget, então API fora do ar não pode deixar o barbeiro sem
convite — e o token só existe em hash no banco, então perdido não se recupera:
reemite.

**Quem entra agora não aparece para o cliente.** Sem serviço vinculado e sem
expediente, a agenda dele é vazia e ele desaparece da tela pública em silêncio.
A lista avisa isso em destaque; preencher os dois é a Etapa 3 fatia B e C.

**Três recusas**, todas para não deixar a barbearia sem saída:

- desativar quem tem horário marcado no futuro (mostra a contagem e a data);
- desativar ou rebaixar o **último dono ativo**;
- desativar a si mesmo.

**Trocar papel ou celular derruba a sessão** daquela pessoa na hora — o `papel`
viaja no token, então rebaixar sem invalidar deixaria alcance de dono valendo
por até 12 h. Trocar só o nome não derruba nada.

Reemitir convite **é** o reset de senha: `senhaHash` volta a nulo.

## Horários (cada um no seu)

`/painel/horarios` — expediente por dia da semana, folgas e pausas. **Dono mexe
no de todos, barbeiro só no seu**; expediente de colega responde 404. É
diferente da equipe, que é só do dono: lá se decide quem é da casa, aqui quando
cada um trabalha.

**Fechar um dia é apagar a linha** de `HorarioTrabalho`. A ausência já é a
representação de "não trabalho" — o motor devolve agenda vazia na primeira
linha —, e ter uma segunda forma de dizer isso (jornada de duração zero) daria
dois jeitos de expressar o mesmo estado.

**Um intervalo por dia.** Jornada partida se escreve como expediente 9h–20h mais
um bloqueio semanal de 12h–13h, que é como o seed já monta o almoço.

**Bloqueio é semanal ou pontual, nunca os dois.** Mandar os dois conjuntos de
campos é 422: o motor lê um formato ou o outro, e uma linha com os dois teria
interpretação dependente de qual campo alguém leu primeiro.

**Encurtar o expediente por cima de horário vendido é permitido** — e a tela
lista o que ficou pendurado, com o botão de cancelar (que avisa o cliente). É de
propósito diferente da recusa ao desativar barbeiro: fechar a agenda é o que se
faz agora, com o braço quebrado, e recusar deixaria o cliente batendo numa porta
fechada.

## Serviços (catálogo do dono, vínculos de cada um)

`/painel/servicos` — o que cada um faz e em quanto tempo; embaixo, para o dono,
o catálogo da barbearia e a frase de horário da home.

A divisão segue o critério das outras telas: **o catálogo é decisão da casa**
(o que a barbearia vende), então é só do dono; **quem faz o quê e em quanto
tempo começa na pessoa**, então o barbeiro mexe no seu e o dono em todos.

**Marcar cria o vínculo com a duração sugerida do serviço**, e a duração fica
editável por barbeiro — é ela que o motor de horários usa, e é o que deixa o
barbeiro rápido atender mais gente. **Desmarcar preserva o número praticado**:
remarcar devolve o que era, não a sugerida.

**A frase de horário nasce vazia**, porque o admin não a preenche. Enquanto
ninguém escrever, a home não mostra horário nenhum — e a tela avisa isso em
destaque. O campo abre com o que está valendo, não em branco; e o `GET` lê do
banco, não do cache de tenant, senão o dono salvava e a tela continuava
mostrando a frase antiga por até um minuto.

**Serviço se desativa, nunca se apaga.** Agendamentos antigos guardam o nome do
serviço copiado no momento da marcação, então o histórico não depende do
catálogo de hoje.

**As três condições para receber cliente**, que a tela de equipe cobra: estar
ativo, ter expediente e fazer algum serviço ativo. Faltando qualquer uma, o
barbeiro não aparece na home — e a partir da Etapa 3 as três se resolvem pelo
painel.

## Quadro do dia (a equipe lado a lado)

`/painel/dia` — uma coluna por barbeiro, no mesmo dia, com a jornada, quanto da
agenda já está vendida e **o próximo horário livre de cada um**.

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

Três estados diferentes no cabeçalho, porque pedem ações diferentes:
`próximo livre 16:00` (encaixa), `sem buraco` (manda para outro) e **`sem
serviço marcado`** (o mesmo defeito que a tela de equipe denuncia — esse
barbeiro também não aparece para o cliente).

**Barbeiro é para todo mundo, não só para o dono.** O barbeiro vê uma coluna, a
dele, com o próximo livre que o painel não mostra em lugar nenhum. Quem filtra
é o `filtroDoBarbeiro` da rota: pedir a coluna do colega devolve a própria.

## WhatsApp (conectar o número)

Todo contato com gente de fora sai por aqui: confirmação, cancelamento, lembrete
e convite de barbeiro. Quem manda é o serviço `evolution`, que mora no compose
do **back** (`../back`) — e desde a fatia 8 é o **Django**, não mais este
repositório, quem fala com ele (`app/services/whatsapp.py`, no back).

A chave (`EVOLUTION_API_KEY`) e a instância (`EVOLUTION_INSTANCE`) vivem só no
`.env` do back agora; gerar e configurar por lá — veja `../back/README.md` e
o `.env.example` de lá. Este `.env` (front) não guarda mais essa chave.

Para parear o telefone, com o `evolution` do back no ar (`../back/README.md`):
o painel da própria Evolution, `http://localhost:8080/manager`, entrando com
`EVOLUTION_API_KEY`. Os scripts `npm run whatsapp:qr`/`whatsapp:estado` que
existiam aqui saíram na fatia 8 junto com o resto da integração; ainda não
têm equivalente por linha de comando no back.

**A sessão mora num volume** (`evolution_instances`, no compose do back). É o
que evita escanear o QR a cada `docker compose down` daquele lado — e, em
produção, o telefone da barbearia cair a cada deploy. `docker volume rm`
derruba o pareamento.

**Sem `EVOLUTION_API_URL` o envio cai no log do back**, não mais no
`console.info` do app daqui — esse caminho saiu com o resto da integração. É
o modo de desenvolver sem número de verdade; mesmo formato de antes, agora em
`app/services/whatsapp.py`:

```
[whatsapp] sem EVOLUTION_API_URL: 11977771234 Lembrete: corte hoje às 08:57…
```

**A URL tem duas formas**, ambas do lado do back agora: dentro do compose o
nome do serviço é `http://evolution:8080` (resolvível porque os dois composes
dividem a rede externa `brutus`); fora de contêiner é `EVOLUTION_API_URL_HOST`.

**A Evolution usa o Postgres do back**, com papel e banco próprios e
**nenhum GRANT** em `brutus` — detalhes em `../back/README.md`. Todo
`DATABASE_SAVE_DATA_*` de conversa está **desligado**: o produto manda mensagem
e consulta se um número existe — nunca lê conversa. Ligado, o banco guardaria
mensagens, contatos e histórico de todo cliente de toda barbearia.

**Um número para a plataforma inteira.** Quem identifica a casa é o texto da
mensagem, que já leva nome e endereço. Número por barbearia seria uma coluna em
`Barbearia` mais uma instância por tenant.

## Lembrete no WhatsApp

A tela de confirmado promete ao cliente *"mandamos o lembrete 1h antes"*.
Cumprir isso é inteiramente do **back** desde a fatia 8: a tarefa
`app.tasks.lembretes`, batida pelo Celery beat a cada 10 minutos, dispara o
envio direto. Não passa mais por uma rota deste repositório — o
`POST /api/cron/lembretes` que existia aqui saiu junto com os outros
handlers; o nome sobrevive só como gancho manual/externo **no back**
(`CRON_SECRET` é `.env` de lá agora). Detalhes e como acompanhar os tiques:
`../back/README.md`.

A janela (`LEMBRETE_ANTECEDENCIA_MIN = 60`) e a idempotência
(`lembrete_enviado_em`, no lugar do antigo `lembreteEnviadoEm`) seguem a
mesma lógica de antes — mensagem sai entre 50 e 60 minutos antes do horário,
uma vez só por agendamento, e quem marca já dentro da janela não recebe
lembrete porque a confirmação que acabou de receber já é o lembrete — só que
implementadas em Django agora; ver `backend/tenant/config.py` e
`backend/app/services/lembrete.py` no back para o motor.

Sem `EVOLUTION_API_URL` o envio cai no log do back — o mesmo modo de
desenvolver sem número de verdade que valia aqui antes da fatia 8.

## Visual

Identidade única do produto: nogueira escura, latão e letreiro condensado. Uma
para todas as barbearias — cor por barbearia seria coluna nova, token injetado
em runtime e tela no painel, e fica para quando alguém pedir.

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
página. `<h1>` sem classe é o certo; `text-[17px]` num título é o defeito que
os tokens de cor já tinham resolvido, reaparecendo na tipografia.

`Lbl` é rótulo curto — ele é caixa alta com tracking largo, e uma frase inteira
dentro dele vira grito ilegível. Frase é `Sub`.

## Testar

```bash
npm test
```

Desde a fatia 8 a suíte daqui não toca banco nenhum: o Prisma saiu, e com
ele a última rota que consultava o Postgres direto do front. Os testes que
rodavam contra `brutus_test` (RLS, migrações) viraram testes do **back** —
rodam lá com `docker compose run --rm api pytest -q`; veja
`../back/README.md`.

## O que saber antes de mexer

- **O front não toca mais o banco.** Toda leitura de barbearia passa por
  `fetch()` para o Django (`src/lib/tenant.ts`), que já vem filtrada. RLS,
  papéis do Postgres (`brutus_app`/`brutus_owner`) e os antigos
  `comBarbearia()`/`comBarbeariaAdmin()` — que valiam aqui até a fatia 8 —
  agora são inteiramente do **back**; ver `tenant/rls.py` e
  `../back/README.md`.
- O `proxy.ts` roda no runtime **Edge**: o que ele importa entra no bundle
  dele. Binário nativo (era o caso do `@node-rs/argon2`, hoje só no back)
  não roda lá — vale lembrar antes de importar algo pesado em `slug.ts`,
  `admin-sessao.ts` ou `auth.ts`, os três módulos que `proxy.ts` carrega.
- Conversão de fuso só em `src/lib/datas.ts`.
- `tests/ambiente.test.ts` (a "varredura estrutural") confere que toda
  variável de ambiente **lida** pelo código está declarada em algum lugar —
  nunca o contrário. Uma variável declarada e nunca lida (como as seis que
  saíram do `docker-compose.yml` na fatia 8) não aparece nela; ninguém
  escreve esse teste ainda.
- **O watcher do Turbopack não enxerga o bind mount do Windows.** Arquivo de
  rota criado com `docker compose up` rodando responde 404, e edição em
  componente não aparece na tela por mais que se recarregue — nos dois casos a
  saída é `docker compose restart app`. Antes de caçar bug de layout que
  "não mudou nada", reinicia.

Specs, na ordem em que foram escritos:

| etapa | spec |
|---|---|
| 1 — fluxo do cliente | `2026-08-05-brutus-agendamento-cliente-design.md` |
| — admin da plataforma | `2026-08-06-brutus-admin-da-plataforma-design.md` |
| 2 — painel do barbeiro | `2026-08-07-brutus-painel-do-barbeiro-design.md` |
| 3A — equipe | `2026-08-07-brutus-equipe-design.md` |
| 3B — expediente e bloqueios | `2026-08-07-brutus-expediente-design.md` |
| 3C — serviços e durações | `2026-08-07-brutus-servicos-design.md` |
| 3D — quadro do dia | `2026-08-08-brutus-quadro-do-dia-design.md` |
| 4 — visual definitivo | `2026-08-08-brutus-visual-definitivo-design.md` |
| 5A — o lembrete que sai | `2026-08-08-brutus-lembrete-que-sai-design.md` |
| 5B — a Evolution no ar | `2026-08-08-brutus-evolution-no-ar-design.md` |

Todos em `docs/superpowers/specs/`.
