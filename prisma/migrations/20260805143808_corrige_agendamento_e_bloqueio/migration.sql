-- Correção pós-revisão da migração `20260805142315_restricoes`.

-- (1) O EXCLUDE protege o intervalo ARMAZENADO em Agendamento, mas nada
-- amarrava "fim" a "inicio" + "duracaoMin", nem limitava "duracaoMin" nesta
-- tabela. Consequências: um "fim" calculado errado (ex.: 20min gravados
-- para um corte de 40) escaparia da proteção contra dupla marcação; e
-- "fim" = "inicio" produz um tstzrange VAZIO, que nunca sobrepõe nada,
-- deixando um agendamento de duração zero invisível para o EXCLUDE.
-- Os literais 10 e 60 duplicam DURACAO_MINIMA_MIN / DURACAO_MAXIMA_MIN de
-- src/lib/config.ts — mesma duplicação consciente do CHECK original.
ALTER TABLE "Agendamento" ADD CONSTRAINT agendamento_duracao_valida CHECK (
  "duracaoMin" BETWEEN 10 AND 60
  AND "fim" = "inicio" + make_interval(mins => "duracaoMin")
);

-- (2) bloqueio_forma_valida validava a FORMA (quais colunas estão
-- preenchidas) mas não o INTERVALO do ramo semanal: um bloqueio semanal com
-- minutosFim <= minutosInicio passava, virando janela vazia/negativa para o
-- cálculo de disponibilidade. horario_valido já faz essa checagem para a
-- mesma grandeza (minutos do dia, 0..1440); replicada aqui por simetria.
-- Não é possível alterar a definição de um CHECK in place — precisa
-- DROP + ADD.
ALTER TABLE "Bloqueio" DROP CONSTRAINT bloqueio_forma_valida;

ALTER TABLE "Bloqueio" ADD CONSTRAINT bloqueio_forma_valida CHECK (
  ("repeteSemanalmente" = true
     AND "diaSemana" IS NOT NULL AND "minutosInicio" IS NOT NULL
     AND "minutosFim" IS NOT NULL AND "inicio" IS NULL AND "fim" IS NULL
     AND "minutosInicio" >= 0 AND "minutosFim" <= 1440 AND "minutosFim" > "minutosInicio")
  OR
  ("repeteSemanalmente" = false
     AND "inicio" IS NOT NULL AND "fim" IS NOT NULL AND "fim" > "inicio"
     AND "diaSemana" IS NULL AND "minutosInicio" IS NULL AND "minutosFim" IS NULL)
);
