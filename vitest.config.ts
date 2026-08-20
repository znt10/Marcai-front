import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Sem `setupFiles` e sem `fileParallelism: false`: os dois existiam por
    // causa do BANCO. O setup abria conexão e truncava tabela entre casos, e a
    // serialização evitava que duas suítes se atropelassem no mesmo
    // `brutus_test` — o problema que o card "Bancos de teste separados por
    // repositório" descreve. Nenhum dos testes que sobraram toca banco, então
    // eles voltam a rodar em paralelo.
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
