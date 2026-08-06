// `src/lib/db.ts` lê DATABASE_URL_APP, que no .env aponta para o host `db`
// da rede do Compose — inalcançável de fora do contêiner. Redirecionar aqui
// faz o singleton de runtime nascer apontado para o banco de teste sem que o
// código de produção precise saber que testes existem.
//
// Módulo à parte, e não uma linha no topo de setup.ts, porque os `import` de
// ESM são içados: qualquer `import '@/lib/...'` em setup.ts seria avaliado
// ANTES do corpo dele, e o PrismaClient já teria nascido com a URL errada.
// Importar este arquivo primeiro é o que garante a ordem.
process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP_TEST;
process.env.DATABASE_URL_ADMIN = process.env.DATABASE_URL_ADMIN_TEST;

export {};
