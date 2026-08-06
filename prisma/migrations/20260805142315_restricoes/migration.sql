CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Limites globais de duração. Os literais 10 e 60 duplicam
-- DURACAO_MINIMA_MIN / DURACAO_MAXIMA_MIN de src/lib/config.ts.
ALTER TABLE "Servico" ADD CONSTRAINT servico_duracao_valida CHECK (
  "duracaoMinimaMin"   BETWEEN 10 AND 60 AND
  "duracaoSugeridaMin" BETWEEN "duracaoMinimaMin" AND 60
);

ALTER TABLE "BarbeiroServico" ADD CONSTRAINT barbeiro_servico_duracao_valida CHECK (
  "duracaoMin" BETWEEN 10 AND 60
);

ALTER TABLE "HorarioTrabalho" ADD CONSTRAINT horario_valido CHECK (
  "minutosInicio" >= 0 AND "minutosFim" <= 1440 AND "minutosFim" > "minutosInicio"
);

-- Bloqueio: exatamente um dos dois conjuntos preenchido (§5.1).
ALTER TABLE "Bloqueio" ADD CONSTRAINT bloqueio_forma_valida CHECK (
  ("repeteSemanalmente" = true
     AND "diaSemana" IS NOT NULL AND "minutosInicio" IS NOT NULL
     AND "minutosFim" IS NOT NULL AND "inicio" IS NULL AND "fim" IS NULL)
  OR
  ("repeteSemanalmente" = false
     AND "inicio" IS NOT NULL AND "fim" IS NOT NULL AND "fim" > "inicio"
     AND "diaSemana" IS NULL AND "minutosInicio" IS NULL AND "minutosFim" IS NULL)
);

-- FK compostas: o barbeariaId denormalizado nunca diverge do dono real.
ALTER TABLE "BarbeiroServico"
  ADD CONSTRAINT bs_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id") ON DELETE CASCADE,
  ADD CONSTRAINT bs_servico_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "servicoId")  REFERENCES "Servico"  ("barbeariaId", "id");

ALTER TABLE "HorarioTrabalho"
  ADD CONSTRAINT ht_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id") ON DELETE CASCADE;

ALTER TABLE "Bloqueio"
  ADD CONSTRAINT bl_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id") ON DELETE CASCADE;

ALTER TABLE "Agendamento"
  ADD CONSTRAINT ag_barbeiro_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "barbeiroId") REFERENCES "Barbeiro" ("barbeariaId", "id"),
  ADD CONSTRAINT ag_cliente_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "clienteId")  REFERENCES "Cliente"  ("barbeariaId", "id"),
  ADD CONSTRAINT ag_servico_mesmo_tenant
  FOREIGN KEY ("barbeariaId", "servicoId")  REFERENCES "Servico"  ("barbeariaId", "id");

-- A ÚNICA garantia contra dupla marcação (§5.4).
-- Compara INTERVALOS, não instantes: um índice único em (barbeiroId, inicio)
-- deixaria passar 16:00+40min colidindo com 16:30+30min.
-- "inicio"/"fim" são `timestamp` (sem fuso) — Prisma mapeia DateTime assim
-- por padrão. O banco guarda UTC (restricoes-globais.md), então
-- `timezone('UTC', col)` só rotula o valor já-UTC como timestamptz; ao
-- contrário de um cast implícito (que dependeria do fuso da sessão e não
-- pode entrar em índice), essa função é IMMUTABLE.
ALTER TABLE "Agendamento"
  ADD CONSTRAINT agendamento_sem_sobreposicao
  EXCLUDE USING gist (
    "barbeiroId" WITH =,
    tstzrange(timezone('UTC', "inicio"), timezone('UTC', "fim"), '[)') WITH &&
  )
  WHERE (status = 'CONFIRMADO');
