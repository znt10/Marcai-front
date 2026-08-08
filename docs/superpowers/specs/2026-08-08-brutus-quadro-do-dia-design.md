# BRUTUS — Quadro do dia (tela 1h)

**Etapa 3, última peça.** A tabela §14 do design da Etapa 1 atribuiu três coisas
a esta etapa: equipe (3e), cadastro de barbeiro (3d) e **dashboard desktop
(1h)**. As duas primeiras saíram nas fatias A, B e C. Esta é a terceira.

---

## 1. A pergunta que a tela existente não responde

O painel de hoje responde *"o que **eu** tenho hoje"* — uma coluna, ordenada por
hora, o dia do barbeiro logado.

No balcão, com um cliente parado na frente, a pergunta do dono é outra:

> **quem pega esse cara agora?**

Responder isso com a tela atual é trocar o barbeiro no seletor, ler a lista de
cima a baixo procurando buraco, voltar, repetir para o próximo. Com três
barbeiros já é ruim; é o tipo de coisa que faz o dono largar o sistema e voltar
para o caderno, porque o caderno mostra a equipe inteira numa página aberta.

O quadro do dia é a equipe inteira numa página aberta.

---

## 2. A tela

Uma **coluna por barbeiro**, lado a lado. Cada coluna:

```
┌────────────────────┐
│ Téo · dono         │
│ 9h–20h · 62% cheio │
│ próximo livre      │
│ ▸ 16:00            │
│   (cabe pezinho)   │
├────────────────────┤
│ 09:00 João         │
│       Corte        │
│ 12:00 ▨ almoço     │
│ 14:30 Marcos       │
│       Corte+Barba  │
└────────────────────┘
```

O cabeçalho é o que se lê de longe: **jornada, quão cheio, e o próximo buraco**.
A lista embaixo é a conferência.

**Bloqueio entra na mesma lista dos agendamentos**, ordenado por hora, com marca
própria. Separar em duas listas obrigaria o olho a intercalar sozinho — e a
única razão de olhar o quadro é ver a sequência real do dia.

---

## 3. Por que uma rota nova, e não três chamadas

Montando isso com o que já existe, a tela precisaria de:

| chamada | para quê | problema |
|---|---|---|
| `GET /painel/agenda?dia=` | os agendamentos de todos | ok |
| `GET /painel/equipe` | a lista de barbeiros | **403 para barbeiro** |
| `GET /painel/expediente?barbeiroId=` | a jornada de cada um | **uma por barbeiro** |
| `GET /painel/bloqueios` (não existe em leitura) | as faixas | — |

Três defeitos, em ordem de gravidade:

1. A tela **quebraria para o barbeiro**, porque `/painel/equipe` é do dono. Uma
   tela que só monta para metade dos usuários é uma tela que vai quebrar em
   produção no dia em que alguém mandar o link no grupo.
2. N+1 no navegador: cinco barbeiros, seis requisições.
3. O "próximo horário livre" é **cálculo do motor de slots**, que mora no
   servidor e depende de expediente + bloqueios + agendamentos + duração
   praticada. Reproduzir isso no cliente seria uma segunda implementação do
   núcleo do sistema, condenada a divergir da primeira.

Então: **`GET /api/painel/dia?dia=YYYY-MM-DD`**, uma consulta, o quadro pronto.

---

## 4. Contrato

```
GET /api/painel/dia?dia=2026-08-08
→ 200 {
    dia: '2026-08-08',
    colunas: [{
      barbeiroId, barbeiroNome, papel, ativo,
      // null nos dois = dia fechado (não há jornada nesse dia da semana)
      abre: 540, fecha: 1200,
      ocupacaoPct: 62,          // null quando o dia é fechado
      proximoLivre: '2026-08-08T19:00:00.000Z',   // null quando não cabe nada
      servicoMaisCurto: 'Pezinho',                     // o serviço que justifica o horário
      itens: [
        { tipo: 'AGENDAMENTO', id, inicio, fim, servicoNome,
          clienteNome, clienteWhatsapp },
        { tipo: 'BLOQUEIO', id, inicio, fim, motivo, observacao },
      ],
    }],
  }
```

`inicio`/`fim` são instantes ISO em UTC, como em toda rota do projeto — quem
formata no fuso da barbearia é a tela, com os utilitários de `datas.ts`.

**O bloqueio semanal vira instante do dia pedido.** A tela recebe `12:00–13:00
de 08/08`, não `minutosInicio: 720, repeteSemanalmente: true`. Traduzir formato
de recorrência é trabalho do servidor: é o mesmo que `slots.ts` já faz, e
deixar isso para o componente é convidar a terceira implementação da regra.

### Quem vê o quê

`filtroDoBarbeiro` de novo, como em toda rota do painel: **dono recebe todas as
colunas, barbeiro recebe uma — a dele.** Não é a tela negada ao barbeiro; é a
mesma tela com uma coluna, e ela continua valendo: `próximo livre` e `% cheio`
não existem em lugar nenhum do painel atual.

