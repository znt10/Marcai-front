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

  it('o front nao tem segredo nenhum', () => {
    // O INVERSO exato do que este teste exigia ate a fatia 4.
    //
    // Ele cobrava que ADMIN_JWT_SECRET e SESSAO_JWT_SECRET estivessem no
    // .env.example, porque era o front que assinava os dois cookies — e o que
    // ele protegia era a separacao entre eles: dois segredos iguais fariam
    // cookie de admin abrir o painel, em silencio.
    //
    // Essa propriedade nao sumiu, ela MUDOU DE LADO. Quem assina os dois
    // cookies agora e o Django, e e la que os dois segredos precisam divergir.
    // Aqui, a propriedade que vale e a ausencia: um segredo neste arquivo hoje
    // so poderia ser copia esquecida de um que vale do outro lado — e copia
    // esquecida de segredo e a que ninguem troca quando vaza.
    const exemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
    const compose = readFileSync(join(RAIZ, 'docker-compose.yml'), 'utf8');

    for (const nome of [
      'ADMIN_JWT_SECRET', 'SESSAO_JWT_SECRET', 'CRON_SECRET',
      'ADMIN_USUARIO', 'ADMIN_SENHA_HASH_B64', 'DATABASE_URL',
    ]) {
      expect(exemplo, nome + ' nao pode voltar ao .env.example').not.toMatch(
        new RegExp('^\s*' + nome, 'm'),
      );
      expect(compose, nome + ' nao pode voltar ao compose').not.toMatch(
        new RegExp('^\s*' + nome + '\s*:', 'm'),
      );
    }
  });

  it('a chave da Evolution alimenta o app', () => {
    const compose = readFileSync(join(RAIZ, 'docker-compose.yml'), 'utf8');
    // Era um teste bilateral — uma variável, dois consumidores, um `it` só —
    // até a Tarefa 1 mudar o `evolution` para o repositório do back. Sem os
    // dois lados no mesmo disco, a propriedade "as duas pontas saem da mesma
    // variável" deixou de ser verificável por um teste único: agora cada
    // ponta a afirma pelo NOME da variável, cada uma na sua borda. É a mesma
    // forma que a barreira do admin já usa — a mesma regra, aplicada
    // independentemente nos dois lados. A metade do `evolution`
    // (`AUTHENTICATION_API_KEY`) está documentada em
    // `back/docs/testes-a-portar.md`, para renascer em pytest na Tarefa 2.
    //
    // Chave errada aqui é 401 silencioso no `evolution` (o envio é
    // fire-and-forget) — o sintoma seria "a mensagem não chega" sem erro em
    // log nenhum.
    expect(compose).toMatch(/EVOLUTION_API_KEY:\s*\$\{EVOLUTION_API_KEY\}/);
  });
});
