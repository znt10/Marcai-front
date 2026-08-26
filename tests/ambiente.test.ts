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
});
