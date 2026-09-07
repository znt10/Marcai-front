import Link from 'next/link';
import { barbeariaAtual } from '@/lib/tenant';
import { cardapioPorBarbeiro } from '@/lib/vitrine';
import { Vitrine } from '@/components/Vitrine';
import { Frame, Box } from '@/components/wf';
import { formatar } from '@/lib/telefone';

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
/// Servida no servidor de ponta a ponta: as leituras acontecem antes do HTML
/// sair. Buscar equipe e preços depois da montagem faria a página chegar com
/// dois blocos vazios e preenchê-los na cara de quem olha.
///
/// O cartaz virou `<Vitrine>`, um Client Component, quando a grade de rostos
/// passou a ESCOLHER de quem é a tabela de preços. Isso não desfaz o
/// parágrafo acima: os dados continuam vindo daqui, prontos, e o React
/// renderiza o componente no servidor também.
export default async function Barbearia() {
  // `cardapioPorBarbeiro()` já busca a equipe por dentro — pedi-la aqui de
  // novo seria a mesma leitura duas vezes (o `cache()` do React as junta,
  // mas a segunda linha continuaria dizendo que são duas coisas).
  const [b, cardapios] = await Promise.all([
    barbeariaAtual(),
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

      {/* O cartaz e a tabela de preços moram num Client Component só: a
          grade de rostos é o SELETOR da tabela, e o estado precisa ficar
          acima dos dois. Os cardápios de todos vêm daqui prontos, então a
          troca não custa rede — e o HTML do servidor já sai com o primeiro
          barbeiro e os preços dele. */}
      <Vitrine endereco={b.endereco} horarioResumo={b.horarioResumo}
               cardapios={cardapios} />

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
