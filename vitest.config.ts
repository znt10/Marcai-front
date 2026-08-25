import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // `setupFiles` saiu na fatia 8: `tests/setup.ts` existia para dar dois
    // PrismaClient (owner/app) e um TRUNCATE aos testes de rota. As rotas
    // sairam, o Prisma saiu, e os testes que restam sao de logica pura —
    // nenhum toca banco.
    fileParallelism: false,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
