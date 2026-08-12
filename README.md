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
npm run seed
```

- `http://brutus.localhost:3000`
- `http://dontony.localhost:3000`

`*.localhost` resolve sozinho no Chrome e no Firefox — não precisa mexer em DNS.

O seed roda do **host**, não de dentro do contêiner: ele lê `DATABASE_URL_HOST`,
e o `dotenv -e .env` carrega essa variável nos dois lugares — dentro do
contêiner ela aponta para um `localhost:5433` que não existe lá (esse
`localhost:5433` é a porta do Postgres do back, publicada pelo compose dele).

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

Antes da primeira vez, gerar a credencial:

```bash
npm run admin:hash -- "uma senha longa"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Colar as duas saídas em `ADMIN_SENHA_HASH_B64` e `ADMIN_JWT_SECRET` no `.env`,
e escolher um `ADMIN_USUARIO`. As três nunca vão para o versionamento.

O hash viaja em **base64** por um motivo específico: em claro ele é
`$argon2id$v=19$m=...`, e tanto o `@next/env` quanto o Docker Compose expandem
`$` como início de variável — o valor chegaria truncado ao processo, e o
sintoma seria um "usuário ou senha inválidos" que não explica nada.

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

Depois de `npm run seed`, o primeiro login pode falhar por até um minuto: o
seed recria a barbearia com um uuid novo e o processo ainda guarda o antigo por
`TTL_CACHE_TENANT_MS`. O sintoma é "celular ou senha inválidos" com a senha
certa.

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
do **back** (`../back`), não neste.

Antes da primeira vez, gerar a chave:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

**Uma chave, dois consumidores, dois arquivos `.env` agora:** o serviço
`evolution` (back) a exige como `AUTHENTICATION_API_KEY` e o `app` (aqui) a
manda como `EVOLUTION_API_KEY`. Cole o mesmo valor gerado acima em
`EVOLUTION_API_KEY` neste `.env` **e** no `.env` do back — chave errada é
**401 silencioso** (o envio é fire-and-forget), então o sintoma seria "a
mensagem não chega", sem erro em log nenhum.

Depois, com o `evolution` do back no ar (`../back/README.md`), parear o
telefone a partir daqui:

```bash
npm run whatsapp:qr        # salva whatsapp-qr.png; escaneia em Aparelhos conectados
npm run whatsapp:estado    # brutus: open — mensagem sai por aqui
```

O QR expira em ~40 s; rodar de novo gera outro. Alternativa com painel:
`http://localhost:8080/manager`, entrando com a mesma chave.

**A sessão mora num volume** (`evolution_instances`, no compose do back). É o
que evita escanear o QR a cada `docker compose down` daquele lado — e, em
produção, o telefone da barbearia cair a cada deploy. `docker volume rm`
derruba o pareamento.

**Sem `EVOLUTION_API_URL` o envio cai no `console.info` do app.** É o modo de
desenvolver sem número de verdade, e é o que torna o lembrete verificável:

```
[whatsapp] sem EVOLUTION_API_URL: 11977771234 Lembrete: corte hoje às 08:57…
```

**A URL tem duas formas**, como as do banco: o app fala com
`http://evolution:8080` (nome do serviço do back, resolvível porque os dois
composes dividem a rede externa `brutus`) e os scripts `whatsapp:*`, que rodam
do host, falam com `EVOLUTION_API_URL_HOST`.

**A Evolution usa o Postgres do back**, com papel e banco próprios e
**nenhum GRANT** em `brutus` — detalhes em `../back/README.md`. Todo
`DATABASE_SAVE_DATA_*` de conversa está **desligado**: o produto manda mensagem
e consulta se um número existe — nunca lê conversa. Ligado, o banco guardaria
mensagens, contatos e histórico de todo cliente de toda barbearia.

**Um número para a plataforma inteira.** Quem identifica a casa é o texto da
mensagem, que já leva nome e endereço. Número por barbearia seria uma coluna em
`Barbearia` mais uma instância por tenant.

## Lembrete no WhatsApp

A tela de confirmado promete ao cliente *"mandamos o lembrete 1h antes"*. Quem
cumpre isso é o serviço **`agendador`**, que mora no compose do **back**
(`../back`): ele bate em `POST /api/cron/lembretes` — a rota deste
repositório — a cada 10 minutos, com `CRON_SECRET` no `Authorization`.
Acompanhar os tiques é assunto do back; veja `../back/README.md`.

**Precisa de `CRON_SECRET` no `.env`, o mesmo valor nos dois lados** (quem
manda o header é o `agendador`, no `.env` do back; quem confere é esta rota,
no `.env` daqui). Vazio, a rota nega tudo — de propósito: sem segredo
configurado ela ficaria sendo um disparador público de mensagens para a base
inteira de clientes. Gerar com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Sem o segredo o agendador sobe e toma 401 a cada tique, e isso aparece no log
dele, no back. É barulhento por escolha: falha em silêncio aqui é lembrete que
nunca chega e ninguém descobre.

**O tique tem que ser menor que a janela.** São 10 min contra 60
(`LEMBRETE_TIQUE_MIN` e `LEMBRETE_ANTECEDENCIA_MIN`, lado a lado no
`config.ts`): a mensagem sai entre 50 e 60 minutos antes. Tique maior que a
janela perderia agendamento — quem entra nela entre dois tiques nunca seria
visto.

**Quem marca dentro da janela não recebe lembrete**, porque a confirmação que
ele acabou de receber já é o lembrete. O agendamento nasce com
`lembreteEnviadoEm` preenchido. Sem isso, todo encaixe de balcão viraria duas
mensagens em minutos — o padrão da tela de marcar na mão é 30 minutos.

**O cron marca antes de enviar.** Agendador que dispara duas vezes (reinício,
tique atrasado) não manda duas mensagens; em troca, envio que falha não é
repetido. Perder um lembrete é melhor que duplicar.

Sem `EVOLUTION_API_URL` o envio cai no `console.info` do app — é o que deixa
tudo isso verificável sem depender de um número de WhatsApp de verdade.

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

O banco de teste mora no compose do **back** (`../back`) — precisa dele no ar
antes da primeira rodada; veja `../back/README.md`.

```bash
npm test
```

Os testes rodam do host contra o banco `brutus_test`. Em máquina nova, aplicar
as migrações nele antes da primeira rodada:

```bash
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
```

## O que saber antes de mexer

- **Nunca** consultar dado de barbearia fora de `comBarbearia()` — ou de
  `comBarbeariaAdmin()`, no painel. O RLS devolve zero linhas, e o bug parece
  "sumiu tudo".
- **Papel novo no Postgres precisa ser nomeado nas políticas de RLS.** Elas
  são `TO brutus_app, brutus_admin`; um papel fora dessa lista não casa com
  política nenhuma e não enxerga linha alguma.
- O `proxy.ts` roda no runtime **Edge**: o que ele importa entra no bundle
  dele. Por isso `slug.ts` não importa o Prisma e `admin-sessao.ts` não
  importa o argon2 — binário nativo não roda lá.
- O runtime usa `DATABASE_URL_APP` (papel `brutus_app`). Apontar para
  `DATABASE_URL` desliga o isolamento: o dono da tabela ignora RLS.
- Conversão de fuso só em `src/lib/datas.ts`.
- Tabela nova com `barbeariaId` precisa de política de RLS. O teste
  `varredura estrutural` falha se você esquecer.
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
