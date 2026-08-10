# BRUTUS — Etapa 5, fatia B: a Evolution no ar

## 1. Por que esta é a peça que falta

Todo contato do sistema com gente de fora é WhatsApp: confirmação de
agendamento, cancelamento, lembrete e convite de barbeiro. O cliente do
Evolution (`src/lib/whatsapp.ts`) está escrito e testado desde a Etapa 1, com o
comportamento certo nas duas pontas — envio é fire-and-forget e nunca derruba um
agendamento; verificação de número falha aberta.

E sem `EVOLUTION_API_URL` **tudo isso cai no `console.info`**:

```
[whatsapp] sem EVOLUTION_API_URL: 11977771234 Lembrete: corte hoje às 08:57…
```

O produto funciona inteiro e não fala com ninguém. Esta fatia liga o telefone.

---

## 2. A instância

Terceiro serviço no `docker-compose.yml`, imagem `evoapicloud/evolution-api`
**pinada em `v2.3.7`** — `latest` num serviço que guarda sessão de WhatsApp é
convite para uma atualização quebrar a conexão numa terça-feira à tarde.

### O volume é a parte que importa

```
evolution_instances:/evolution/instances
```

É onde mora a credencial da sessão do WhatsApp — a que o QR gera. Sem volume,
**todo `docker compose down` obriga a escanear o QR de novo**, e em produção
isso é o telefone da barbearia caindo a cada deploy.

### Sem Redis

A referência do projeto sobe Redis. Aqui: `CACHE_REDIS_ENABLED=false` e
`CACHE_LOCAL_ENABLED=true`. Um quarto serviço para cachear o que uma instância
única já resolve em memória é peso sem retorno — e a Evolution oferece o cache
local exatamente para esse caso.

### O banco: o nosso, com o histórico desligado

A Evolution exige Postgres. Em vez de subir um segundo, ela recebe **papel e
banco próprios no Postgres que já existe** (`evolution` / `evolution`), criados
no `docker/init-db.sql` junto dos outros três papéis.

E, decisão que vale mais que a economia de um contêiner: **todos os
`DATABASE_SAVE_DATA_*` de conversa ficam `false`**. Só
`DATABASE_SAVE_DATA_INSTANCE` fica ligado, porque é o que persiste a instância.

Nós **mandamos** mensagem e **consultamos** se um número existe. Nunca lemos
conversa. Com os flags ligados, o banco guardaria mensagens, contatos, chats e
histórico de todo cliente de toda barbearia — um acervo de conversa alheia que o
produto não usa para nada, dentro do mesmo Postgres que o RLS protege. Desligar
é menos dado, menos disco e menos superfície.

### O nome da instância

`EVOLUTION_INSTANCE` é **um** para a plataforma inteira: um número de WhatsApp
manda por todas as barbearias, e quem identifica a casa é o texto da mensagem
(que já leva nome e endereço). Número por barbearia seria uma coluna em
`Barbearia` mais uma instância por tenant — aditivo, e fica para quando alguém
pedir.

---

## 3. Uma chave, dois consumidores

`EVOLUTION_API_KEY` no `.env` alimenta **dois** lugares:

| onde | variável | papel |
|---|---|---|
| serviço `evolution` | `AUTHENTICATION_API_KEY` | a chave que ele exige |
| serviço `app` | `EVOLUTION_API_KEY` | a chave que ele manda |

São a mesma chave com nomes diferentes, e é o tipo de coisa que se descobre
errada só quando a mensagem não chega — o envio é fire-and-forget, então chave
errada é **401 silencioso**, não erro na tela. Por isso as duas saem de uma
variável só, no compose, e não de dois lugares que alguém precisa lembrar de
manter iguais.

### `EVOLUTION_API_URL` sai do `.env` e vai para o compose

O endereço da Evolution é `http://evolution:8080` — nome de serviço, resolvível
só **dentro** da rede do compose. No `.env` ele seria um valor que não funciona
para nada rodado do host, ao lado de `DATABASE_URL_HOST`, que existe justamente
porque host e contêiner veem endereços diferentes. Então ele mora no compose,
como as `DATABASE_URL_*` do serviço.

---

## 4. O teste: variável lida e não documentada

Um caso estrutural, no espírito do `varredura estrutural` do RLS: **toda
`process.env.X` lida em `src/` tem que estar no `.env.example` ou no
`docker-compose.yml`**.

Não é burocracia. Esta fatia acrescenta quatro variáveis, e o modo de falha de
uma variável esquecida é o pior possível: o código lê `undefined`, o `if (!url)`
desvia para o caminho silencioso, e o sintoma é **mensagem que não chega**, sem
erro em log nenhum, sem teste vermelho, sem `tsc` reclamando. Foi exatamente o
que aconteceu com o `CRON_SECRET` vazio na fatia anterior.

---

## 5. O que só o dono pode fazer

Conectar o número **exige uma pessoa com o celular na mão**: criar a instância,
abrir o QR e escanear no WhatsApp do aparelho. Não é automatizável e não deve
ser — é o pareamento de um telefone real.

O README ganha o passo a passo, e o `npm run whatsapp:qr` imprime o QR no
terminal para não precisar de painel nenhum.

---

## 6. Riscos assumidos

**Número não oficial pode ser banido pela Meta.** É o risco de fundo de toda
integração por Evolution, já registrado no §15 da Etapa 1. As mitigações que já
existem continuam valendo: cache de 24 h na verificação de número, limite por
IP, e nada disparado a cada tecla.

**Uma instância é um ponto único.** Número fora do ar = nenhuma mensagem para
nenhuma barbearia. Aceito na mesma medida em que "um Postgres" foi aceito, e com
a mesma saída: o envio já falha aberto, então agendamento continua funcionando
sem WhatsApp — o cliente só não recebe o aviso.

**A sessão do WhatsApp vive num volume.** `docker volume rm` derruba o
pareamento. É o preço de não guardar credencial de sessão em banco.

---

## 7. Fora do escopo

- **Número por barbearia.** Coluna mais instância por tenant; aditivo.
- **Webhook de entrada.** O produto só manda. Cliente respondendo "quero
  cancelar" no zap é outra conversa, com outra superfície de segurança.
- **A imagem separada do Evolution Manager.** Não é necessária: a própria API
  serve o painel em `/manager` (a resposta da raiz o anuncia). A imagem
  `evolution-manager` publicaria na porta 3000, que é a da aplicação — e não
  compraria nada.
- **Hospedagem.** Compose de produção, wildcard DNS e HTTPS são a fatia C.
