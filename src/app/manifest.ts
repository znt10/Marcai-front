import type { MetadataRoute } from 'next';
import { barbeariaAtual } from '@/lib/tenant';

/// O app instalável do BARBEIRO.
///
/// Quem trabalha na casa abre o painel várias vezes por dia, num celular
/// segurado com uma mão só entre um cliente e outro — e até aqui isso era
/// digitar o endereço no navegador, ou caçar a aba certa entre outras dez.
/// Instalado, o painel vira um ícone na tela inicial, abre sem a barra de
/// endereço e guarda a sessão como qualquer outro aplicativo do aparelho.
///
/// `start_url` é `/painel`, e não `/`: quem instala isto é a equipe, não o
/// cliente. O cliente continua chegando pelo link do WhatsApp, que abre a
/// vitrine no navegador — e é por isso que a vitrine NÃO ganhou um app: um
/// ícone a mais na tela de quem corta o cabelo uma vez por mês é lixo, e um
/// ícone de barbearia por casa seria pior ainda.
///
/// `scope` é a raiz, e não `/painel`: com o escopo preso no painel, o link de
/// convite (`/convite/...`) e a vitrine abririam FORA do app, no navegador,
/// no meio de quem está usando. O início é que é o painel.
///
/// O nome sai do nome da barbearia porque o produto é por subdomínio: quem
/// trabalha na Brutus instala "Brutus", não "Marcaí". Duas casas no mesmo
/// aparelho (quem corta em duas) viram dois ícones, com dois nomes — que é o
/// certo, já que são duas contas e duas agendas.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Um nome melhor é um enfeite; um manifesto que falha é um app que não
  // instala. Se o Django estiver fora do ar na hora em que o navegador vier
  // buscar isto, o app nasce com o nome do produto e pronto.
  let nome = 'Marcaí';
  try {
    nome = (await barbeariaAtual()).nome;
  } catch {
    // fica o padrão
  }

  return {
    name: `${nome} — painel`,
    // O que cabe embaixo do ícone na tela inicial: uns 12 caracteres antes de
    // o Android cortar com reticências. O "— painel" fica só no nome longo.
    short_name: nome,
    description: 'A agenda da barbearia para quem trabalha nela: o dia, o quadro da equipe, os horários e os serviços.',
    start_url: '/painel',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'pt-BR',
    // As duas cores do painel no escuro: `background_color` é a tela que o
    // sistema pinta enquanto o app abre, e ela ser o fundo do painel é o que
    // evita o lampejo branco antes da primeira pintura.
    background_color: '#1c1814',
    theme_color: '#1c1814',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/marca.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/marca-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O Android recorta o ícone em círculo ou squircle conforme o aparelho.
      // Sem uma versão `maskable`, ele desenha a marca dentro de um quadrado
      // branco com cantos — a "etiqueta" que denuncia site instalado. Esta
      // aqui tem o desenho reduzido sobre o próprio fundo da marca, dentro da
      // zona segura de 80%.
      { src: '/marca-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
