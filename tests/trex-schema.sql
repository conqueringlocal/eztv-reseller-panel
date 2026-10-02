-- Minimal isolated fixture matching the legacy columns used by the guard.
-- The test runner only loads this into its newly created, network-isolated container.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE profiles (id uuid PRIMARY KEY, credits integer NOT NULL, name text);
CREATE TYPE credit_action AS ENUM ('addition', 'account_creation');
CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reseller_id uuid NOT NULL REFERENCES profiles,
 name text NOT NULL, email text NOT NULL, username text, password text, device_type text NOT NULL,
 package_id text, plan_duration integer NOT NULL, max_connections integer, current_connections integer,
 connection_details jsonb, start_date date NOT NULL, expiration_date date NOT NULL, status text,
 is_deactivated boolean, provider text, customer_group text NOT NULL, customer_group_id text,
 m3u_url text, connection_sequence integer, total_connections integer, connection_list jsonb
);
CREATE TABLE credit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reseller_id uuid REFERENCES profiles,
 action credit_action, credits_used integer NOT NULL, connections_used integer,
 customer_id uuid REFERENCES customers, customer_name text, notes text, date timestamptz DEFAULT now()
);
CREATE FUNCTION calculate_credits_required(connections integer, duration_months integer)
 RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT connections * duration_months $$;
