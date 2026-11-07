import type { WhatsappCentral } from './api/adminAPI';

/// O QR troca a cada ~40s na Evolution: enquanto não conecta, o card do
/// admin confere de novo 3s DEPOIS de cada resposta.
export const CONFERIR_CENTRAL_MS = 3_000;

/// Quando o card do número central confere de novo — `null` quer dizer
/// parar.
///
/// "Depois de cada resposta", e não num relógio fixo, é o ponto: cada
/// conferência pode levar até uns 20s no back (dois tempos-limite da
/// Evolution), e um intervalo fixo empilharia pedidos até ocupar os
/// workers que também servem o site de agendamento. Para quando conectou
/// (não há o que esperar) e quando não há Evolution configurada.
///
/// Segue o CHIP (`evolution`) quando o back manda os dois lados: a Meta não
/// tem QR, e com ela na frente o card de cima diz "conectado" mesmo com o
/// chip caído esperando a leitura.
export function proximaConferencia(dados: WhatsappCentral | null): number | null {
  const chip = dados?.evolution ?? dados;
  if (chip && (!chip.configurado || chip.conectado)) return null;
  return CONFERIR_CENTRAL_MS;
}
