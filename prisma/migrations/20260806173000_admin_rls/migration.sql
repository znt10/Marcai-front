-- As políticas de isolamento foram criadas com `TO brutus_app`. Com RLS
-- ligado, um papel que não casa com política nenhuma não enxerga linha
-- nenhuma — falha fechada, que é a propriedade certa, mas deixa o
-- brutus_admin cego inclusive dentro de comBarbeariaAdmin().
--
-- A correção é NOMEAR o admin na mesma política, não criar uma paralela: a
-- regra de isolamento continua escrita num lugar só. Se um dia ela mudar,
-- muda para os dois papéis de uma vez.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Barbeiro','Servico','BarbeiroServico','HorarioTrabalho',
    'Bloqueio','Cliente','Agendamento'
  ] LOOP
    EXECUTE format('ALTER POLICY tenant_isolation ON %I TO brutus_app, brutus_admin', t);
  END LOOP;
END $$;
