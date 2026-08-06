-- Barbearia fica FORA do RLS: precisa ser lida antes de existir tenant,
-- para traduzir subdomínio em id. Protegida por GRANT, não por política.
REVOKE INSERT, UPDATE, DELETE ON "Barbearia" FROM brutus_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Barbeiro','Servico','BarbeiroServico','HorarioTrabalho',
    'Bloqueio','Cliente','Agendamento'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE aplica a política até ao DONO da tabela. Sem ele, qualquer papel
    -- que venha a ser dono de uma tabela escaparia do RLS por padrão.
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);

    -- Política do runtime. Amarrada a `TO brutus_app`, não a PUBLIC: um papel
    -- futuro que ganhe GRANT sem ganhar política enxerga ZERO linhas em vez
    -- de herdar esta. Falha fechada por construção.
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        TO brutus_app
        USING      ("barbeariaId" = current_setting('app.barbearia_id', true))
        WITH CHECK ("barbeariaId" = current_setting('app.barbearia_id', true))
    $f$, t);

    -- Contrapeso ao FORCE acima. Migração, seed e montagem de cenário de
    -- teste rodam como brutus_owner e atravessam vários tenants numa mesma
    -- conexão — com FORCE e sem esta política, todo INSERT do dono morreria
    -- no WITH CHECK. `TO brutus_owner` mantém brutus_app intocado: políticas
    -- permissivas se somam por OR, mas só para os papéis que elas nomeiam.
    EXECUTE format($f$
      CREATE POLICY owner_irrestrito ON %I
        TO brutus_owner
        USING (true) WITH CHECK (true)
    $f$, t);
  END LOOP;
END $$;
