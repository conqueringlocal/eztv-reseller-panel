BEGIN;
-- Preserve recent-renewal protection when a saved connection is renumbered.
-- Keep the original number check as a conservative guard for credential edits.
CREATE OR REPLACE FUNCTION public.claim_trex_paid_operation(p_customer uuid,p_actor uuid,p_internal boolean,p_kind text,p_months integer,p_connection integer DEFAULT NULL,p_client_key uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  ((p_kind='add' AND o.kind='add' AND o.customer_id=c.id) OR (p_kind<>'add' AND o.kind<>'add' AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) oldline JOIN jsonb_array_elements(v_lines) newline ON oldline->>'customerId'=newline->>'customerId' AND (
   oldline->>'connection_number'=newline->>'connection_number'
   OR (nullif(oldline->>'username','') IS NOT NULL AND oldline->>'username'=newline->>'username')
   OR (nullif(oldline->>'mac_address','') IS NOT NULL AND lower(oldline->>'mac_address')=lower(newline->>'mac_address'))
  )))) ORDER BY o.created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('claimed',false,'requestId',recent.id,'state','recently_completed'); END IF;
 needed:=CASE WHEN admin THEN 0 ELSE jsonb_array_length(v_lines)*p_months END;
 IF p.credits<needed THEN RETURN jsonb_build_object('claimed',false,'state','insufficient_credits','required',needed,'available',p.credits); END IF;
 INSERT INTO public.trex_paid_operations(customer_id,reseller_id,kind,months,connection_number,credits_reserved,lines,client_key) VALUES(c.id,p.id,p_kind,p_months,p_connection,needed,v_lines,p_client_key) RETURNING * INTO op;
 UPDATE public.profiles SET credits=credits-needed WHERE id=p.id;
 INSERT INTO public.credit_logs(reseller_id,action,credits_used,connections_used,customer_id,customer_name,notes) VALUES(p.id,'deduction',needed,jsonb_array_length(v_lines),c.id,c.name,'Reserved for Trex '||p_kind||' request '||op.id||'; pending provider confirmation');
 RETURN jsonb_build_object('claimed',true,'requestId',op.id,'lines',v_lines,'resellerId',p.id,'customerName',c.name,'resellerName',p.name,'packageId',c.package_id,'deviceType',c.device_type,'connectionNumber',p_connection);
END $$;
COMMIT;
