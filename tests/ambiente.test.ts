import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/// Varredura estrutural do ambiente, no espírito da do RLS: toda variável que
/// o código LÊ tem que estar declarada em algum lugar que uma pessoa nova leia.
///
/// Não é burocracia — é o modo de falha que importa. Variável esquecida faz o
/// código ler `undefined`, o `if (!url)` desviar para o caminho silencioso, e o
/// sintoma é **mensagem que não chega**: sem erro em log, sem teste vermelho,
/// sem `tsc` reclamando. Foi exatamente o que o `CRON_SECRET` vazio fez com o
/// lembrete, e o que uma `EVOLUTION_API_KEY` fora do compose faria com todo
/// envio (chave errada é 401, e o envio é fire-and-forget).

const RAIZ = join(__dirname, '..');

// Tarefa 1 (separação front/back): `db`, `redis`, `evolution`, `zelador` e
// `agendador` mudaram de repositório — vivem agora em `back/`, ligados a este
// por uma rede docker compartilhada (`brutus`). As varreduras abaixo que
// liam essas decisões do compose/scripts daqui passam a ler de lá.
const RAIZ_BACK = join(RAIZ, '..', 'back');

/// Posta pelo Next e pelo runtime, nunca pela gente. Documentar seria mentir
/// sobre quem a define.
const DO_RUNTIME = new Set(['NODE_ENV']);

function arquivosDe(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) return arquivosDe(caminho);
    return /\.(ts|tsx)$/.test(e.name) ? [caminho] : [];
  });
}

function lidasEmSrc(): string[] {
  const nomes = new Set<string>();
  for (const arquivo of arquivosDe(join(RAIZ, 'src'))) {
    for (const achado of readFileSync(arquivo, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (!DO_RUNTIME.has(achado[1])) nomes.add(achado[1]);
    }
  }
  return [...nomes].sort();
}

describe('variáveis de ambiente', () => {
  it('toda variável lida em src/ está no .env.example ou no compose', () => {
    const exemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
    const compose = readFileSync(join(RAIZ, 'docker-compose.yml'), 'utf8');

    const naoDeclaradas = lidasEmSrc().filter((nome) =>
      !new RegExp(`^\\s*${nome}\\s*[:=]`, 'm').test(exemplo) &&
      !new RegExp(`^\\s*${nome}\\s*[:=]`, 'm').test(compose));

    expect(naoDeclaradas).toEqual([]);
  });

  it('o segredo do painel é diferente do segredo do admin no .env.example', () => {
    // Não é detalhe de configuração: é o mecanismo que faz cookie de admin não
    // abrir o painel, e vice-versa, SEM nenhuma checagem escrita para esse fim.
    // Dois secrets iguais transformariam duas fronteiras em uma, em silêncio.
    const exemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
    for (const nome of ['ADMIN_JWT_SECRET', 'SESSAO_JWT_SECRET']) {
      expect(exemplo, `${nome} precisa aparecer no .env.example`)
        .toMatch(new RegExp(`^\\s*${nome}=`, 'm'));
    }
  });

  it('a chave da Evolution alimenta os dois serviços do compose', () => {
    // `app` mora no compose daqui; `evolution` mora agora no do back. A
    // variável precisa ser a MESMA nos dois — é o que a rede `brutus` liga.
    const composeApp = readFileSync(join(RAIZ, 'docker-compose.yml'), 'utf8');
    const composeBack = readFileSync(join(RAIZ_BACK, 'docker-compose.yml'), 'utf8');
    // O `app` manda e o `evolution` exige. Se um deixar de sair da mesma
    // variável, o sintoma é 401 silencioso em todo envio.
    expect(composeBack).toMatch(/AUTHENTICATION_API_KEY:\s*\$\{EVOLUTION_API_KEY\}/);
    expect(composeApp).toMatch(/EVOLUTION_API_KEY:\s*\$\{EVOLUTION_API_KEY\}/);
  });

  it('o agendador confere o WhatsApp no mesmo tique do lembrete', () => {
    const compose = readFileSync(join(RAIZ_BACK, 'docker-compose.yml'), 'utf8');
    // O vínculo do WhatsApp cai sozinho (`Instance - LOGOUT`, sem ninguém
    // pedir) e depois disso a Evolution responde 201 com `status: PENDING`
    // para TUDO, sem entregar nada. Aconteceu, e ficou quase duas horas assim:
    // o sintoma é cliente deixando de receber confirmação, que ninguém
    // descobre olhando tela. O agendador não conserta — reconectar exige o QR,
    // que exige uma pessoa — mas grita, e era isso que faltava.
    expect(compose).toMatch(/connectionState/);
    expect(compose).toMatch(/WHATSAPP FORA DO AR/);
    // A cadência do aviso é a mesma do lembrete de propósito: um processo, um
    // laço, um lugar para olhar.
    expect(compose).toMatch(/EVOLUTION_API_KEY:\s*\$\{EVOLUTION_API_KEY\}/);
  });

  it('o zelador alarma envio recusado e poda o histórico', () => {
    const compose = readFileSync(join(RAIZ_BACK, 'docker-compose.yml'), 'utf8');
    const zelador = readFileSync(join(RAIZ_BACK, 'docker', 'zelador.sh'), 'utf8');

    // O WhatsApp rejeita de forma ASSÍNCRONA: quando a recusa chega, a Evolution
    // já devolveu 201 ao app. `status = 'ERROR'` é o único registro disso, e sem
    // alguém lendo esse registro a mensagem que não chega é invisível.
    expect(zelador).toMatch(/status = 'ERROR'/);
    expect(zelador).toMatch(/RECUSADO/);

    // A poda existe porque o rastreio de status EXIGE guardar o texto que nós
    // mandamos — medido: sem a linha da mensagem, a `MessageUpdate` fica vazia.
    // Sem poda, o histórico cresceria para sempre.
    // As aspas viajam escapadas dentro da string de shell: `\"Message\"`.
    expect(zelador).toMatch(/DELETE FROM \\"Message\\"/);
    expect(zelador).toMatch(/DIAS_DE_HISTORICO=\d+/);
    // `MessageUpdate` primeiro: ela referencia `Message`.
    expect(zelador.indexOf('DELETE FROM \\"MessageUpdate\\"'))
      .toBeLessThan(zelador.indexOf('DELETE FROM \\"Message\\"'));

    // Os dois flags andam juntos — ligar só um deixa a tabela de status vazia.
    expect(compose).toMatch(/DATABASE_SAVE_DATA_NEW_MESSAGE:\s*"true"/);
    expect(compose).toMatch(/DATABASE_SAVE_MESSAGE_UPDATE:\s*"true"/);
    // Conversa de cliente continua fora: o produto nunca recebe mensagem.
    expect(compose).toMatch(/DATABASE_SAVE_DATA_CONTACTS:\s*"false"/);
    expect(compose).toMatch(/DATABASE_SAVE_DATA_HISTORIC:\s*"false"/);
  });

  it('a sessão da Evolution mora num volume nomeado', () => {
    const compose = readFileSync(join(RAIZ_BACK, 'docker-compose.yml'), 'utf8');
    // Sem volume, todo `docker compose down` obriga a escanear o QR de novo —
    // em produção, é o telefone da barbearia caindo a cada deploy.
    expect(compose).toMatch(/evolution_instances:\/evolution\/instances/);
  });
});
