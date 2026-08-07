# BRUTUS — Equipe · Design

**Etapa 3, fatia A.** Depende dos designs da Etapa 1
(`2026-08-05-brutus-agendamento-cliente-design.md`), do admin
(`2026-08-06-brutus-admin-da-plataforma-design.md`) e do painel
(`2026-08-07-brutus-painel-do-barbeiro-design.md`).

---

## 1. O problema

Hoje só o admin da plataforma cria gente: ele cria a barbearia com **um** dono,
e para esse dono a equipe é imutável. Contratar alguém exige pedir para o dono
da plataforma — o que não escala e coloca um estranho no meio de uma decisão da
casa.

A Etapa 3 inteira era "equipe, expediente e serviços". Isso é grande demais
para um plano só e, pior, mistura duas coisas de risco muito diferente:
cadastrar gente é CRUD com regras claras; mexer em expediente e bloqueio é
alterar o motor de horários (§6 do cliente), que é o código mais delicado do
sistema. Esta fatia entrega **apenas a equipe**. Expediente e bloqueios são a
fatia B; serviços e durações, a C.

---

## 2. O que entra

| Capacidade | Quem |
|---|---|
| Ver a equipe, com o estado de cada um | Só o `DONO` |
| Cadastrar barbeiro e disparar o convite | Só o `DONO` |
| Corrigir nome, celular e papel | Só o `DONO` |
| Reemitir o convite (que é também o reset de senha) | Só o `DONO` |
| Desativar e reativar | Só o `DONO` |

Quatro decisões vêm de etapas anteriores e não são reabertas aqui: o papel é um
enum de dois valores (ou é dono, ou vê só o seu); o barbeiro nasce **sem senha**
e recebe um link de convite; desativar é `ativo = false`, nunca `DELETE`; e
barbeiro sem serviço vinculado não aparece para o cliente.

---

## 3. Autorização — 403 aqui, 404 lá

O painel já tem um ponto de passagem para alcance de dados
(`filtroDoBarbeiro`). Ele não serve aqui: a questão não é *quais linhas* alguém
vê, é se **pode entrar na rota**. Entra uma segunda guarda:

```ts
// src/lib/autorizacao.ts
export function ehDono(sessao: Sessao): boolean;
```

Rota de equipe recebendo sessão de `BARBEIRO` responde **403**, não 404. É uma
divergência consciente da regra do painel, e a linha que separa as duas é o que
o status revelaria:

- **404** é para quando a própria existência do registro é o segredo. Um
  `BARBEIRO` que forja o id de um agendamento do colega não pode descobrir, pelo
  status, que aquele agendamento existe.
- **403** é para quando o pedido é legítimo e a resposta não conta nada novo. O
  barbeiro sabe que não é dono; dizer "isso é do dono" não vaza informação e
  economiza uma tela de erro que mente.

Confundir os dois nos dois sentidos tem custo: 404 aqui esconderia do próprio
dono um erro de permissão real; 403 lá viraria oráculo de "quem atendeu quem".

---

## 4. O `tokenVersion` é obrigatório em três mudanças

O token carrega `{ sub, bid, papel, tv }` e vale 12 horas. **`papel` está dentro
do token**, então:

| Mudança | Por que incrementa `tokenVersion` |
|---|---|
| Rebaixar `DONO` → `BARBEIRO` | Sem isso, o rebaixado mantém alcance de dono por até 12 h — vê a agenda da equipe inteira depois de perder o direito |
| Trocar o celular | O celular é o login; a conta mudou de identidade e as sessões abertas precisam ser refeitas |
| Desativar | É o caso que a Etapa 2 já previu: quem saiu da equipe não continua dentro do painel |
| Reemitir convite | Já implementado no admin, e pelo mesmo motivo: o reset existe para o caso de alguém ter tomado a conta |

Promover `BARBEIRO` → `DONO` também incrementa — não por segurança, mas para o
alcance novo valer na hora, sem o sujeito ter que sair e entrar de novo.

---

## 5. Desativar é recusado quando há agenda futura

