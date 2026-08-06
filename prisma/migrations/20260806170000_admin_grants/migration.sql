-- O papel do admin da plataforma. O `docker/init-db.sql` já o cria num volume
-- novo, mas banco existente nasceu antes desta etapa — daí o CREATE ROLE
-- idempotente aqui.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brutus_admin') THEN
    CREATE ROLE brutus_admin LOGIN PASSWORD 'admin';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO brutus_admin;

-- DML nas tabelas que JÁ existem. ALTER DEFAULT PRIVILEGES só vale para as
-- criadas depois dele, então as oito de hoje precisam do GRANT explícito.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO brutus_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_admin;

-- A ÚNICA capacidade que o brutus_app não tem. É esta linha que distingue os
-- dois papéis; todo o resto é igual. A migração de RLS fez
-- `REVOKE INSERT, UPDATE, DELETE ON "Barbearia" FROM brutus_app` e isso
-- continua valendo — o teste admin-papel confere.
GRANT INSERT, UPDATE ON "Barbearia" TO brutus_admin;

-- Nada de BYPASSRLS. As políticas criadas com FORCE e sem TO valem para todo
-- papel, inclusive este: fora de comBarbeariaAdmin(), o admin não enxerga
-- linha nenhuma de tenant.