Por isso **o link aparece para os dois papéis**. É a primeira tela do painel de
que isso vale — equipe, catálogo e frase são do dono por natureza; "quando eu
tenho buraco" não é.

### Quais colunas existem

Barbeiro **ativo**, ou **inativo com agendamento naquele dia**.

A segunda metade não é enfeite: desativar exige agenda futura vazia, mas o
passado continua lá. Sem essa condição, abrir o quadro de ontem depois que
alguém saiu da equipe mostraria um dia com menos clientes do que realmente
teve — um relatório que mente por omissão.

---

## 5. Os dois números do cabeçalho

### `ocupacaoPct`

```
minutos agendados ÷ (minutos de jornada − minutos bloqueados)
```

O almoço sai do **denominador**, não entra como ocupação. Com o almoço no
denominador, um dia genuinamente lotado marcaria 88% e o dono nunca veria 100%
— o número perderia a única leitura que interessa, que é *"não cabe mais
ninguém"*.

Dia fechado → `null`, e a tela escreve "fechado". Zero por cento e fechado são
estados diferentes: um é ruim, o outro é sábado à noite.

### `proximoLivre` e `servicoMaisCurto`

Sai de `slotsLivres` — o motor, o mesmo que atende o cliente na home. A duração
que entra é **a menor que aquele barbeiro pratica**, e o nome desse serviço
volta em `servicoMaisCurto`.

A menor é a resposta certa para *"cabe alguma coisa?"*, que é a pergunta do
balcão. Mas ela é otimista por construção — 16:00 pode aceitar só um pezinho de
15 min — então o horário nunca aparece sozinho na tela: vem com o serviço que o
justifica. Prometer "16:00 livre" e o corte de 40 min não caber seria pior que
não mostrar nada.

`servicoMaisCurto` vem **mesmo quando não há horário livre**, e é isso que
separa dois estados que a tela precisa distinguir porque pedem ações opostas:

| `servicoMaisCurto` | `proximoLivre` | o que a tela diz | o que o dono faz |
|---|---|---|---|
| `'Pezinho'` | `19:00` | próximo livre 19:00 (pezinho) | encaixa o cliente |
| `'Pezinho'` | `null` | sem buraco | manda para outro barbeiro |
| `null` | `null` | sem serviço marcado | **abre a tela de serviços** |

O terceiro é o mesmo defeito que a tela de equipe já denuncia ("não aparece
para o cliente"), aparecendo de novo onde ele atrapalha. Um campo só, com o
nome errado (`cabeNoLivre`, que só existia junto do horário), colapsaria as
duas últimas linhas — e a diferença entre "está cheio" e "está quebrado" é
exatamente o que o dono precisa ler.

**Num dia passado, `proximoLivre` é sempre `null`** — e isso cai de graça do
`agora` que o motor já recebe. Não existe buraco ontem.

---

## 6. O que os testes têm que provar

- dono recebe uma coluna por barbeiro ativo; barbeiro recebe exatamente uma
- barbeiro pedindo `?barbeiroId=` do colega recebe a **própria** coluna, não 404
  e não a do colega — o filtro da sessão vence a query, como na agenda
- dia sem jornada → `abre/fecha/ocupacaoPct` nulos e nenhum item
- bloqueio semanal do dia certo entra como item; do dia errado, não
- bloqueio pontual de outro dia não entra
- ocupação desconta o bloqueio do denominador (jornada 9h–13h, almoço 12h–13h,
  corte de 40 min → 40/180)
- `proximoLivre` pula o que já está ocupado e o que está bloqueado
- barbeiro sem `BarbeiroServico` ativo → `proximoLivre` nulo
- barbeiro inativo **com** agendamento no dia aparece; sem, não
- barbearia vizinha não vaza coluna nenhuma
- o quadro concorda com a home: o `proximoLivre` de um barbeiro é um horário que
  `slotsDoDia` também oferece ao cliente para aquele serviço

O último atravessa a fronteira de propósito. É o mesmo tipo de teste que fechou
a fatia B: se o quadro e o motor divergirem, o dono promete um horário que a
tela do cliente recusa — e isso acontece no balcão, na frente do cliente.

---

## 7. Fora do escopo

- **Arrastar agendamento de uma coluna para outra.** Transferir cliente entre
  barbeiros é operação com regra própria (cabe na agenda do destino? avisa o
  cliente?) e já estava fora na fatia C. O quadro só torna a falta mais visível.
- **A semana inteira.** Sete dias × N barbeiros não cabe em tela nenhuma sem
  virar outra coisa. O dia é a unidade de decisão do balcão.
- **Imprimir.** Vira pedido quando virar; `@media print` é aditivo.
- **Faixa proporcional ao tempo** (o agendamento das 9h ocupando o dobro da
  altura do das 10h por durar o dobro). É a versão bonita do quadro e depende do
  visual definitivo da Etapa 4 — a lista ordenada entrega a decisão hoje.
