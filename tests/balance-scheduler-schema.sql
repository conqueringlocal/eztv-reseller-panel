-- Local-only stubs: never make outbound HTTP requests or install a scheduler in tests.
CREATE SCHEMA vault;
CREATE TABLE vault.secrets(id uuid DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT name,secret decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(secret text,name text,description text) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(secret,name) VALUES($1,$2) RETURNING id $$;
CREATE SCHEMA net;
CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE SCHEMA cron;
CREATE FUNCTION cron.schedule(name text,schedule text,command text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
