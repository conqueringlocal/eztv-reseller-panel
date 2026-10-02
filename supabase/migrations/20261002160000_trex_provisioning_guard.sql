-- Apply this file alone to V1. Never replay this repository's historical migrations.
-- Recovery receipts contain credentials: service-role access only, never client access.
BEGIN;

CREATE TABLE public.trex_provisioning_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.profiles(id),
  fingerprint text NOT NULL,
  request_data jsonb NOT NULL,
  charge_credits boolean NOT NULL,
  state text NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'completed', 'review_required', 'resolved')),
  receipts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(receipts) = 'array'),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trex_one_unresolved_request_per_reseller
  ON public.trex_provisioning_requests(reseller_id)
  WHERE state IN ('processing', 'review_required');
CREATE INDEX trex_recent_requests ON public.trex_provisioning_requests(reseller_id, fingerprint, created_at DESC);
ALTER TABLE public.trex_provisioning_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trex_provisioning_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.trex_provisioning_requests TO service_role;

CREATE FUNCTION public.claim_trex_provisioning(p_reseller_id uuid, p_customer jsonb, p_charge_credits boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing public.trex_provisioning_requests;
  request public.trex_provisioning_requests;
  balance integer;
  required integer;
  identity_key text;
BEGIN
  -- A database lock, not a read-before-write check, serializes concurrent requests.
  SELECT credits INTO balance FROM public.profiles WHERE id = p_reseller_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reseller not found'; END IF;
  IF (p_customer->>'connections')::integer NOT BETWEEN 1 AND 5
    OR (p_customer->>'planDuration')::integer NOT IN (1, 3, 6, 12)
    OR nullif(trim(p_customer->>'name'), '') IS NULL
    OR nullif(trim(p_customer->>'email'), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid customer request';
  END IF;
  identity_key := md5(jsonb_build_array(
    lower(regexp_replace(trim(p_customer->>'name'), '\s+', ' ', 'g')),
    lower(trim(p_customer->>'email')), coalesce(p_customer->>'operationKey', 'create')
  )::text);
  -- Unknown outcomes never expire or get retried automatically, even with changed form data.
  SELECT * INTO existing FROM public.trex_provisioning_requests
    WHERE reseller_id = p_reseller_id AND state IN ('processing', 'review_required')
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'requestId', existing.id,
      'state', existing.state, 'response', existing.response);
  END IF;
  -- Also suppress a completed request replayed from another tab, device, or refreshed form.
  SELECT * INTO existing FROM public.trex_provisioning_requests
    WHERE reseller_id = p_reseller_id AND fingerprint = identity_key AND state = 'completed'
      AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'requestId', existing.id,
      'state', existing.state, 'response', existing.response);
  END IF;
  required := public.calculate_credits_required(
    (p_customer->>'connections')::integer, (p_customer->>'planDuration')::integer);
  IF required IS NULL OR required < 1 THEN RAISE EXCEPTION 'Invalid credit calculation'; END IF;
  IF p_charge_credits AND (balance IS NULL OR balance < required) THEN
    RETURN jsonb_build_object('claimed', false, 'state', 'insufficient_credits',
      'required', required, 'available', coalesce(balance, 0));
  END IF;
  INSERT INTO public.trex_provisioning_requests(reseller_id, fingerprint, request_data, charge_credits)
    VALUES (p_reseller_id, identity_key, p_customer, p_charge_credits) RETURNING * INTO request;
  RETURN jsonb_build_object('claimed', true, 'requestId', request.id);
END;
$$;

