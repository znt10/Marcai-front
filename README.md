# BRUTUS — agenda para barbearias

Agendamento multi-tenant: cada barbearia tem o próprio subdomínio.

## Subir

```bash
cp .env.example .env
docker compose up
npm run seed
```

- `http://brutus.localhost:3000`
- `http://dontony.localhost:3000`

`*.localhost` resolve sozinho no Chrome e no Firefox — não precisa mexer em DNS.

O seed roda do **host**, não de dentro do contêiner: ele lê `DATABASE_URL_HOST`,
e o `dotenv -e .env` carrega essa variável nos dois lugares — dentro do
contêiner ela aponta para um `localhost:5433` que não existe lá.

## Testar

```bash
docker compose up -d db
npm test
```

Os testes rodam do host contra o banco `brutus_test`. Em máquina nova, aplicar
as migrações nele antes da primeira rodada:

```bash
DATABASE_URL="postgresql://brutus_owner:owner@localhost:5433/brutus_test" npx prisma migrate deploy
```

## O que saber antes de mexer

- **Nunca** consultar dado de barbearia fora de `comBarbearia()` — o RLS
  devolve zero linhas, e o bug parece "sumiu tudo".
- O runtime usa `DATABASE_URL_APP` (papel `brutus_app`). Apontar para
  `DATABASE_URL` desliga o isolamento: o dono da tabela ignora RLS.
- Conversão de fuso só em `src/lib/datas.ts`.
- Tabela nova com `barbeariaId` precisa de política de RLS. O teste
  `varredura estrutural` falha se você esquecer.
- Arquivo de rota criado com `docker compose up` já rodando não é enxergado
  pelo watcher do Turbopack através do bind mount do Windows: a rota responde
  404 até `docker compose restart app`.

Spec: `docs/superpowers/specs/2026-08-05-brutus-agendamento-cliente-design.md`
