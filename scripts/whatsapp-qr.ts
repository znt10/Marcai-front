import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/// Conecta o número do WhatsApp à instância da Evolution.
///
/// Roda do HOST, então usa `EVOLUTION_API_URL_HOST` — a `EVOLUTION_API_URL` do
/// app é `http://evolution:8080`, nome de serviço que só resolve dentro da rede
/// do compose. Mesma razão pela qual `DATABASE_URL_HOST` existe.
///
/// Pareamento de telefone não é automatizável, e não deve ser: alguém com o
/// aparelho na mão precisa escanear. O que este script faz é entregar o QR sem
/// exigir painel nenhum.

const ARQUIVO_QR = 'whatsapp-qr.png';

const base = process.env.EVOLUTION_API_URL_HOST ?? 'http://localhost:8080';
const instancia = process.env.EVOLUTION_INSTANCE ?? 'brutus';
const chave = process.env.EVOLUTION_API_KEY ?? '';

if (!chave) {
  console.error(
    'Falta EVOLUTION_API_KEY no .env. Gerar com:\n' +
    '  node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"',
  );
  process.exit(1);
}

const chamar = async (caminho: string, init?: RequestInit) => {
  const r = await fetch(`${base}${caminho}`, {
    ...init,
    headers: { apikey: chave, 'Content-Type': 'application/json', ...init?.headers },
  });
  const corpo = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, corpo } as {
    ok: boolean; status: number; corpo: Record<string, unknown> | null;
  };
};

async function principal() {
  const estado = await chamar(`/instance/connectionState/${instancia}`);

  // 404 = instância nunca criada. Criar aqui em vez de exigir um curl à mão:
  // é o primeiro uso numa máquina nova, e um passo a menos para errar.
  if (estado.status === 404) {
    console.log(`Instância "${instancia}" não existe. Criando…`);
    const criada = await chamar('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true,
      }),
    });
    if (!criada.ok) {
      console.error('Não deu para criar a instância:', criada.status, criada.corpo);
      process.exit(1);
    }
  } else if (!estado.ok) {
    console.error(
      `A Evolution não respondeu em ${base} (${estado.status}).\n` +
      'Sobe com `docker compose up -d evolution` e confere `docker compose logs evolution`.',
    );
    process.exit(1);
  }

  const conectado = (estado.corpo?.instance as { state?: string } | undefined)?.state;
  if (conectado === 'open') {
    console.log(`Instância "${instancia}" já está conectada. Nada a fazer.`);
    return;
  }

  const conexao = await chamar(`/instance/connect/${instancia}`);
  if (!conexao.ok) {
    console.error('Não deu para pedir o QR:', conexao.status, conexao.corpo);
    process.exit(1);
  }

  const { base64, pairingCode } = (conexao.corpo ?? {}) as
    { base64?: string; pairingCode?: string };

  if (pairingCode) {
    console.log(`\nCódigo de pareamento: ${pairingCode}`);
    console.log('WhatsApp > Aparelhos conectados > Conectar com número de telefone.\n');
  }

  if (!base64) {
    console.error('A Evolution não devolveu QR. Resposta:', conexao.corpo);
    process.exit(1);
  }

  const png = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const destino = join(process.cwd(), ARQUIVO_QR);
  writeFileSync(destino, png);

  console.log(`QR salvo em ${destino}`);
  console.log('Abre o arquivo e escaneia em WhatsApp > Aparelhos conectados.');
  console.log('O QR expira em cerca de 40 s — rodando de novo sai outro.\n');
  console.log(`Conferir depois: npm run whatsapp:estado`);
}

void principal();