Barbeiro com agendamento `CONFIRMADO` no futuro **não é desativado**: a resposta
é **409** com a contagem e a data do último ("Rael tem 7 horários marcados até
sexta").

As alternativas foram descartadas com motivo:

- **Cancelar tudo automaticamente** é rápido e irreversível: dispara mensagem
  para sete clientes e reativar depois não traz nada de volta. Um clique errado
  custa a agenda de uma semana.
- **Desativar e deixar a agenda de pé** produz o pior resultado possível: o
  cliente aparece na barbearia e não tem quem atenda, porque ninguém foi
  obrigado a olhar aquela lista.

Recusar transfere a decisão para quem conhece a casa e sabe quem pode assumir
cada horário — e não custa nada além de um passo a mais no dia em que alguém
sai.

**Duas recusas irmãs**, pelo mesmo espírito de não deixar a barbearia num
estado sem saída:

- **O último `DONO` ativo não é desativado nem rebaixado.** Barbearia sem dono
  não tem como cadastrar ninguém e fica órfã — só o admin da plataforma
  destrava, o que é exatamente o suporte que esta fatia veio eliminar.
- **Ninguém se desativa a si mesmo.** Dono trancado fora do próprio painel é um
  chamado que ele não consegue resolver sozinho.

---

## 6. Celular repetido

`normalizar()` primeiro (§8 do cliente), e o índice `@@unique([barbeariaId,
whatsapp])` decide o resto: repetido é **409**.

A contagem inclui **desativados**, porque o índice não os distingue. A mensagem
diz isso na cara — "esse celular já é de alguém na equipe, inclusive quem está
desativado" —, senão o dono procura na lista, não acha, e conclui que o sistema
está errado. Reativar é o caminho; recadastrar não.

---

## 7. O convite vai por dois caminhos

Ao cadastrar (e ao reemitir), o sistema **dispara o link pelo WhatsApp** e
**também o mostra na tela, uma única vez**.

Não é redundância: o envio é `fire-and-forget` como todo WhatsApp do projeto
(§10.2), então API fora do ar ou sem credencial não derruba o cadastro — e sem
o link na tela, o barbeiro ficaria sem convite nenhum, com ninguém sabendo. O
token só existe em **hash** no banco: perdido, não se recupera; reemite-se.

Texto novo em `mensagens.ts`. O atual de confirmação fala de agendamento; o do
convite fala com um colega de trabalho, não com um cliente.

### A URL base sai do código

O link é montado hoje com `http://` e porta `3000` **fixos**, em dois lugares do
admin. Foi assumido como lacuna, com deploy em vista. Esta fatia monta um
terceiro lugar, e três é onde a duplicação passa a doer:

```ts
// src/lib/convite.ts
export function linkDoConvite(slug: string, token: string): string;
```

A base vem de `URL_BASE_PUBLICA` (`config.ts`), lida de ambiente: em
desenvolvimento `http://{slug}.localhost:3000`, em produção
`https://{slug}.{dominio}`. Os dois lugares do admin passam a usar o helper.

---

## 8. Rotas

| Rota | O quê |
|---|---|
| `GET /api/painel/equipe` | A equipe, com o estado de cada um |
| `POST /api/painel/equipe` | Cadastra e convida |
| `PATCH /api/painel/equipe/[id]` | Nome, celular e papel |
| `POST /api/painel/equipe/[id]/convite` | Reemite o convite / reseta a senha |
| `POST /api/painel/equipe/[id]/desativar` | Desativa, com as três recusas do §5 |
| `POST /api/painel/equipe/[id]/reativar` | Volta atrás |

Todas sob `/api/painel/*`, que o proxy já exige sessão — rota nova nasce com a
peneira aplicada. Todas passam por `ehDono` (§3).

O `GET` devolve, por barbeiro, o que a tela precisa para explicar por que
alguém não recebe cliente:

```ts
{
  id, nome, whatsapp, papel, ativo, desativadoEm,
  temSenha: boolean,            // false = convite pendente
  conviteExpirado: boolean,     // convite pendente e fora do prazo
  servicos: number,             // 0 = não aparece para o cliente
  expediente: number,           // 0 = agenda vazia
  agendamentosFuturos: number,  // o que impede desativar
}
```

---

## 9. A tela

`/painel/equipe`, alcançável só pelo dono — para o barbeiro, o link nem aparece
no painel.

Cada item mostra nome, celular formatado, papel, e **em destaque** o que estiver
faltando: `sem senha ainda`, `convite expirado`, `sem serviço`, `sem
expediente`. Os dois últimos são o pedido explícito do design da Etapa 1: o
barbeiro novo desaparece da tela do cliente em silêncio, e sem esse aviso o dono
não entende por que o funcionário não recebe ninguém.

Cadastro no mesmo lugar, como o admin já faz com barbearia: formulário em cima,
lista embaixo, e o link do convite aparecendo depois de criar.

---

## 10. Testes

`tests/equipe.test.ts`:

- `BARBEIRO` em qualquer rota de equipe → **403**; `DONO` → 200
- cadastrar cria com `senhaHash` nulo, convite com prazo, e devolve o link uma vez
- celular repetido → 409, **inclusive de barbeiro desativado**
- rebaixar dono incrementa `tokenVersion`; a sessão anterior morre
- trocar celular incrementa `tokenVersion`
- desativar com agendamento futuro → 409, com a contagem
- desativar sem agenda futura → `ativo=false`, `desativadoEm` preenchido,
  `tokenVersion` incrementado
- desativar o último dono → 409
- rebaixar o último dono → 409
- desativar a si mesmo → 409
- reativar volta `ativo=true` e limpa `desativadoEm`
- o `GET` conta serviços, expediente e agendamentos futuros por barbeiro
- barbeiro cadastrado agora, sem serviço nem expediente, **não** aparece em
  `GET /api/barbeiros` (a rota pública) — é a consequência que a tela avisa

---

## 11. Fora do escopo

- **Expediente e bloqueios** (fatia B) e **serviços e durações** (fatia C). Esta
  fatia só *avisa* que faltam; não deixa preencher.
- **Foto do barbeiro.** `fotoUrl` existe no schema e continua sem escrita:
  upload é armazenamento de arquivo, que o projeto não tem em lugar nenhum.
- **Transferir agendamento de um barbeiro para outro.** Seria o complemento
  natural da recusa do §5, e é uma tela inteira — cancelar e remarcar resolve
  hoje. Entra se o uso pedir.
- **Histórico de quem mexeu na equipe.** Nenhuma tabela de auditoria; `Barbeiro`
  guarda `desativadoEm` e nada mais.
- **Convite por e-mail.** O produto inteiro se apoia no WhatsApp.
