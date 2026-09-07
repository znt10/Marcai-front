import Link from 'next/link';
import { barbeariaAtual } from '@/lib/tenant';
import { equipeDaBarbearia, cardapioPorBarbeiro } from '@/lib/vitrine';
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
  const [b, equipe, cardapios] = await Promise.all([
    barbeariaAtual(),
    equipeDaBarbearia(),
    cardapioPorBarbeiro(),
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
                  {/* O rosto é o que a vitrine tem para mostrar de quem
                      trabalha na casa — 38px era um selo ao lado do nome, não
                      uma apresentação. 72 é o que cabe na coluna da grade de
                      três num telefone de 390px. */}
                  <Avatar tamanho={72} fotoUrl={p.fotoUrl} nome={p.nome} />
                  <span className="text-[13px]">{p.nome}</span>
                </Box>
              ))}
            </div>
          </div>
        )}
      </Box>

      {/* Um bloco por barbeiro, e não uma lista só de serviços.

          A lista de antes vinha de `barbeiroId=qualquer`, o sentinela que
          devolve o MENOR preço entre quem faz o serviço. Na znt isso
          anunciava "cabelo R$ 22,00" — o preço do dono — enquanto os outros
          três cobram R$ 40,00, e sem nenhum "a partir de" na tela. Quem
          marcasse com outro pagaria quase o dobro do que a fachada prometeu.

          O preço é por barbeiro no banco desde sempre; era só esta tela que
          achatava. Agora cada um mostra o dele, e a comparação que o cliente
          quer fazer ("com quem sai mais barato") acontece antes de escolher,
          não na hora de pagar. */}
      {cardapios.length > 0 && (
        <div className="flex flex-col gap-2">
          <Lbl>serviços</Lbl>
          {cardapios.map(({ barbeiro, servicos }) => (
            <Box key={barbeiro.id} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Avatar tamanho={28} fotoUrl={barbeiro.fotoUrl} nome={barbeiro.nome} />
                <span className="text-[15px]">{barbeiro.nome}</span>
              </div>

              <div className="flex flex-col gap-1 pl-[36px]">
                {servicos.map((s) => (
                  <div key={s.id} className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-sub">
                      {s.nome}{' '}
                      <span className="font-dado text-[11px] text-lbl">{s.duracaoMin}min</span>
                    </span>
                    {/* Nulo enquanto este barbeiro não definiu preço para o
                        serviço. Some o PREÇO, não a linha: "faço barba, preço
                        a combinar" é informação; sumir com a barba esconde
                        que ele faz. */}
                    {s.precoCentavos !== null && (
                      <span className="font-dado text-acento shrink-0">
                        {formatarPreco(s.precoCentavos)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Box>
          ))}
        </div>
      )}

      {/* Por último, como no desenho: a decisão vem depois de ler a casa. */}
      <Link href="/agendar" aria-label={`Marcar horário na ${b.nome}`}>
        <Box variante="fill" className="!py-4 !text-base md:!text-lg">
          marcar horário
        </Box>
      </Link>

      {/* Sem o link do painel: esta tela e' a vitrine do CLIENTE, e a porta de
          servico nao pertence a fachada. Quem trabalha aqui chega por
          /painel direto, ou pelo link do convite. */}
      <div className="text-[10px] md:text-xs text-lbl text-center mt-1">
        ou chama no zap: {formatar(b.whatsappContato)}
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
