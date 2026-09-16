import { defineConfig } from 'vitest/config';
import path from 'node:path';

// O fuso do PRODUTO, fixado antes de qualquer `Date` existir.
//
// Sem isto a suite herda o fuso da maquina, e os testes que conferem data
// formatada passam aqui e falham no CI: o runner do GitHub roda em UTC, onde
// `2026-09-14T22:10-03:00` vira dia 15. Foi assim que este arquivo entrou —
// o primeiro CI verde do repositorio pegou dois testes da faixa do WhatsApp.
//
// America/Sao_Paulo e nao UTC porque e' o fuso em que o produto pensa: o
// back calcula agenda nele (`tenant/datas.py`), e "desde 17:02" na faixa e'
// hora de barbearia, nao hora de servidor.
process.env.TZ = 'America/Sao_Paulo';

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
