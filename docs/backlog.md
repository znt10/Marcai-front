# Backlog

Ideias e dívidas registradas, com o motivo. Nada aqui está em construção — o que
entra numa etapa ganha spec em `docs/superpowers/specs/`.

---

## Separar em back Django e front Next

**Decidido em 10/08/2026**, para começar em 10 ou 11/08. É a mudança de maior
alcance da lista e por isso está no topo: ela reposiciona tudo o que vem depois.

Hoje é Next full-stack — route handlers em `src/app/api/**`, Prisma 7 com driver
adapter, e o isolamento entre barbearias por Row Level Security dirigido por
`comBarbearia()`.

O que precisa de decisão **antes** de escrever código, em ordem de risco:

**O isolamento de tenant.** `set_config('app.barbearia_id', …, true)` dentro de
transação é a fronteira mais forte que este sistema tem, e ela vale exatamente
enquanto *toda* consulta passar por lá. Em Django isso é middleware mais um
wrapper de conexão — reconstruído, não traduzido. O teste `varredura estrutural`
existe justo para isso e precisa de equivalente do outro lado.

**O motor de horários** (`src/lib/slots.ts`) é função pura, sem banco. É o que
porta mais fácil e o que menos pode divergir: é o núcleo do produto.

**A restrição de exclusão** (`23P01`) é do banco, não do código — sobrevive à
troca de graça, e continua sendo a única garantia real contra agendamento duplo.

**Os 360 testes não portam.** Eles chamam os handlers diretamente, sem
atravessar HTTP. Isso foi bom (rápidos, sem servidor) e é o preço agora: cada um
precisa de par do lado Django.

**Os serviços de infraestrutura ficam.** Evolution, `agendador` e `zelador` são
contêineres do compose e não sabem quem os chama — muda o endereço, não eles.

**O `proxy.ts` sai de cena.** Ele resolve tenant por subdomínio e protege
`/admin` e `/api/painel/*` **posicionalmente** — rota nova sob aquele prefixo
nasce protegida sem ninguém decidir. Essa propriedade é fácil de perder na
migração, e perdê-la é silencioso.

Referência de estilo que ele já pediu para eu seguir: o front do Unistock, em
`D:\Estagio\sigevi-front` — foi de lá que saiu a camada de API centralizada
(`src/lib/api/`) que hoje impede URL solta em componente.

## PWA do painel (só do dono e da equipe)

**Pedido em 10/08/2026.** Um app instalável para quem trabalha na barbearia
abrir no celular e já ter o que é dele à mão, em vez de procurar toda vez.

**Escopo: `/painel` e `/admin`. NÃO o fluxo do cliente.** A tela pública é
visitada uma vez por corte, por gente que não vai instalar app de barbearia —
manifest ali é peso sem retorno. O painel é o contrário: aberto todo dia, várias
vezes, pela mesma pessoa.

O que a decisão precisa responder antes de virar etapa:

- **Offline serve para quê?** Agenda do dia em cache tem valor real (o barbeiro
  consulta com a mão ocupada e o sinal ruim). Mas agenda em cache é agenda
  desatualizada, e "achei que o horário estava livre" é pior que "não carregou".
  Provavelmente: ler em cache com marca visível de "visto às HH:MM", e **nunca**
  deixar marcar offline.
- **Notificação push entra?** É o que o dono realmente quer de um app —
  e se cruza com o item abaixo, que resolve o mesmo problema pelo WhatsApp e
  sem app nenhum. Fazer os dois é mandar aviso em dobro.
- **Uma instalação por barbearia ou uma do produto?** Cada barbearia tem
  subdomínio próprio, então cada uma vira um PWA distinto no aparelho — com
  ícone e nome próprios, o que provavelmente é o desejado, mas significa
  manifest gerado por tenant.

Não inclui chave PIX nem dados de pagamento: o pedido original mencionava, e foi
retirado na mesma conversa.

---

## Avisar o barbeiro quando marcam ou cancelam com ele

**Buraco encontrado em 10/08/2026.** Hoje o barbeiro **não recebe mensagem
nenhuma** sobre a própria agenda. Conferido envio por envio: confirmação,
cancelamento (pelo cliente e pela barbearia) e lembrete vão todos para o
**cliente**. O `whatsapp` do barbeiro serve para duas coisas — é o login dele e
é para onde vai o link de convite.

O cliente recebe três tipos de mensagem. O barbeiro, zero. Ele descobre que tem
gente nova abrindo o painel.

O caso que mais dói é o **cancelamento**: o cliente desmarca às 14h e o barbeiro
só percebe às 15h, olhando a tela, com um buraco na agenda que daria para vender.