CREATE FUNCTION public.finish_trex_provisioning(p_request_id uuid, p_error_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  request public.trex_provisioning_requests;
  customer jsonb;
  first_line jsonb;
  lines jsonb;
  line_count integer;
  required integer;
  balance integer;
  saved_id uuid;
  complete boolean;
  result jsonb;
BEGIN
  SELECT * INTO request FROM public.trex_provisioning_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown provisioning request'; END IF;
  -- Finalizing twice never inserts or charges twice.
  IF request.response IS NOT NULL THEN RETURN request.response; END IF;
  IF request.state <> 'processing' THEN RAISE EXCEPTION 'Request requires manual review'; END IF;
  customer := request.request_data;
  line_count := jsonb_array_length(request.receipts);
  IF line_count > (customer->>'connections')::integer THEN RAISE EXCEPTION 'Too many receipts'; END IF;
  required := CASE WHEN request.charge_credits THEN line_count * (customer->>'planDuration')::integer ELSE 0 END;
  complete := line_count = (customer->>'connections')::integer AND p_error_code IS NULL;
  IF line_count > 0 THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(request.receipts) AS r
      WHERE nullif(r->>'username', '') IS NULL OR nullif(r->>'password', '') IS NULL
        OR nullif(r->>'m3uUrl', '') IS NULL) THEN RAISE EXCEPTION 'Incomplete receipt'; END IF;
    IF (SELECT count(DISTINCT r->>'username') FROM jsonb_array_elements(request.receipts) AS r) <> line_count
      THEN RAISE EXCEPTION 'Duplicate provider receipt'; END IF;
    SELECT credits INTO balance FROM public.profiles WHERE id = request.reseller_id FOR UPDATE;
    IF request.charge_credits AND (balance IS NULL OR balance < required) THEN
      -- Retained receipts + unresolved guard allow reconciliation without buying again.
      RAISE EXCEPTION 'Credit balance changed; manual reconciliation required';
    END IF;
    first_line := request.receipts->0;
    SELECT jsonb_agg(jsonb_build_object(
      'connection_number', n, 'username', r->>'username', 'password', r->>'password',
      'm3u_url', r->>'m3uUrl', 'status', 'active', 'device_type', customer->>'deviceType',
      'mac_address', NULL) ORDER BY n)
      INTO lines FROM jsonb_array_elements(request.receipts) WITH ORDINALITY AS t(r, n);
    INSERT INTO public.customers(reseller_id, name, email, username, password, device_type,
      package_id, plan_duration, max_connections, current_connections, connection_details,
      start_date, expiration_date, status, is_deactivated, provider, customer_group,
      customer_group_id, m3u_url, connection_sequence, total_connections, connection_list)
    VALUES (request.reseller_id, customer->>'name', customer->>'email', first_line->>'username',
      first_line->>'password', customer->>'deviceType', customer->>'packageId',
      (customer->>'planDuration')::integer, line_count, 0, '[]'::jsonb,
      request.created_at::date, (request.created_at + make_interval(months => (customer->>'planDuration')::integer))::date,
      'active', false, 'trex', 'trex_' || request.id::text, first_line->>'accountRef',
      first_line->>'m3uUrl', 1, line_count, lines) RETURNING id INTO saved_id;
    IF required > 0 THEN
      UPDATE public.profiles SET credits = credits - required WHERE id = request.reseller_id;
    END IF;
    IF NOT coalesce((customer->>'skipCredits')::boolean, false) THEN
      INSERT INTO public.credit_logs(reseller_id, action, credits_used, connections_used,
        customer_id, customer_name, notes)
      VALUES (request.reseller_id, 'account_creation', required, line_count, saved_id,
        customer->>'name', 'Trex request ' || request.id::text || '; ' || line_count || ' confirmed connections');
    END IF;
  END IF;
  result := jsonb_build_object('success', complete, 'requestId', request.id, 'customerId', saved_id,
    'customerCount', line_count, 'creditsUsed', required, 'needsReview', NOT complete,
    'code', CASE WHEN complete THEN 'created' ELSE coalesce(p_error_code, 'review_required') END,
    'error', CASE WHEN complete THEN NULL ELSE
      'The creation attempt needs review. Do not create this customer again; contact support with the request reference.' END);
  UPDATE public.trex_provisioning_requests SET
    state = CASE WHEN complete THEN 'completed' ELSE 'review_required' END,
    response = result, updated_at = now() WHERE id = request.id;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_trex_provisioning(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_trex_provisioning(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trex_provisioning(uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_trex_provisioning(uuid, text) TO service_role;
COMMIT;
