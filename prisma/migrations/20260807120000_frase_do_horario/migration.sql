-- O dono passa a editar a frase de horário pela tela de serviços, e ela é a
-- ÚNICA coluna de "Barbearia" que o runtime escreve. O grant é por COLUNA de
-- propósito: `brutus_app` continua sem poder mexer em slug, ativo ou qualquer
-- outra coisa da tabela — quem administra barbearia é o admin da plataforma.
--
-- A migração de RLS revogou INSERT, UPDATE e DELETE inteiros deste papel
-- (20260805221500_rls). Isto devolve o mínimo, e nada além.
GRANT UPDATE ("horarioResumo") ON "Barbearia" TO brutus_app;
