# BRUTUS — Serviços e durações · Design

**Etapa 3, fatia C.** A última. Depende dos designs anteriores.

---

## 1. O problema

As fatias A e B deixaram o dono montar a equipe e cada um definir seus
horários. Falta a terceira condição para alguém receber cliente: **fazer algum
serviço**. Hoje só o seed escreve `Servico` e `BarbeiroServico` — o dono não
cria "corte infantil", não muda o preço do tempo (a duração), e o barbeiro novo
segue invisível mesmo com a semana inteira aberta.

Esta fatia fecha a Etapa 3: no fim dela, o aviso "não aparece para o cliente"
da tela de equipe pode ser resolvido inteiramente pelo painel.

---

## 2. O que entra

| Capacidade | Quem |
|---|---|
| Ver o catálogo de serviços | Todos |
| Criar, renomear, ajustar limites, desativar e reativar serviço | Só o `DONO` |
| Marcar quais serviços cada um faz | Dono em todos; barbeiro no seu |
| Ajustar a duração por barbeiro | Dono em todos; barbeiro no seu |
| Editar a frase de horário da barbearia | Só o `DONO` |

A divisão repete a das fatias anteriores, e pelo mesmo critério: **o catálogo é
decisão da casa** (o que a barbearia vende), então é `ehDono`; **quem faz o quê
e em quanto tempo começa na pessoa**, então é `alvoDoBarbeiro` — o mesmo helper
que a fatia B já usa.

---

## 3. Vincular é marcar, não preencher

Na tela, cada barbeiro tem a lista de serviços com uma marca. Marcou: o vínculo
nasce com a **`duracaoSugeridaMin` do serviço**, e a duração fica editável ao
lado.

O caminho comum — "esse barbeiro faz barba" — vira um clique. Pedir a duração
toda vez transformaria uma decisão de catálogo numa decisão numérica a cada
contratação, e o número certo na esmagadora maioria dos casos é o sugerido.

**A duração continua por barbeiro** (`BarbeiroServico.duracaoMin`), porque é o
que o motor de horários usa e é o que deixa o barbeiro rápido atender mais
gente. Mexer nela é que aciona o `validarDuracao` — escrito e testado desde a
Etapa 1, esperando esta tela.

**Desmarcar é `ativo = false`**, não `DELETE`: a linha guarda a duração que
aquele barbeiro praticava, e remarcar depois devolve o número em vez de voltar
ao sugerido.

---

## 4. Serviço se desativa, nunca se apaga

`Servico.ativo = false`. Some da tela do cliente, some dos vínculos que o motor
considera, e os agendamentos antigos continuam de pé — eles guardam
`servicoNome` copiado no momento da marcação (§5.1 da Etapa 1), justamente para
o histórico não depender do catálogo de hoje.

É coerente com barbearia e barbeiro, que também nunca são apagados. E não há
recusa a fazer: desativar serviço **não** invalida agendamento marcado, porque o
agendamento não lê mais o catálogo.

O que **pode** acontecer é um barbeiro ficar sem serviço nenhum ativo e sumir da
tela do cliente. A tela de equipe já avisa isso desde a fatia A — e a partir
desta fatia o aviso tem conserto na mesma sessão.

---

## 5. A frase de horário

`Barbearia.horarioResumo` é texto livre exibido na home. O design da Etapa 1
decidiu **não** derivá-lo das agendas: a união dos expedientes de uma equipe com
horários diferentes produz frase ruim ("seg a sáb, 9h–20h, exceto terça de 10h
às 19h e quinta…"). O dono escreve, e agora tem onde.

Entra aqui por proximidade — é a última coisa do painel que ainda dependia do
seed — e porque é uma rota de uma linha.

---

## 6. Rotas

| Rota | Quem | O quê |
|---|---|---|
| `GET /api/painel/servicos` | sessão | Catálogo com quantos barbeiros fazem cada um |
| `POST /api/painel/servicos` | dono | Cria |
| `PATCH /api/painel/servicos/[id]` | dono | Nome, limites, ordem, `ativo` |
| `GET /api/painel/barbeiro-servicos?barbeiroId=` | alcance | O que aquele barbeiro faz |
| `PUT /api/painel/barbeiro-servicos` | alcance | Marca, desmarca ou muda a duração |
| `PATCH /api/painel/barbearia` | dono | `horarioResumo` |

Validação: `nome` 2–40 e único por barbearia (409); `duracaoMinimaMin` e
`duracaoSugeridaMin` dentro dos limites globais, com mínima ≤ sugerida (422);
duração do vínculo pelo `validarDuracao`, que já existe.

---

## 7. A tela

`/painel/servicos`, com duas partes:

- **catálogo** (só o dono edita): nome, duração mínima e sugerida, e o
  interruptor de ativo. Cada linha mostra quantos barbeiros fazem aquilo — zero
  é o aviso de que o serviço existe mas ninguém oferece;
- **o que eu faço**: a lista com marca e a duração ao lado. Para o dono, o
  seletor de barbeiro, igual ao de horários.

A frase da barbearia fica num campo no fim, visível só para o dono.

---

## 8. Testes

`tests/servicos-painel.test.ts`:

- barbeiro não cria nem edita serviço (403); dono sim
- nome repetido é 409; nome repetido de serviço **desativado** também
- mínima maior que sugerida é 422
- marcar serviço cria o vínculo com a `duracaoSugeridaMin`
- desmarcar deixa `ativo = false` e **preserva** a duração; remarcar devolve o
  número praticado, não o sugerido
- duração abaixo da mínima do serviço é 422, com a mensagem do `validarDuracao`
- barbeiro marca o próprio vínculo; o do colega é 404
- desativar serviço tira ele da rota pública e some da contagem da equipe
- **o fecho da Etapa 3**: barbeiro novo, sem nada, ganha expediente (fatia B) e
  serviço (fatia C) e **passa a aparecer** em `GET /api/barbeiros` — o aviso da
  tela de equipe deixa de existir para ele

---

## 9. Fora do escopo

- **Preço.** `Servico` continua sem valor, como decidido na Etapa 2. Nada nas
  telas mostra dinheiro, e a coluna é aditiva quando alguém pedir.
- **Ordem por arrastar.** `ordem` é editável como número; arrastar é biblioteca
  nova para um problema de quatro linhas.
- **Foto do serviço.** Não existe armazenamento de arquivo no projeto.
- **Serviço só para alguns dias.** "Barba só às sextas" seria um terceiro
  cruzamento (barbeiro × serviço × dia) e não apareceu como necessidade real.
