BEGIN;
CREATE TABLE public.trex_paid_operations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.customers, reseller_id uuid NOT NULL REFERENCES public.profiles,
 client_key uuid,
 kind text NOT NULL CHECK(kind IN ('renew','single','add')), months integer NOT NULL CHECK(months IN (1,3,6,12)), connection_number integer,
 state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','review_required','completed','resolved')),
 credits_reserved integer NOT NULL, lines jsonb NOT NULL, receipts jsonb NOT NULL DEFAULT '[]', response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trex_paid_client_key ON public.trex_paid_operations(reseller_id,client_key);
CREATE UNIQUE INDEX trex_paid_unresolved_reseller ON public.trex_paid_operations(reseller_id) WHERE state IN ('processing','review_required');
CREATE INDEX trex_paid_customer_recent ON public.trex_paid_operations(customer_id,created_at DESC);
ALTER TABLE public.trex_paid_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trex_paid_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.trex_paid_operations TO service_role;
-- Canonical list includes primary exactly once; older lists may contain only secondary lines.
CREATE FUNCTION public.trex_customer_lines(p public.customers) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lines jsonb:=coalesce(p.connection_list,'[]');
BEGIN
 IF jsonb_typeof(lines)<>'array' THEN RAISE EXCEPTION 'Invalid connection list'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE l->>'username'=p.username OR (p.mac_address IS NOT NULL AND l->>'mac_address'=p.mac_address)) THEN
  lines:=jsonb_build_array(jsonb_build_object('connection_number',1,'username',p.username,'password',p.password,'mac_address',p.mac_address,'m3u_url',p.m3u_url,'expiration_date',p.expiration_date,'status',p.status))||lines;
 END IF;
 SELECT jsonb_agg(l||jsonb_build_object('customerId',p.id,'expiration_date',coalesce(l->>'expiration_date',p.expiration_date::text)) ORDER BY (l->>'connection_number')::integer) INTO lines FROM jsonb_array_elements(lines) l;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE (nullif(l->>'username','') IS NULL OR nullif(l->>'password','') IS NULL) AND nullif(l->>'mac_address','') IS NULL) OR (SELECT count(DISTINCT l->>'connection_number') FROM jsonb_array_elements(lines) l)<>jsonb_array_length(lines) THEN RAISE EXCEPTION 'Connection details require review'; END IF;
 RETURN lines;
