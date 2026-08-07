# BRUTUS — Painel do barbeiro · Design

**Etapa 2.** Depende do design da Etapa 1 (`2026-08-05-brutus-agendamento-cliente-design.md`)
e do design do admin (`2026-08-06-brutus-admin-da-plataforma-design.md`).

---

## 1. O problema

A Etapa 1 entregou o cliente marcando sozinho pelo site. O barbeiro não tem
onde ver o que foi marcado — e continua com o caderno para o cliente que liga
ou aparece na porta. Enquanto existirem os dois, a agenda do sistema mente: ela
mostra livre um horário que o caderno já vendeu, e o motor de horários de §6
oferece esse horário para o próximo cliente.

O painel existe para o caderno acabar. Daí o escopo desta etapa: **ver a agenda
do dia, marcar na mão, cancelar.** Nada além disso resolve o problema, e tudo
além disso adia a solução.

---

## 2. O que entra

| Capacidade | Quem |
|---|---|
| Entrar com celular e senha | Barbeiro e dono |
| Ver a agenda do dia | Barbeiro vê a dele; dono vê a de todos |
| Marcar um cliente na mão | Ambos, no alcance de cada um |
| Cancelar um agendamento | Ambos, no alcance de cada um |

**O dono não ganha tela nenhuma a mais — ganha alcance.** É a mesma agenda, com
o filtro por barbeiro liberado. Equipe, cadastro e edição de serviço são a
Etapa 3; antecipar qualquer pedaço disso aqui só atrasa o fim do caderno.

---

## 3. A sessão do barbeiro

Isto **implementa** o §9.5 do design da Etapa 1. Aquele texto continua sendo a
decisão; o que segue é o que a implementação acrescenta.

### O token e as duas camadas

JWT HS256 (`jose`), cookie `sessao` — `httpOnly`, `SameSite=Lax`, 12 h — com
carga `{ sub, bid, papel, tv }`.

A verificação tem quatro conferências, e elas **não cabem no mesmo lugar**:

| Conferência | Onde | Por quê ali |
|---|---|---|
| Assinatura e `exp` | `proxy.ts` (Edge) | Barra requisição não autenticada antes do banco. `jose` roda em Edge |
| `bid` == tenant resolvido | rota | O proxy conhece o **slug** do `Host`, não o `barbeariaId`: resolver slug → id é consulta ao banco, e o Edge não tem Prisma |
| `tv` == `Barbeiro.tokenVersion` | rota | Idem |
| `Barbeiro.ativo` | rota | Idem |

A tentação era conferir o `bid` já no Edge, que é onde o `Host` está. Não dá
sem pôr o slug dentro do token — e aí a conferência mais importante do sistema
passaria a depender de um campo que o próprio token carrega, em vez do id que o
banco resolveu. A conferência fica na rota, onde `comBarbearia()` já resolveu o
tenant, e o proxy é a primeira peneira, não a última.

Qualquer uma falhando: **401 e o cookie é apagado**. Sessão morta que continua
no navegador vira 401 em loop na tela seguinte, e o barbeiro liga achando que o
sistema caiu.

O `proxy.ts` só pode importar o que roda em Edge — a mesma regra que já obrigou
`slug.ts` a não importar Prisma e `admin-sessao.ts` a não importar argon2. O
módulo de sessão nasce partido em dois pelo mesmo motivo: `src/lib/auth.ts`
(verificação, sem banco e sem argon2, seguro no Edge) e a conferência de `tv` e
`ativo` dentro da rota.

### Segredo próprio, e é isso que faz o teste cruzado passar

`SESSAO_JWT_SECRET` é uma variável nova, **diferente** de `ADMIN_JWT_SECRET`.
Não é higiene: é o mecanismo. Cookie de admin apresentado numa rota do painel
falha na assinatura, e cookie de barbeiro apresentado numa rota de admin também
— sem nenhuma checagem escrita para isso. Segredo compartilhado transformaria
os dois papéis em um só problema de `papel` no payload, e um erro de leitura
viraria escalada de privilégio.

### Senha

argon2id via `@node-rs/argon2`, já instalado pelo admin. O `verify` roda
**sempre**, inclusive quando o celular não pertence a barbeiro nenhum, contra
um hash descartável gerado uma vez no boot. Sem isso a resposta genérica
"celular ou senha inválidos" é teatro: o atacante lê no relógio quais números
existem.

Barbeiro com `senhaHash` nulo não entra — é o `convite enviado — sem senha
ainda`. A rota que define a senha (`POST /api/auth/convite/[token]`) **já
existe**: veio junto com o admin, porque sem ela o painel entregava contas
inutilizáveis.

