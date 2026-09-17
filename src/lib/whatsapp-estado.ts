import type { EstadoDoWhatsapp, WhatsappDaBarbearia } from './api/painelAPI';

/// O que a faixa do painel diz, a partir do estado do vínculo e do papel de
/// quem está olhando.
///
/// Função PURA, e num arquivo só dela, porque é aqui que mora a regra que o
/// produto vende: **todo mundo vê que caiu; só o dono tem o que fazer a
/// respeito.** O barbeiro precisa saber por que ninguém está confirmando — é
/// ele que atende o cliente que liga perguntando. O que ele não pode é ter
/// caminho para o QR, que ligaria o WhatsApp da barbearia ao celular dele.
///
/// Separada da tela para poder ser testada como texto, sem montar React: as
/// combinações são estado × papel, e é justamente a combinação errada que
/// produz o pior resultado (barbeiro com link de conectar, dono sem).

export type Papel = 'DONO' | 'BARBEIRO';

export type Faixa = {
  texto: string;
  /// `null` = não há nada a fazer por aqui. É o que o barbeiro recebe.
  link: string | null;
  acao: string | null;
};

/// Os estados em que o vínculo NÃO está de pé. `PENDENTE` entra: para quem
/// olha, "ainda sendo criado" e "caiu" são a mesma coisa — não sai mensagem.
const FORA_DO_AR: EstadoDoWhatsapp[] = ['PENDENTE', 'AGUARDANDO_QR', 'DESCONECTADO'];

export const CAMINHO_DO_QR = '/painel/whatsapp';

/// `null` quer dizer "não mostra faixa nenhuma". É o caso do plano sem zap
/// (não há vínculo que possa cair) e o do vínculo de pé.
export function faixaDoWhatsapp(
  dados: Pick<WhatsappDaBarbearia, 'plano' | 'estado' | 'desconectadoDesde' | 'naoEnviadas'>,
  papel: Papel,
  agora: Date = new Date(),
): Faixa | null {
  if (dados.plano !== 'COM_ZAP') return null;
  if (!dados.estado || !FORA_DO_AR.includes(dados.estado)) return null;

  const retidas = contagem(dados.naoEnviadas);

  if (papel !== 'DONO') {
    // Sem link e sem verbo: o barbeiro não tem o que fazer, e oferecer um
    // botão que leva a 403 é pior que não oferecer nada.
    return {
      texto: `WhatsApp da barbearia desconectado — avise o dono${retidas}`,
      link: null,
      acao: null,
    };
  }

  return {
    texto: `WhatsApp desconectado${desde(dados.desconectadoDesde, agora)}${retidas}`,
    link: CAMINHO_DO_QR,
    // O verbo muda com o estado, e a diferença importa para quem vai clicar:
    // `AGUARDANDO_QR` já tem um código esperando na tela, o resto ainda não.
    acao: dados.estado === 'AGUARDANDO_QR' ? 'ler o QR' : 'conectar',
  };
}

/// "desde 14:02" no mesmo dia, "desde 14/09" quando já virou. Sem isso a
/// faixa diria só "desconectado", e o dono não saberia se caiu agora (pode
/// ser a internet piscando) ou ontem à noite (perdeu a manhã inteira).
function desde(quando: string | null, agora: Date): string {
  if (!quando) return '';
  const data = new Date(quando);
  if (Number.isNaN(data.getTime())) return '';

  const mesmoDia = data.toDateString() === agora.toDateString();
  const texto = mesmoDia
    ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return ` desde ${texto}`;
}

function contagem(quantas: number): string {
  if (quantas <= 0) return '';
  return quantas === 1
    ? ' · 1 mensagem não enviada'
    : ` · ${quantas} mensagens não enviadas`;
}

/// O texto explicativo abaixo do interruptor do atendimento automático.
///
/// Com o robô DESLIGADO, o texto descreve o que acontece SE o dono ligar —
/// não o que já está acontecendo. "Ligado, o robô responde…" ao lado de um
/// interruptor "Desligado" lia como se o robô já estivesse respondendo, que
/// é o oposto do que a tela mostra.
export function textoDoInterruptorBot(ativo: boolean): string {
  return ativo
    ? 'Quem escreve para este número recebe um menu para marcar ou cancelar. '
      + 'Se alguém da barbearia responder pelo celular, o robô fica quieto '
      + 'naquela conversa por 4 horas.'
    : 'Se ligar, o robô passa a responder quem escrever para este número com '
      + 'um menu para marcar ou cancelar horário. Grupo, áudio e foto ele ignora.';
}
