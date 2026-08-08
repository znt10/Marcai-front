# BRUTUS — Expediente e bloqueios · Design

**Etapa 3, fatia B.** Depende dos designs da Etapa 1, do painel e da equipe.

---

## 1. O problema

A fatia A deixou o dono cadastrar a equipe, e a lista avisa em destaque: quem
entra agora fica **sem expediente**, logo com agenda vazia, logo invisível para
o cliente. Hoje só o `npm run seed` escreve `HorarioTrabalho`, e **nada no
sistema escreve `Bloqueio`** — a tabela existe desde a Etapa 1 sem um único
`INSERT` fora do seed.

Enquanto isso, o barbeiro não tem como fechar a tarde de sexta, marcar a folga
da semana que vem ou avisar que quebrou o braço. O único jeito é não existir
para o cliente naquele dia — que é o oposto do que uma agenda serve.

---

## 2. O risco desta fatia, e por que ele é menor do que parecia

Era a fatia adiada por mexer no motor de horários (§6 do cliente), o código mais
delicado do sistema. Olhando de perto: **o motor já faz tudo isso.**
`slotsLivres` lê `expediente` e `bloqueios`, trata `repeteSemanalmente` e
pontual, e devolve o que sobra (`src/lib/slots.ts:40`).

Então esta fatia **não altera `slots.ts`**. Ela escreve nas duas tabelas que o
motor já lê. O risco real não é o cálculo — é a escrita produzir estado que o
motor interpreta de um jeito que ninguém previu, e é para isso que os testes
desta fatia atravessam a fronteira: mexem no expediente e conferem o efeito em
`slotsDoDia`, não só a linha no banco.

---

## 3. Quem edita

**Dono edita de todos; barbeiro edita o seu.** É o `filtroDoBarbeiro` que já
existe, sem conceito novo de autorização — o barbeiro marca a própria folga sem
depender de ninguém, e o dono ajusta a casa inteira.

Diferente da fatia A, que é `ehDono` puro: lá se decide **quem é da equipe**,
que é decisão da casa; aqui se decide **quando cada um trabalha**, que começa
na pessoa.

Mexer no expediente de um colega responde **404**, não 403 — é registro alheio,
e vale a regra do painel: o status não pode confirmar que aquele registro
existe.

---

## 4. A jornada é um intervalo por dia

`HorarioTrabalho` tem `@@unique([barbeiroId, diaSemana])`: **um intervalo por
dia da semana**. Jornada partida (9h–12h, 14h–20h) se expressa como expediente
9h–20h mais um **bloqueio semanal** de 12h–13h — que é exatamente como o seed já
monta o almoço e como o motor já calcula.

Foi decidido não tirar o `unique`. Duas formas de expressar a mesma pausa
(faixa versus bloqueio) sairiam caro em migração e em confusão: o dono
perguntaria qual usar, e as duas produziriam grades diferentes por motivo
nenhum.

**Fechar um dia é apagar a linha.** Sem `HorarioTrabalho` naquele `diaSemana`,
`slotsLivres` devolve vazio na primeira linha (`if (!jornada) return []`) — a
representação de "não trabalho neste dia" já existe e é a ausência.

---

## 5. Conflito: deixa passar e mostra

Encurtar o expediente ou marcar folga por cima de horário já vendido **é
permitido**, e a tela lista os agendamentos que ficaram fora.

É deliberadamente **diferente** da recusa ao desativar barbeiro (fatia A §5), e
a diferença é a urgência: desativar alguém é decisão administrativa que espera
até amanhã; fechar a agenda é o que se faz **agora**, com o braço quebrado. Uma
recusa aqui deixaria o cliente batendo numa porta fechada — o pior resultado
possível, e o mesmo que a fatia A evitou recusando.

Então o sistema não decide por ninguém: aplica a mudança e diz o que ficou
pendurado, com o caminho para cancelar cada um. Cancelar continua avisando o
cliente pelo WhatsApp, pela rota que já existe.