### Força bruta — por barbeiro, no banco

Cinco erros seguidos travam **aquele barbeiro** por 15 minutos
(`tentativasLogin`, `bloqueadoAte`). Acerto zera.

Duas diferenças em relação ao admin, e as duas são decisões, não descuido:

- **Por conta, não por IP.** A barbearia inteira sai do mesmo IP; travar o IP
  derrubaria a equipe junto por causa de um funcionário desmemoriado. No admin
  é o contrário: a conta é uma só, e travá-la trancaria você fora do próprio
  painel.
- **No banco, não em memória.** A trava do admin em memória é aceitável
  enquanto o deploy for de instância única. Esta não seria: são muitas contas,
  e o atacante que espera o processo reciclar zera o contador de graça.

---

## 4. Autorização — um ponto de passagem

```ts
// src/lib/autorizacao.ts
export function filtroDoBarbeiro(sessao: Sessao): { barbeiroId?: string } {
  return sessao.papel === 'DONO' ? {} : { barbeiroId: sessao.sub };
}
```

**Nenhuma consulta do painel monta esse filtro por fora.** Vale para leitura de
agenda e para toda ação sobre agendamento.

Ação sobre um registro carrega primeiro e reconfere depois: um `BARBEIRO` que
forje o id de um agendamento do colega recebe **404**. Não 403 — 403 confirma
que o registro existe, e a resposta vira um oráculo de "quem atendeu quem".

O dono filtrando por um barbeiro específico (`?barbeiroId=`) passa pelo mesmo
ponto: o parâmetro só é honrado quando `papel === 'DONO'`. Barbeiro que mande o
parâmetro com o id do colega continua vendo a agenda dele — o filtro da sessão
vence o da query, sempre.

**Por que isto não foi para o RLS** está no §9.5 da Etapa 1 e continua valendo:
a área pública precisa ler a ocupação de todos os barbeiros para calcular
horário livre. Tenant no banco, barbeiro na aplicação.

---

## 5. Rotas

| Rota | O quê |
|---|---|
| `POST /api/auth/login` | celular + senha → cookie `sessao` |
| `POST /api/auth/logout` | apaga o cookie |
| `GET /api/auth/eu` | nome, papel e id para a tela |
| `GET /api/painel/agenda?dia=&barbeiroId=` | agendamentos do dia, no alcance da sessão |
| `POST /api/painel/agendamentos` | marcar na mão |
| `POST /api/painel/agendamentos/[id]/cancelar` | cancelar |

`POST /api/auth/convite/[token]` já existe e não muda.

O prefixo `/api/painel/*` é a fronteira: o `proxy.ts` exige cookie com
assinatura válida em tudo que começa com ele, então **rota nova sob esse
prefixo nasce com a peneira grossa aplicada** — o mesmo arranjo que o
`/api/admin/*` já usa, e pelo mesmo motivo (a barreira em um lugar só, não
espalhada por handler). O que o proxy não consegue conferir (§3) cada rota
confere ao abrir a sessão, e é por isso que a leitura da sessão na rota é uma
função só, e não código copiado por handler.

---

## 6. Telas

| Rota | Tela |
|---|---|
| `/painel/login` | celular e senha |
| `/painel` | agenda do dia, com ida e volta por dia |
| `/painel/novo` | marcar na mão |

No padrão dos componentes `wf` e no layout desktop que a moldura já
estabeleceu. Cancelar é uma ação dentro do item da agenda, com confirmação —
não merece tela própria.

Para o dono, a agenda do dia traz o seletor de barbeiro (todos, ou um). Para o
barbeiro, o seletor não existe: um controle que só tem uma opção é ruído.

Sessão ausente ou expirada em `/painel` manda para `/painel/login`.

---

## 7. Marcar na mão

**A escrita reaproveita a transação do §9.3 do design da Etapa 1** —
revalidação dentro da transação mais a *exclusion constraint* de §5.4. Aquela
constraint é a única garantia real contra dupla marcação, e o painel escrevendo
por fora dela reintroduziria exatamente o problema que o painel veio resolver.

Três diferenças em relação ao fluxo público, todas deliberadas:

- **Sem verificação na Evolution (§10.5).** Aquela chamada é um oráculo de
  enumeração, defendido por um limite de 10 por hora por IP. O balcão da
  barbearia é um IP só: o limite morderia o uso legítimo e ninguém mais
  marcaria nada depois das dez da manhã. E o barbeiro está com o cliente na
  frente — ele não precisa de oráculo. O formato do celular continua validado
  (`telefone.ts`), porque número torto quebra a confirmação e o lembrete.
