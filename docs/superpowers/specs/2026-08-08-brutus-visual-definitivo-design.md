# BRUTUS — Etapa 4: visual definitivo

O wireframe cumpriu o papel dele: validar o fluxo antes de investir em
identidade. Agora ele sai.

**Escopo:** identidade única do produto, igual para todas as barbearias. Cor por
barbearia (white-label) seria coluna nova, tokens injetados em runtime e tela no
painel — fica fora, e é aditivo quando alguém pedir.

---

## 1. O que a Etapa 1 prometeu, e o quanto ela entregou

> *"Trocar o visual na Etapa 4 vira editar o bloco `@theme`, não caçar hex pelos
> componentes."* — design da Etapa 1, §2

Medindo antes de começar:

| | resultado |
|---|---|
| hex soltos em componentes | **3** (`#444` ×2, `#ccc` ×1) |
| classes de cor arbitrárias | **0** — as `text-[17px]` que aparecem são tamanho, não cor |
| telas que mudam de cor sem serem tocadas | **todas as 15** |

A promessa se sustenta para *cor*. Onde ela não se sustenta é numa suposição
mais funda: **o wireframe tem uma tinta só.** `--color-traco` era ao mesmo
tempo a borda de tudo, o preenchimento do botão e a cor do texto — no papel,
tudo é o mesmo lápis.

No escuro isso se parte em três coisas diferentes: a borda é um fio quente e
discreto, o texto é branco morno, o botão é âmbar. Um token não faz três
trabalhos opostos, então `traco` vira `borda`, `tinta` e `acento`.

**Isso é conserto de modelo, não de cor** — e é a única razão de os primitivos
`wf/` serem tocados. São oito arquivos pequenos, usados por todas as telas: o
sistema continua central, ele só passa a ter as juntas certas.

---

## 2. Paleta

Nogueira queimada em vez de preto neutro. Preto puro com um acento fluorescente
é o escuro que todo mundo faz; o marrom escuro é o de uma barbearia com luz
morna acesa, e é o que faz o âmbar parecer luz em vez de destaque.

| token | valor | papel |
|---|---|---|
| `--color-fundo` | `#14100e` | o chão, nogueira queimada |
| `--color-superficie` | `#1e1815` | cartão, um degrau acima do chão |
| `--color-borda` | `#34291f` | fio quente de 1px, quase invisível de propósito |
| `--color-tinta` | `#f2ebe1` | branco morno. Branco puro sobre `#14100e` é lâmina |
| `--color-acento` | `#c98a45` | latão. Botão primário, escolhido, erro |
| `--color-livre` | `#5c8a6d` | verde esmalte — **só** para "tem vaga" |

`--color-livre` é o único acréscimo funcional: a interface passa a ter dois
sinais em vez de um. No calendário, dia com vaga e dia lotado deixam de se
distinguir só pela opacidade — que é a diferença que some no sol, na tela do
celular, na calçada em frente à barbearia.

---

## 3. Tipografia — três faces, três trabalhos

| papel | face | onde |
|---|---|---|
| letreiro | **Big Shoulders** | títulos e botão primário. Caixa alta, tracking apertado |
| corpo | **Archivo** | nomes, textos, rótulos |
| dado | **Space Mono** | **horas, contagens, código** |

A terceira é a que justifica as outras duas. **Este app é sobre tempo:** a tela
do cliente é uma lista de horas, o quadro do dia é uma coluna de horas por
barbeiro. Fonte tabular alinha `09:00` com `14:30` na vertical — com fonte
proporcional, a coluna do quadro fica torta e o olho perde a varredura que é a
razão daquela tela existir.

Big Shoulders no lugar do Oswald de sempre: mesma família de letreiro
condensado, sem ser a que já está em todo lugar.

**A escala de títulos sai das páginas e vem para o `globals.css`.** Hoje cada
uma das dez telas repete `text-[17px] font-normal` no próprio `h1` — que é o
mesmo defeito que os tokens de cor resolveram, na tipografia. Depois disso,
mudar a voz dos títulos é uma regra, não dez edições.

---

## 4. O que sai

**A fonte manuscrita.** Era o rascunho declarando que era rascunho.

**A barra de status falsa** (`9:41 ▮▮▮`). Desenhava um celular que não existe;
já era decorativa e some em desktop. Numa identidade de verdade, fingir a
moldura de outro aparelho é o oposto de ter cara própria.

**O contorno tracejado, nos dois lugares onde ele mentia.** Tracejado quer
dizer "isto ainda não está pronto". Em catorze usos ele marca **campo vazio**,
e ali está literalmente certo — fica. Nos outros cinco marcava o **link de
convite** (que está pronto; ele só precisa ser selecionado inteiro → `copia`,
com a fonte de dado) e o **conflito de horário** (que está pronto e precisa de
decisão de gente → `alerta`, com fio de latão).

Contar os usos antes de apagar o primitivo é o que separou os três casos. A
leitura inicial — "tracejado é sobra de rascunho, sai tudo" — teria apagado o
único lugar onde ele diz a verdade.

**O que fica:** a sombra sólida sem blur, `2px 2px 0`. É o gesto mais
característico do wireframe e, no escuro, vira exatamente o que uma barbearia
tem na fachada — a **sombra de letreiro pintado**, agora em âmbar, no que está
escolhido e no botão que conclui. O rascunho não é apagado, é traduzido.

---

## 5. A assinatura: o cupom

A tela de confirmado é o pico da coisa toda — é o que o cliente printa e
guarda. Ela vira **um cupom**: a hora enorme em Space Mono, a serrilha do
destaque marcada com entalhe e picote, a sombra de letreiro embaixo.

É o artefato certo porque é o que a barbearia entrega de verdade: a senha da
vez. E é feito **só com conteúdo que já existe** — hora, serviço, barbeiro,
endereço.

O `codigo` continua **fora da tela**, como a Etapa 1 decidiu: ele é a
credencial de cancelamento e mora no link. Um cupom com número seria mais
bonito e mudaria a regra de produto por motivo estético — que é exatamente o
tipo de troca que não se faz numa etapa de visual.

---

## 6. Fora do escopo

- **Cor por barbearia.** Decidido acima.
- **Modo claro.** Uma identidade, não duas. `prefers-color-scheme` não entra:
  a barbearia escura *é* o produto, não uma preferência.
- **Foto de barbeiro e de serviço.** Não existe armazenamento de arquivo no
  projeto; o `Avatar` continua o círculo vazio.
- **Animação de entrada.** A tela é usada em rajadas de segundos, no balcão e
  no celular na rua. Movimento aqui atrapalha a tarefa.
