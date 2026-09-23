-- Provisionamento do banco de desenvolvimento, espelhando o do homelab
-- (helm/postgres/app-db-prumo.yml): um database + um role NÃO-superusuário por app.
--
-- Isso não é detalhe de conforto: superusuário IGNORA Row Level Security, mesmo com
-- FORCE. Se o app conectasse como superusuário em dev, a RLS ficaria decorativa aqui
-- e só falharia em produção. CREATEDB existe só para o shadow database do
-- `prisma migrate dev` — em produção roda `migrate deploy`, que não precisa dele.
CREATE ROLE prumo LOGIN PASSWORD 'prumo' NOSUPERUSER CREATEDB;
CREATE DATABASE prumo OWNER prumo;