- **Sem antecedência mínima do público.** O barbeiro marca para daqui a cinco
  minutos se for o caso. Marcar no passado continua recusado: agenda não é
  histórico.
- **O cliente é reaproveitado pelo celular dentro do tenant.** Existindo, o
  agendamento pendura no cliente existente e o nome é atualizado para o que foi
  digitado — o barbeiro está com a pessoa na frente e sabe o nome melhor do que
  o formulário público de três meses atrás. Não existindo, nasce um.

A confirmação por WhatsApp é enviada como no fluxo público: depois do
`COMMIT`, `fire-and-forget`, e falha de WhatsApp nunca derruba um agendamento.

### Os padrões da tela

Abre com o **primeiro serviço ativo** da barbearia já escolhido (`ordem: 0` —
"Corte" na BRUTUS) e o horário em **agora + 30 min, arredondado para cima na
granularidade de 30**. É o caso do balcão: o cliente está ali e quer o próximo
horário. Os dois campos são trocáveis; o padrão é o que economiza toque, não
uma regra.

Horário ocupado responde **409** com a mensagem de que aquele horário acabou de
ser tomado — o mesmo tratamento do público, porque a corrida é a mesma.

---

## 8. Cancelar

Grava `CANCELADO_BARBEIRO` (o enum já existe), preenche `canceladoEm` e libera
o horário — a *exclusion constraint* só conta `CONFIRMADO`, então liberar é
consequência de mudar o status, não um passo à parte.

**O prazo de uma hora (`PRAZO_CANCELAMENTO_MIN`) não vale para o barbeiro.** É
uma regra contra o cliente sumir em cima da hora; o barbeiro que quebrou o
braço precisa desmarcar a tarde inteira agora.

O cliente é avisado por WhatsApp com um **texto novo** em `mensagens.ts`: o
atual diz que o próprio cliente cancelou, e mandá-lo aqui seria mentira na cara
de quem perdeu o horário.

---

## 9. Constantes e variáveis

`src/lib/config.ts`:

```ts
export const SESSAO_BARBEIRO_HORAS = 12;      // um turno
export const BARBEIRO_TRAVA_TENTATIVAS = 5;
export const BARBEIRO_TRAVA_MIN = 15;
export const PAINEL_ANTECEDENCIA_PADRAO_MIN = 30;
```

`.env` / `.env.example`: `SESSAO_JWT_SECRET` (§3). Sem valor no exemplo, como
as três do admin.

---

## 10. Testes

`tests/auth.test.ts`:

- celular certo e senha errada → genérico, e o contador sobe
- cinco erros → travado por 15 min; acerto depois do prazo zera
- barbeiro com `senhaHash` nulo não entra
- `tokenVersion` incrementado derruba a sessão emitida antes
- **cookie da BRUTUS no host da Dom Tony → 401** (§9.5, o `bid`): assinatura
  válida, não expirado, barbeiro existente — e ainda assim recusado
- **cookie de admin em rota do painel, e cookie de barbeiro em rota de admin →
  401 nos dois sentidos** (a lacuna que o plano do admin registrou e adiou por
  não existir sessão de barbeiro)

`tests/painel.test.ts`:

- dono vê a agenda de todos; barbeiro vê só a dele
- barbeiro mandando `?barbeiroId=` do colega continua vendo a dele
- ação no agendamento do colega → 404
- marcar na mão em cima de horário ocupado → 409, e o banco continua com um
- cancelar libera o horário para o fluxo público

---

## 11. Fora do escopo

- **Reagendar.** Cancelar e marcar de novo resolve, com uma transação a menos
  para acertar. Entra quando o uso pedir.
- **Bloqueio de folga, almoço e imprevisto.** A tabela `Bloqueio` já existe no
  schema, mas nada escreve nela; a tela é da Etapa 3, junto com o expediente.
- **Equipe, cadastro de barbeiro, edição de serviço** — Etapa 3.
- **Preço.** `Servico` continua sem valor. Nada nesta etapa mostra dinheiro, e
  a coluna é aditiva quando a tela pedir.
- **Semana e mês.** A agenda é do dia. Quem precisa de visão longa é o dono, e
  é o dono que vai dizer qual visão quer.
- **Refresh token.** Relogar uma vez por turno é aceitável.

---

## 12. O que a Etapa 3 herda pronto

`filtroDoBarbeiro()` como ponto de passagem, a sessão com `tv` (que é o
mecanismo de "desativar barbeiro derruba na hora"), o convite já implementado
de ponta a ponta, e o prefixo `/api/painel/*` protegido no proxy — a tela de
equipe cadastra em cima de tudo isso sem abrir fronteira nova.