Decisões de produto pendentes:

- marcação pelo cliente avisa só o barbeiro escolhido, ou o dono também? Dono de
  equipe de cinco receberia mensagem toda hora.
- **encaixe do balcão não deve avisar**: quando o próprio barbeiro marca na mão,
  mandar mensagem para ele mesmo é ruído. É a mesma regra do lembrete que já é
  calado para quem acabou de marcar (`src/lib/lembrete.ts`).

A infraestrutura toda já existe: `enviarTexto`, `src/lib/mensagens.ts` e o padrão
fire-and-forget. É fatia pequena depois das respostas acima.

---

## Ninguém percebe quando o WhatsApp cai

**Aconteceu em 10/08/2026, e passou horas sem ninguém ver.** O contêiner da
Evolution reiniciou, gravou a sessão como `close` e **não reconectou sozinho**:

```
Skipping auto-connect for instance "brutus" (status: close)
TypeError: Cannot read properties of undefined (reading 'sendMessage')
```

Duas barbearias foram cadastradas nesse intervalo e os convites dos donos
**tentaram sair e falharam**. Nada na tela do admin mudou: o link apareceu
normalmente, a barbearia foi criada, e a mensagem simplesmente não existiu.

O envio é fire-and-forget por decisão certa — falha de WhatsApp não pode desfazer
um agendamento. O problema é que fire-and-forget virou *fire-and-forget-and-shut-up*:

- **Corrigido em 10/08:** `enviarTexto` não conferia `r.ok`, então resposta
  recusada não gerava nem uma linha de log. Agora gera, com status e motivo.
- **Ainda aberto:** nada *monitora* a conexão. `npm run whatsapp:estado` existe
  e ninguém o roda sozinho. Em produção, o número pode ficar dias desconectado e
  o sintoma é clientes silenciosamente deixando de receber confirmação.

Duas saídas, e provavelmente as duas:

- **healthcheck no agendador.** Ele já bate na aplicação a cada 10 minutos;
  conferir `connectionState` no mesmo tique é quase de graça, e um log alto
  ("WHATSAPP DESCONECTADO") aparece em `docker compose logs`.
- **aviso na tela do admin.** Um selo vermelho na lista de barbearias quando a
  instância não está `open`. É onde a pessoa que pode agir está olhando.

O que **não** resolve: reconectar automaticamente. Reconexão exige o QR, que
exige uma pessoa com o celular. O sistema pode avisar, não consertar.

## A senha do seed não passa pela regra do próprio produto

**Encontrado em 10/08/2026.** `SENHA_MINIMA` é **8** (`src/lib/config.ts`), e o
seed grava `123456`, que tem **6**. A senha documentada no README nunca poderia
ser criada pela tela de convite nem pelo `npm run barbeiro:senha`.

Não quebra nada — o seed escreve o hash direto, sem passar pelo validador. Mas é
uma regra que o projeto afirma e desobedece no próprio fixture, e o sintoma
aparece exatamente quando alguém tenta restaurar o estado do seed pela
ferramenta oficial e é recusado.

Duas saídas, e a escolha é de quem usa isso todo dia: subir o fixture para 8+
caracteres (e mexer no README) ou aceitar explicitamente que o seed é fixture e
não passa pelas regras de entrada.

---

## Reemitir convite apaga a senha, e a tela não avisa

**Encontrado em 10/08/2026, na prática.** Reemitir convite **é** o reset de
senha: `senhaHash` volta a nulo. Está documentado no README — e a interface não
diz nada. Dois donos (Téo e Tony) ficaram sem acesso ao painel exatamente assim,
e o sintoma na tela é "celular ou senha inválidos", que aponta para o lugar
errado.

O botão diz "novo convite" e "reemitir convite". Nenhum dos dois sugere "isto vai
tirar a senha atual dessa pessoa".

Duas correções pequenas, independentes:

- **texto e confirmação** no botão: dizer que a senha atual será apagada.
- **mensagem de login mais honesta** para quem tem `senhaHash` nulo. Hoje cai no
  genérico "celular ou senha inválidos" — que é a resposta certa para não
  revelar quais números existem, então isto exige cuidado: contar que a conta
  existe mas está sem senha vaza informação. Talvez só depois de acertar o
  celular *e* o convite estar pendente.

A saída de emergência já existe: `npm run barbeiro:senha`. Ela precisa existir
porque o token do convite só é guardado em **hash** — perdido o link, nenhuma
tela pode resolver sem virar ela mesma um jeito de entrar sem credencial.