**Conflito é o agendamento `CONFIRMADO` futuro que não cabe mais**: fora da
jornada do seu dia da semana, ou colidindo com um bloqueio. O cálculo
reaproveita `colide()` e a mesma leitura do motor, para não haver duas
definições de "cabe" no sistema.

---

## 6. Rotas

| Rota | O quê |
|---|---|
| `GET /api/painel/expediente?barbeiroId=` | Os sete dias e os bloqueios daquele barbeiro |
| `PUT /api/painel/expediente` | Define a jornada de um dia |
| `DELETE /api/painel/expediente?barbeiroId=&diaSemana=` | Fecha o dia |
| `POST /api/painel/bloqueios` | Cria bloqueio semanal ou pontual |
| `DELETE /api/painel/bloqueios/[id]` | Remove |
| `GET /api/painel/conflitos?barbeiroId=` | Agendamentos futuros que não cabem mais |

Todas sob `/api/painel/*`, atrás da sessão do proxy, e todas passando por
`filtroDoBarbeiro`. `barbeiroId` ausente significa "eu".

### Validação

- `diaSemana` 0–6; `minutosInicio` e `minutosFim` em 0–1440, com início < fim
  (422 em qualquer violação);
- bloqueio **semanal** exige `diaSemana`, `minutosInicio`, `minutosFim`;
  **pontual** exige `inicio` e `fim`, com `fim > inicio`. Mandar os dois
  conjuntos é 422 — o motor lê um ou o outro, e aceitar ambos criaria uma linha
  cuja interpretação depende de qual campo alguém leu primeiro.
- `motivo` é o enum que já existe (`ALMOCO`, `FOLGA`, `PESSOAL`, `OUTRO`).

Bloqueio pontual **no passado** é aceito: serve para registrar o que já
aconteceu, e não afeta slot nenhum porque o motor só oferece futuro.

---

## 7. A tela

`/painel/horarios`: os sete dias com início e fim (ou "fechado"), e a lista de
bloqueios embaixo, separados em "toda semana" e "uma vez". Para o dono, o
seletor de barbeiro — o mesmo padrão da agenda.

O aviso de conflito aparece **depois** de salvar, listando cada agendamento
pendurado com hora, cliente e o botão de cancelar, que chama a rota de
cancelamento que já existe.

Quando o barbeiro passa a ter expediente e serviço, o aviso "não aparece para o
cliente" da tela de equipe some sozinho — as duas telas leem os mesmos números.

---

## 8. Testes

`tests/expediente.test.ts`, atravessando a fronteira até o motor:

- barbeiro define o próprio expediente; do colega é 404
- dono define o de qualquer um
- definir jornada faz `slotsDoDia` passar a oferecer horário naquele dia
- fechar o dia (DELETE) faz `slotsDoDia` devolver vazio
- bloqueio semanal tira os slots daquela faixa, e só naquele dia da semana
- bloqueio pontual tira os slots do dia, e não afeta a mesma hora na semana
  seguinte
- `fim <= inicio` é 422, nos dois formatos
- mandar os dois formatos juntos é 422
- `GET /conflitos` lista o agendamento que ficou fora do expediente encurtado
- `GET /conflitos` lista o que caiu dentro de bloqueio novo
- conflito **não** inclui agendamento passado nem cancelado

---

## 9. Fora do escopo

- **Serviços e durações** (fatia C). Sem serviço vinculado, o barbeiro continua
  invisível mesmo com expediente cheio — a tela de equipe segue avisando.
- **Cancelar em lote os conflitos.** A lista mostra e leva ao cancelamento de
  cada um; cancelar sete de uma vez é botão que ninguém pode desfazer.
- **Feriado da barbearia.** Bloqueio é por barbeiro; um feriado é um bloqueio
  para cada um. Se virar rotina, vira `Bloqueio` com `barbeiroId` nulo — coluna
  nulável, aditiva.
- **Expediente com data de início e fim** ("a partir de agosto trabalho sábado").
  A jornada é o estado atual, e o histórico dela não é lido por nada.
- **Jornada partida como faixas** (§4).