END $$;
CREATE FUNCTION public.claim_trex_paid_operation(p_customer uuid,p_actor uuid,p_internal boolean,p_kind text,p_months integer,p_connection integer DEFAULT NULL,p_client_key uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.customers; member public.customers; p public.profiles; op public.trex_paid_operations; v_lines jsonb:='[]'; needed integer; admin boolean; recent public.trex_paid_operations;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('renew','single','add') OR p_months IS NULL OR p_months NOT IN (1,3,6,12) THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 SELECT * INTO c FROM public.customers WHERE id=p_customer;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
 admin:=NOT p_internal AND public.has_role(p_actor,'admin');
 IF NOT coalesce(p_internal,false) AND NOT coalesce(admin,false) AND c.reseller_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF c.provider IS DISTINCT FROM 'trex' THEN RAISE EXCEPTION 'Only Trex is supported'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=c.reseller_id FOR UPDATE;
 SELECT * INTO op FROM public.trex_paid_operations WHERE reseller_id=p.id AND client_key=p_client_key;
 IF FOUND THEN
  IF op.customer_id<>c.id OR op.kind<>p_kind OR op.months<>p_months OR (p_kind='single' AND op.connection_number IS DISTINCT FROM p_connection) THEN RAISE EXCEPTION 'Operation reference conflict'; END IF;
  RETURN jsonb_build_object('claimed',false,'requestId',op.id,'state',op.state,'response',op.response);
 END IF;
 IF EXISTS(SELECT 1 FROM public.trex_provisioning_requests WHERE reseller_id=p.id AND state IN ('processing','review_required')) THEN RAISE EXCEPTION 'A creation attempt needs review; contact support'; END IF;
 SELECT * INTO op FROM public.trex_paid_operations WHERE reseller_id=p.id AND state IN ('processing','review_required') LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('claimed',false,'requestId',op.id,'state',op.state); END IF;
 -- Historical uncertain renewals must be reconciled rather than automatically re-run.
 IF EXISTS(SELECT 1 FROM public.renewal_transactions r JOIN public.customers rc ON rc.id=r.customer_id WHERE r.status='pending' AND rc.reseller_id=c.reseller_id AND (rc.id=c.id OR (nullif(c.customer_group,'') IS NOT NULL AND rc.customer_group=c.customer_group))) THEN RAISE EXCEPTION 'An earlier renewal needs review; contact support'; END IF;
 FOR member IN SELECT * FROM public.customers WHERE reseller_id=c.reseller_id AND (id=c.id OR (p_kind='renew' AND nullif(c.customer_group,'') IS NOT NULL AND customer_group=c.customer_group)) ORDER BY id FOR UPDATE LOOP
  IF member.provider IS DISTINCT FROM 'trex' THEN RAISE EXCEPTION 'Mixed provider group requires review'; END IF;
  v_lines:=v_lines||public.trex_customer_lines(member);
 END LOOP;
 IF p_kind='single' THEN
  SELECT coalesce(jsonb_agg(l),'[]') INTO v_lines FROM jsonb_array_elements(v_lines) l WHERE (l->>'connection_number')::integer=p_connection;
  IF jsonb_array_length(v_lines)<>1 THEN RAISE EXCEPTION 'Connection not found'; END IF;
 ELSIF p_kind='add' THEN
  IF jsonb_array_length(v_lines)>=5 OR coalesce(c.total_connections,1)>jsonb_array_length(v_lines) THEN RAISE EXCEPTION 'Connection limit reached or existing connections require review'; END IF;
  SELECT coalesce(max((l->>'connection_number')::integer),0)+1 INTO p_connection FROM jsonb_array_elements(v_lines) l;
  v_lines:=jsonb_build_array(jsonb_build_object('customerId',c.id,'connection_number',p_connection));
 END IF;
 IF jsonb_array_length(v_lines) NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Invalid connection count'; END IF;
 IF p_kind<>'add' AND (SELECT count(DISTINCT coalesce(l->>'username',l->>'mac_address')) FROM jsonb_array_elements(v_lines) l)<>jsonb_array_length(v_lines) THEN RAISE EXCEPTION 'Duplicate connection details require review'; END IF;
 -- Suppress refreshed forms and overlapping single/group renewals for a full day.
 SELECT * INTO recent FROM public.trex_paid_operations o WHERE o.reseller_id=p.id AND o.state='completed' AND o.created_at>now()-interval '24 hours' AND
  ((p_kind='add' AND o.kind='add' AND o.customer_id=c.id) OR (p_kind<>'add' AND o.kind<>'add' AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) oldline JOIN jsonb_array_elements(v_lines) newline ON oldline->>'customerId'=newline->>'customerId' AND oldline->>'connection_number'=newline->>'connection_number'))) ORDER BY o.created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('claimed',false,'requestId',recent.id,'state','recently_completed'); END IF;
 needed:=CASE WHEN admin THEN 0 ELSE jsonb_array_length(v_lines)*p_months END;
 IF p.credits<needed THEN RETURN jsonb_build_object('claimed',false,'state','insufficient_credits','required',needed,'available',p.credits); END IF;
 INSERT INTO public.trex_paid_operations(customer_id,reseller_id,kind,months,connection_number,credits_reserved,lines,client_key) VALUES(c.id,p.id,p_kind,p_months,p_connection,needed,v_lines,p_client_key) RETURNING * INTO op;
 UPDATE public.profiles SET credits=credits-needed WHERE id=p.id;
 INSERT INTO public.credit_logs(reseller_id,action,credits_used,connections_used,customer_id,customer_name,notes) VALUES(p.id,'deduction',needed,jsonb_array_length(v_lines),c.id,c.name,'Reserved for Trex '||p_kind||' request '||op.id||'; pending provider confirmation');
 RETURN jsonb_build_object('claimed',true,'requestId',op.id,'lines',v_lines,'resellerId',p.id,'customerName',c.name,'resellerName',p.name,'packageId',c.package_id,'deviceType',c.device_type,'connectionNumber',p_connection);
