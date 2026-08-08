# BRUTUS — Etapa 5, fatia A: o lembrete que sai de verdade

## 1. A promessa que o produto não cumpre

A tela de confirmado diz, para todo cliente que marca:

> **Mandamos o lembrete no WhatsApp 1h antes.**

A rota que faz isso existe (`POST /api/cron/lembretes`), está protegida por
`CRON_SECRET`, marca antes de enviar para não duplicar, e **nunca roda**. Nada
no projeto a chama: nem serviço, nem agendador, nem teste.

Duas consequências, e a segunda é pior que a primeira:

1. O cliente não recebe o lembrete.
2. **A rota nunca foi executada nem uma vez.** Zero teste, zero chamada. É
   código que ninguém sabe se funciona, com a única evidência a favor sendo que
   ele compila.

Esta fatia fecha as duas.

---

## 2. O agendador

Um serviço no `docker-compose.yml` que bate na rota em intervalo fixo. Nada de
biblioteca de cron dentro do processo do Next: o agendador precisa sobreviver a
reinício da aplicação e ser observável de fora — `docker compose logs
agendador` responde "está rodando?" sem instrumentar nada.

### A cadência: 10 minutos

A janela do lembrete é de 60 min (`LEMBRETE_ANTECEDENCIA_MIN`). Com tique de 10
minutos, a mensagem sai entre **50 e 60 minutos antes** do horário — dentro do
que a tela promete, com um sexto da carga de um tique de 1 minuto.

Tique maior que 60 min perderia agendamento: quem entra na janela entre dois
tiques nunca é visto. **A cadência não pode passar da janela** — é a única
restrição real aqui, e por isso as duas constantes ficam lado a lado.

### O segredo

`CRON_SECRET` vazio **nega tudo** — a rota já faz isso, e é a decisão certa:
sem segredo configurado ela fica fechada em vez de virar um disparador público
de mensagens. O agendador leva o mesmo segredo pelo `Authorization`.

Consequência prática, que vai para o README: **sem `CRON_SECRET` no `.env`, o
agendador sobe e toma 401 a cada tique.** É barulhento de propósito — falha em
silêncio aqui é lembrete que nunca chega e ninguém descobre.

---

## 3. O defeito que só aparece quando o agendador existe

Marcar um horário **dentro** da janela de lembrete manda duas mensagens em
poucos minutos:

```
15:05  cliente marca para as 15:40
15:05  "Fechou, Marcos! Seu corte está marcado para hoje às 15:40…"
15:10  (tique)
15:10  "Lembrete: corte hoje às 15:40 com Téo. Rua Aurora, 88"
```

Não é hipótese: **o painel marca a 30 minutos por padrão**
(`PAINEL_ANTECEDENCIA_PADRAO_MIN`), então o barbeiro que encaixa alguém no
balcão produz isso toda vez. E o cliente que acabou de marcar pelo celular
recebe um "lembrete" do que ele fez cinco minutos atrás.

**A correção é de conceito, não de filtro:** quando o horário já está dentro da
janela, **a confirmação É o lembrete**. Então o agendamento nasce com
`lembreteEnviadoEm` preenchido, e o cron nunca o vê.

Escrever isso como "ignora agendamento criado há menos de X" seria um segundo
número arbitrário perseguindo o primeiro. `lembreteEnviadoEm` já é exatamente o
campo que quer dizer "esta pessoa já foi avisada" — e a confirmação avisou.

Vale nos dois caminhos de criação (público e painel), e por isso mora em
`lib/`, não repetido nas duas rotas.

---

## 4. O que os testes têm que provar

Da rota, que hoje não tem nenhum:

- sem `CRON_SECRET` no ambiente → **401**, mesmo com `Authorization` certo
- segredo errado → 401
- agendamento daqui a 30 min → recebe, e `lembreteEnviadoEm` fica marcado
- daqui a 3 h → não recebe
- que já começou → não recebe (lembrar depois da hora é pior que não lembrar)
- `CANCELADO` → não recebe
- já marcado como enviado → **não reenvia**: rodar o cron duas vezes seguidas
  manda uma mensagem só
- duas barbearias com pendência → as duas são atendidas na mesma passada, e
  cada mensagem vai com o endereço da sua
- barbearia desativada → não recebe

Da correção:

- marcado para daqui a 30 min **nasce** com `lembreteEnviadoEm` → o cron
  seguinte não manda nada
- marcado para daqui a 3 h nasce com `null`
- vale igual pelo painel e pelo público

---

## 5. Fora do escopo

- **Instância da Evolution API no compose.** Sem `EVOLUTION_API_URL` o envio
  cai no `console.info`, que é o que torna esta fatia verificável sem depender
  de um número de WhatsApp de verdade. A instância é a próxima fatia.
- **Reenvio de lembrete que falhou.** `lembreteEnviadoEm` é marcado antes do
  envio de propósito — perder um lembrete é melhor que mandar dois. Fila com
  repetição é outra conversa.
- **Lembrete configurável por barbearia.** Uma constante, até alguém pedir.
- **Trava do admin em memória.** O comentário dela já argumenta por que ficar
  em memória vale enquanto o deploy é de instância única. Vira tabela quando
  virar multi-instância, não antes.
