-- Papel dono: roda migração, é dono das tabelas, IGNORA RLS.
CREATE ROLE brutus_owner LOGIN PASSWORD 'owner';

-- Papel da aplicação: só DML, jamais dono. É sobre ele que o RLS age.
CREATE ROLE brutus_app LOGIN PASSWORD 'app';

CREATE DATABASE brutus      OWNER brutus_owner;
CREATE DATABASE brutus_test OWNER brutus_owner;

\connect brutus
GRANT USAGE ON SCHEMA public TO brutus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_app;

\connect brutus_test
GRANT USAGE ON SCHEMA public TO brutus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE brutus_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brutus_app;
