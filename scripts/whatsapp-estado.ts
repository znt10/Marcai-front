/// Responde a única pergunta que importa depois de escanear: o número está
/// conectado? Roda do HOST, como o whatsapp-qr.

const base = process.env.EVOLUTION_API_URL_HOST ?? 'http://localhost:8080';
const instancia = process.env.EVOLUTION_INSTANCE ?? 'brutus';
const chave = process.env.EVOLUTION_API_KEY ?? '';

const ESTADOS: Record<string, string> = {
  open: 'conectado — mensagem sai por aqui',
  connecting: 'esperando o QR ser escaneado',
  close: 'desconectado — roda `npm run whatsapp:qr`',
};

async function principal() {
  const r = await fetch(`${base}/instance/connectionState/${instancia}`, {
    headers: { apikey: chave },
  }).catch(() => null);

  if (!r) {
    console.error(`A Evolution não respondeu em ${base}. Sobe com \`docker compose up -d evolution\`.`);
    process.exit(1);
  }
  if (r.status === 404) {
    console.log(`Instância "${instancia}" não existe. Roda \`npm run whatsapp:qr\`.`);
    return;
  }

  const corpo = await r.json().catch(() => null);
  const estado = corpo?.instance?.state as string | undefined;
  console.log(`${instancia}: ${estado ?? '?'} — ${ESTADOS[estado ?? ''] ?? 'estado desconhecido'}`);
  if (estado !== 'open') process.exitCode = 1;
}

void principal();
