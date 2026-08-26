import { barbeariaAtual } from '@/lib/tenant';
import { equipeDaBarbearia, cardapioDaBarbearia } from '@/lib/vitrine';
import { Frame, Box, Lbl, Sub, Avatar } from '@/components/wf';
import { formatar } from '@/lib/telefone';
import { formatarPreco } from '@/lib/dinheiro';

/// A primeira tela: a barbearia, não o formulário.
///
/// Até aqui o link da barbearia abria direto em "escolha o barbeiro", o que
/// pede uma decisão de quem ainda não sabe onde está. Agora a porta é a casa
/// — quem corta, o que tem, quanto custa — e marcar é UMA ação, no botão que
/// leva a `/agendar`.
///
/// Desenho: frame `33:839` do Figma. A equipe fica DENTRO do cartaz, e o
/// botão vem por último, depois dos serviços: quem chega lê a casa inteira e
/// só então decide. (Há outras versões desta tela no arquivo, com o botão
/// logo abaixo do cartaz — esta é a escolhida.)
///
/// Servida no servidor de ponta a ponta: as três leituras acontecem antes do
/// HTML sair. Buscar equipe e preços depois da montagem faria a página chegar
/// com dois blocos vazios e preenchê-los na cara de quem olha.
export default async function Barbearia() {
  const [b, equipe, cardapio] = await Promise.all([
    barbeariaAtual(),
    equipeDaBarbearia(),
    cardapioDaBarbearia(),
  ]);

  return (
    <Frame>
      {/* O topo do desenho: marca de 30px à esquerda do nome. A marca é do
          MARCAÍ, não desta barbearia — não há campo de logo por barbearia no
          banco. Quando houver, é este `src` que passa a variar. */}
      <div className="flex items-center gap-3">
        <img src="/marca.png" alt="" width={30} height={30}
             className="rounded-[3px] shrink-0" />
        <h1 className="!text-[19px] md:!text-[22px]">barbearia {b.nome}</h1>
      </div>

      <Box className="flex flex-col items-center gap-3 pt-6 pb-5 md:pt-7 text-center">
        <img src="/marca.png" alt="" width={96} height={96}
             className="rounded-wf" />

        {/* A frase é do PRODUTO, não desta barbearia: não há campo para ela no
            banco, então toda barbearia diz o mesmo. Quando existir uma
            manchete por barbearia, é aqui que ela entra. */}
        <p className="font-letreiro uppercase font-semibold leading-[1.05]
                      tracking-[0.02em] text-[26px] md:text-[34px] text-tinta">
          Corte de homem,<br />hora marcada.
        </p>

        <div className="flex flex-col gap-0.5">
          <Sub>{b.endereco}</Sub>
          {/* Nulo até o dono escrever a frase. Sem a condição, sobraria uma
              linha vazia no meio do cartaz. */}
          {b.horarioResumo && <Sub>{b.horarioResumo}</Sub>}
        </div>

        {/* Dentro do cartaz, como no desenho: a equipe é parte da
            apresentação da casa, não uma seção à parte. Some junto com o
            resto numa barbearia recém-criada, que ainda não tem ninguém. */}
        {equipe.length > 0 && (
          <div className="w-full flex flex-col gap-2 mt-3 text-left">
            <Lbl>barbeiros</Lbl>
            <div className="grid grid-cols-3 gap-2">
              {equipe.map((p) => (
                <Box key={p.id} className="flex flex-col items-center gap-2 py-3">
                  <Avatar tamanho={38} fotoUrl={p.fotoUrl} nome={p.nome} />
                  <span className="text-[13px]">{p.nome}</span>
                </Box>
              ))}
            </div>
          </div>
        )}
      </Box>

      {cardapio.length > 0 && (
        <div className="flex flex-col gap-2">
          <Lbl>serviços</Lbl>
          {cardapio.map((s) => (
            <Box key={s.id} className="flex items-baseline justify-between gap-3">
              <span>
                {s.nome} <span className="font-dado text-[11px] text-lbl">{s.duracaoMin}min</span>
              </span>
              {/* Nulo enquanto ninguém que faz o serviço definiu preço. Some
                  em vez de mostrar "R$ 0,00", que seria mentira. */}
              {s.precoCentavos !== null && (
                <span className="font-dado text-acento shrink-0">
                  {formatarPreco(s.precoCentavos)}
                </span>
              )}
            </Box>
          ))}
        </div>
      )}

      {/* Por último, como no desenho: a decisão vem depois de ler a casa. */}
      <a href="/agendar" aria-label={`Marcar horário na ${b.nome}`}>
        <Box variante="fill" className="!py-4 !text-base md:!text-lg">
          marcar horário
        </Box>
      </a>

      <div className="text-[10px] md:text-xs text-lbl text-center flex flex-col gap-1 mt-1">
        <span>ou chama no zap: {formatar(b.whatsappContato)}</span>
        <a href="/painel">sou barbeiro · entrar no painel</a>
      </div>
    </Frame>
  );
}

/// O nome da barbearia na aba, e não o "Agendamento" global do layout: com o
/// ícone ao lado, uma aba dizendo "Agendamento" não diz de QUEM é a casa — e
/// é o que a pessoa vê ao salvar o link na tela inicial do celular.
///
/// Sem custo de rede: `barbeariaAtual()` é `cache()` do React, então esta
/// chamada e a do componente viram uma só dentro da mesma requisição.
export async function generateMetadata() {
  const b = await barbeariaAtual();
  return {
    title: `${b.nome} · barbearia`,
    description: `Marque seu horário na ${b.nome}. ${b.endereco}.`,
  };
}
