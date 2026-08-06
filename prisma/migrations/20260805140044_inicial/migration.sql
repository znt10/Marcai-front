-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PapelBarbeiro" AS ENUM ('DONO', 'BARBEIRO');

-- CreateEnum
CREATE TYPE "MotivoBloqueio" AS ENUM ('ALMOCO', 'FOLGA', 'PESSOAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('CONFIRMADO', 'CANCELADO_CLIENTE', 'CANCELADO_BARBEIRO');

-- CreateTable
CREATE TABLE "Barbearia" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "horarioResumo" TEXT NOT NULL,
    "whatsappContato" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barbearia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barbeiro" (
    "id" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "papel" "PapelBarbeiro" NOT NULL DEFAULT 'BARBEIRO',
    "senhaHash" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "conviteTokenHash" TEXT,
    "conviteExpiraEm" TIMESTAMP(3),
    "tentativasLogin" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "fotoUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "desativadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barbeiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "duracaoMinimaMin" INTEGER NOT NULL,
    "duracaoSugeridaMin" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarbeiroServico" (
    "barbeariaId" TEXT NOT NULL,
    "barbeiroId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BarbeiroServico_pkey" PRIMARY KEY ("barbeiroId","servicoId")
);

-- CreateTable
CREATE TABLE "HorarioTrabalho" (
    "id" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "barbeiroId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "minutosInicio" INTEGER NOT NULL,
    "minutosFim" INTEGER NOT NULL,

    CONSTRAINT "HorarioTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bloqueio" (
    "id" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "barbeiroId" TEXT NOT NULL,
    "motivo" "MotivoBloqueio" NOT NULL,
    "observacao" TEXT,
    "repeteSemanalmente" BOOLEAN NOT NULL,
    "diaSemana" INTEGER,
    "minutosInicio" INTEGER,
    "minutosFim" INTEGER,
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agendamento" (
    "id" TEXT NOT NULL,
    "barbeariaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "barbeiroId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "servicoNome" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'CONFIRMADO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceladoEm" TIMESTAMP(3),
    "lembreteEnviadoEm" TIMESTAMP(3),

    CONSTRAINT "Agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Barbearia_slug_key" ON "Barbearia"("slug");

-- CreateIndex
CREATE INDEX "Barbeiro_barbeariaId_idx" ON "Barbeiro"("barbeariaId");

-- CreateIndex
CREATE UNIQUE INDEX "Barbeiro_barbeariaId_whatsapp_key" ON "Barbeiro"("barbeariaId", "whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "Barbeiro_barbeariaId_id_key" ON "Barbeiro"("barbeariaId", "id");

-- CreateIndex
CREATE INDEX "Servico_barbeariaId_idx" ON "Servico"("barbeariaId");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_barbeariaId_nome_key" ON "Servico"("barbeariaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_barbeariaId_id_key" ON "Servico"("barbeariaId", "id");

-- CreateIndex
CREATE INDEX "BarbeiroServico_barbeariaId_idx" ON "BarbeiroServico"("barbeariaId");

-- CreateIndex
CREATE INDEX "HorarioTrabalho_barbeariaId_idx" ON "HorarioTrabalho"("barbeariaId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioTrabalho_barbeiroId_diaSemana_key" ON "HorarioTrabalho"("barbeiroId", "diaSemana");

-- CreateIndex
CREATE INDEX "Bloqueio_barbeariaId_idx" ON "Bloqueio"("barbeariaId");

-- CreateIndex
CREATE INDEX "Bloqueio_barbeiroId_idx" ON "Bloqueio"("barbeiroId");

-- CreateIndex
CREATE INDEX "Cliente_barbeariaId_idx" ON "Cliente"("barbeariaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_barbeariaId_whatsapp_key" ON "Cliente"("barbeariaId", "whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_barbeariaId_id_key" ON "Cliente"("barbeariaId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Agendamento_codigo_key" ON "Agendamento"("codigo");

-- CreateIndex
CREATE INDEX "Agendamento_barbeariaId_idx" ON "Agendamento"("barbeariaId");

-- CreateIndex
CREATE INDEX "Agendamento_barbeiroId_inicio_idx" ON "Agendamento"("barbeiroId", "inicio");

-- CreateIndex
CREATE INDEX "Agendamento_clienteId_idx" ON "Agendamento"("clienteId");

-- CreateIndex
CREATE INDEX "Agendamento_servicoId_idx" ON "Agendamento"("servicoId");

-- AddForeignKey
ALTER TABLE "Barbeiro" ADD CONSTRAINT "Barbeiro_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servico" ADD CONSTRAINT "Servico_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarbeiroServico" ADD CONSTRAINT "BarbeiroServico_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarbeiroServico" ADD CONSTRAINT "BarbeiroServico_barbeiroId_fkey" FOREIGN KEY ("barbeiroId") REFERENCES "Barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarbeiroServico" ADD CONSTRAINT "BarbeiroServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT "HorarioTrabalho_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT "HorarioTrabalho_barbeiroId_fkey" FOREIGN KEY ("barbeiroId") REFERENCES "Barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bloqueio" ADD CONSTRAINT "Bloqueio_barbeiroId_fkey" FOREIGN KEY ("barbeiroId") REFERENCES "Barbeiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_barbeariaId_fkey" FOREIGN KEY ("barbeariaId") REFERENCES "Barbearia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_barbeiroId_fkey" FOREIGN KEY ("barbeiroId") REFERENCES "Barbeiro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agendamento" ADD CONSTRAINT "Agendamento_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

