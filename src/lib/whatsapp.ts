import {
  CHECK_NUMERO_TIMEOUT_MS, CHECK_NUMERO_TTL_MS, CHECK_NUMERO_LIMITE_POR_IP_HORA,
} from './config';

const HORA_MS = 3_600_000;

const cacheNumero = new Map<string, { existe: boolean; expiraEm: number }>();
const usoPorIp = new Map<string, { contador: number; janelaAte: number }>();

/// Só para teste.
export function _limparCaches() { cacheNumero.clear(); usoPorIp.clear(); }

// Lido a cada chamada, não no topo do módulo: o teste troca as variáveis
// entre casos, e um `const` de módulo congelaria o primeiro valor.
const config = () => ({
  url: process.env.EVOLUTION_API_URL ?? '',
  instancia: process.env.EVOLUTION_INSTANCE ?? '',
  chave: process.env.EVOLUTION_API_KEY ?? '',
});

/// Fire-and-forget. Falha de WhatsApp NUNCA derruba um agendamento (§10.2).
///
/// Fire-and-forget é sobre não desfazer o agendamento — **não** é licença para
/// não contar. A resposta é conferida: número desconectado devolve 400 com
/// "sendMessage of undefined", chave errada devolve 401, e nenhum dos dois
/// lança. Sem o `r.ok`, os dois passavam sem uma linha de log, e o único
/// sintoma era o cliente não receber nada — impossível de diagnosticar depois.
export async function enviarTexto(whatsappDigitos: string, mensagem: string): Promise<void> {
  const { url, instancia, chave } = config();
  if (!url) { console.info('[whatsapp] sem EVOLUTION_API_URL:', whatsappDigitos, mensagem); return; }
  try {
    const r = await fetch(`${url}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify({ number: `55${whatsappDigitos}`, text: mensagem }),
      signal: AbortSignal.timeout(CHECK_NUMERO_TIMEOUT_MS),
    });
    if (!r.ok) {
      // O corpo é onde a Evolution diz o motivo, e é o que separa "instância
      // desconectada" de "chave errada" — as duas causas mais comuns, com
      // consertos completamente diferentes.
      const motivo = await r.text().catch(() => '');
      console.error(
        `[whatsapp] envio recusado (${r.status}) para ${whatsappDigitos}:`,
        motivo.slice(0, 300),
      );
      return;
    }

    // **ACEITO**, não "enviado". A palavra importa: a Evolution devolve 201 com
    // `status: PENDING` e o jid resolvido mesmo quando o vínculo do WhatsApp
    // está morto e a mensagem não sai do lugar. Foi exatamente o que aconteceu
    // aqui — horas de "enviado" no log e nada chegando no aparelho. Log que
    // afirma entrega sem saber é pior que log nenhum, porque encerra a
    // investigação no lugar errado.
    //
    // Quem sabe sobre entrega é o `whatsapp:estado` (e o healthcheck do
    // agendador, que roda a cada tique).
    //
    // O TEXTO da mensagem não entra: é conversa de cliente, e log não é lugar
    // para isso.
    const corpo = await r.json().catch(() => null) as
      { key?: { remoteJid?: string }; status?: string } | null;
    console.info(
      `[whatsapp] aceito para ${whatsappDigitos}` +
      ` (jid ${corpo?.key?.remoteJid ?? '?'}, status ${corpo?.status ?? '?'})`,
    );
  } catch (e) {
    console.error('[whatsapp] falha ao enviar:', e);
  }
}

/// 'nao_existe' bloqueia o agendamento. 'indeterminado' deixa passar —
/// indisponibilidade não é resposta (§10.5).
export async function numeroExiste(
  whatsappDigitos: string,
  ip: string,
): Promise<'existe' | 'nao_existe' | 'indeterminado'> {
  const { url, instancia, chave } = config();
  if (!url) return 'indeterminado';

  const guardado = cacheNumero.get(whatsappDigitos);
  if (guardado && guardado.expiraEm > Date.now()) {
    return guardado.existe ? 'existe' : 'nao_existe';
  }

  // Um formulário público que responde "esse número tem WhatsApp" é uma
  // ferramenta de varredura. Sem limite, viram milhares de consultas.
  const uso = usoPorIp.get(ip);
  if (!uso || uso.janelaAte < Date.now()) {
    usoPorIp.set(ip, { contador: 1, janelaAte: Date.now() + HORA_MS });
  } else if (uso.contador >= CHECK_NUMERO_LIMITE_POR_IP_HORA) {
    return 'indeterminado';
  } else {
    uso.contador += 1;
  }

  try {
    const r = await fetch(`${url}/chat/whatsappNumbers/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chave },
      body: JSON.stringify({ numbers: [`55${whatsappDigitos}`] }),
      signal: AbortSignal.timeout(CHECK_NUMERO_TIMEOUT_MS),
    });
    if (!r.ok) return 'indeterminado';
    const dados = await r.json();
    const existe = Array.isArray(dados) && dados[0]?.exists === true;
    cacheNumero.set(whatsappDigitos, { existe, expiraEm: Date.now() + CHECK_NUMERO_TTL_MS });
    return existe ? 'existe' : 'nao_existe';
  } catch (e) {
    console.error('[whatsapp] falha ao verificar número:', e);
    return 'indeterminado';
  }
}
