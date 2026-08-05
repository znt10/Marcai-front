import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 removeu `url` do bloco `datasource` em schema.prisma; a URL de
// conexão usada pelo Prisma CLI (papel dono, DATABASE_URL) mora aqui agora.
// O runtime da aplicação usa DATABASE_URL_APP por outro caminho (Tarefa 4).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
