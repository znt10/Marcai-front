/// O aviso de mensagens que não chegaram ao cliente, na tela do WhatsApp.
///
/// Desde a etapa 1 do número central, quem cai é o WhatsApp do Marcaí, não
/// o da barbearia — o texto diz isso para o dono não sair procurando um
/// problema no celular dele.
export function textoDasNaoEnviadas(quantas: number): string | null {
  if (quantas <= 0) return null;
  return quantas === 1
    ? '1 cliente não recebeu a mensagem — o WhatsApp do Marcaí estava fora do ar.'
    : `${quantas} clientes não receberam a mensagem — o WhatsApp do Marcaí estava fora do ar.`;
}
