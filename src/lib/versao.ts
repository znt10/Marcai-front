/// Qual build o aparelho está rodando, e como saber que ele ficou para trás.
///
/// O celular do barbeiro fica dias com o painel aberto, e o quadro do dia
/// passa o expediente aceso no balcão. Como o service worker não guarda nada
/// (`public/sw.js`), quem fecha e abre o app já pega a versão nova; quem nunca
/// fecha continua rodando o JavaScript do build antigo. A cada deploy sobe um
/// contêiner novo, e os pedaços do bundle velho deixam de existir no servidor:
/// a primeira tela que precisar de um pedaço ainda não baixado quebra sem
/// explicar por quê.
///
/// Daí a comparação: o valor abaixo é congelado no `npm run build` (ver o
/// `env` do `next.config.ts`) e viaja dentro do bundle; `/versao` devolve o
/// valor do build que está no ar agora. Diferentes quer dizer que houve deploy
/// desde que esta tela abriu. É o mesmo desenho do FechaCaixa.
export const VERSAO_DO_APP = process.env.NEXT_PUBLIC_VERSAO_DO_APP ?? 'dev';

/// Em desenvolvimento não existe deploy: o próprio dev server recarrega.
export const VERSAO_DE_DESENVOLVIMENTO = 'dev';

/// Houve deploy desde que esta tela abriu?
///
/// Conservadora de propósito: qualquer coisa fora do padrão responde `false`.
/// Um falso negativo custa uma atualização adiada até a próxima checagem; um
/// falso positivo põe uma faixa "atualize" na frente de quem está marcando um
/// horário, por causa de um fetch que falhou.
export function precisaAtualizar(
  versaoLocal: string | undefined,
  versaoDoServidor: string | undefined,
): boolean {
  if (!versaoLocal || !versaoDoServidor) return false;
  if (versaoLocal === VERSAO_DE_DESENVOLVIMENTO) return false;
  return versaoLocal !== versaoDoServidor;
}