END $$;
CREATE FUNCTION public.finish_trex_paid_operation(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op public.trex_paid_operations; c public.customers; lines jsonb; receipt jsonb; expiration date; result jsonb;
BEGIN
 SELECT * INTO op FROM public.trex_paid_operations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown request'; END IF;
 IF op.state='completed' THEN RETURN op.response; END IF;
 IF op.state<>'processing' OR jsonb_array_length(op.receipts)<>jsonb_array_length(op.lines) THEN RAISE EXCEPTION 'Provider receipts require review'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(op.receipts) r WHERE nullif(r->>'expiration_date','') IS NULL OR r->>'confirmed'<>'true') THEN RAISE EXCEPTION 'Provider expiry must be verified'; END IF;
 FOR c IN SELECT * FROM public.customers WHERE id IN (SELECT (l->>'customerId')::uuid FROM jsonb_array_elements(op.lines) l) ORDER BY id FOR UPDATE LOOP
  lines:=public.trex_customer_lines(c);
  FOR receipt IN SELECT * FROM jsonb_array_elements(op.receipts) r WHERE r->>'customerId'=c.id::text LOOP
   IF op.kind='add' THEN lines:=lines||jsonb_build_array(receipt);
   ELSE SELECT jsonb_agg(CASE WHEN l->>'connection_number'=receipt->>'connection_number' THEN l||receipt ELSE l END ORDER BY (l->>'connection_number')::integer) INTO lines FROM jsonb_array_elements(lines) l; END IF;
  END LOOP;
  SELECT min((l->>'expiration_date')::date) INTO expiration FROM jsonb_array_elements(lines) l;
  UPDATE public.customers SET connection_list=lines,expiration_date=expiration,status=CASE WHEN expiration<current_date THEN 'expired' ELSE 'active' END,is_deactivated=false,plan_duration=op.months,total_connections=jsonb_array_length(lines),max_connections=jsonb_array_length(lines) WHERE id=c.id;
 END LOOP;
 result:=jsonb_build_object('success',true,'requestId',op.id,'creditsUsed',op.credits_reserved,'connection_number',op.connection_number,'newExpirationDate',expiration,'message','Trex operation completed.');
 UPDATE public.trex_paid_operations SET state='completed',response=result,updated_at=now() WHERE id=op.id;
 UPDATE public.credit_logs SET notes='Confirmed Trex '||op.kind||' request '||op.id WHERE reseller_id=op.reseller_id AND notes='Reserved for Trex '||op.kind||' request '||op.id||'; pending provider confirmation';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.trex_customer_lines(public.customers),public.claim_trex_paid_operation(uuid,uuid,boolean,text,integer,integer,uuid),public.finish_trex_paid_operation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trex_customer_lines(public.customers),public.claim_trex_paid_operation(uuid,uuid,boolean,text,integer,integer,uuid),public.finish_trex_paid_operation(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.calculate_renewal_credits_required(customer_id_param uuid,duration_months integer)
RETURNS TABLE(credits_required integer,accounts_count integer,customer_group_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.customers; n integer;
BEGIN
 SELECT * INTO c FROM public.customers WHERE id=customer_id_param;
 IF NOT FOUND OR (c.reseller_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF duration_months IS NULL OR duration_months NOT IN(1,3,6,12) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
 SELECT sum(jsonb_array_length(public.trex_customer_lines(member)))::integer INTO n FROM public.customers member WHERE member.reseller_id=c.reseller_id AND (member.id=c.id OR (nullif(c.customer_group,'') IS NOT NULL AND member.customer_group=c.customer_group));
 RETURN QUERY SELECT CASE WHEN public.is_admin() THEN 0 ELSE n*duration_months END,n,c.customer_group;
END $$;
REVOKE ALL ON FUNCTION public.calculate_renewal_credits_required(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_renewal_credits_required(uuid,integer) TO authenticated;
CREATE FUNCTION public.get_operation_review_queue() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator required'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x->>'created_at') FROM (
 SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'customer_id',customer_id,'kind',kind,'state',state,'created_at',created_at,'reserved_credits',credits_reserved,'confirmed_lines',jsonb_array_length(receipts)) x FROM public.trex_paid_operations WHERE state IN('processing','review_required')
 UNION ALL SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'kind','creation','state',state,'created_at',created_at,'confirmed_lines',jsonb_array_length(receipts)) FROM public.trex_provisioning_requests WHERE state IN('processing','review_required')
 UNION ALL SELECT jsonb_build_object('id',id,'reseller_id',reseller_id,'customer_id',customer_id,'kind','historical renewal','state','review_required','created_at',created_at,'reserved_credits',NULL,'confirmed_lines',NULL) FROM public.renewal_transactions WHERE status='pending'
 ) q),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.get_operation_review_queue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_operation_review_queue() TO authenticated;
-- Prevent browser edits from invalidating an operation snapshot in flight.
CREATE FUNCTION public.protect_customer_operation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN('anon','authenticated') AND EXISTS(SELECT 1 FROM public.trex_paid_operations WHERE reseller_id=OLD.reseller_id AND state IN('processing','review_required')) THEN RAISE EXCEPTION 'Resolve pending provider operation first'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
-- Use a definer lookup helper so the trigger does not expose the receipt ledger.
CREATE FUNCTION public.customer_operation_pending(p_reseller uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.trex_paid_operations WHERE reseller_id=p_reseller AND state IN('processing','review_required')) $$;
REVOKE ALL ON FUNCTION public.customer_operation_pending(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_operation_pending(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.protect_customer_operation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN('anon','authenticated') AND public.customer_operation_pending(OLD.reseller_id) THEN RAISE EXCEPTION 'Resolve pending provider operation first'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_customer_operation BEFORE UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.protect_customer_operation();

CREATE OR REPLACE FUNCTION public.claim_trex_provisioning(p_reseller_id uuid, p_customer jsonb, p_charge_credits boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT id INTO request.id FROM public.trex_paid_operations WHERE reseller_id=p_reseller_id AND state IN ('processing','review_required') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('claimed',false,'requestId',request.id,'state','review_required'); END IF;
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
$function$
;
COMMIT;
