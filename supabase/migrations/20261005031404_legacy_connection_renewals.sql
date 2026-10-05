BEGIN;
CREATE OR REPLACE FUNCTION public.trex_customer_lines(p public.customers) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE lines jsonb:=coalesce(p.connection_list,'[]');
BEGIN
 IF jsonb_typeof(lines)<>'array' THEN RAISE EXCEPTION 'Invalid connection list'; END IF;
 -- An explicit connection 1 makes the saved list authoritative. Credential edits
 -- update this list; the legacy top-level login can be stale and is not an extra line.
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE l->>'connection_number'='1')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE l->>'username'=p.username OR (p.mac_address IS NOT NULL AND l->>'mac_address'=p.mac_address)) THEN
  lines:=jsonb_build_array(jsonb_build_object('connection_number',1,'username',p.username,'password',p.password,'mac_address',p.mac_address,'m3u_url',p.m3u_url,'expiration_date',p.expiration_date,'status',p.status))||lines;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE jsonb_typeof(l)<>'object' OR coalesce(l->>'connection_number','') !~ '^[1-9][0-9]?$') THEN RAISE EXCEPTION 'Connection details require review'; END IF;
 SELECT jsonb_agg(l||jsonb_build_object('customerId',p.id,'expiration_date',coalesce(l->>'expiration_date',p.expiration_date::text)) ORDER BY (l->>'connection_number')::integer) INTO lines FROM jsonb_array_elements(lines) l;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE (nullif(l->>'username','') IS NULL OR nullif(l->>'password','') IS NULL) AND nullif(l->>'mac_address','') IS NULL) OR (SELECT count(DISTINCT l->>'connection_number') FROM jsonb_array_elements(lines) l)<>jsonb_array_length(lines) THEN RAISE EXCEPTION 'Connection details require review'; END IF;
 RETURN lines;
END $$;
CREATE OR REPLACE FUNCTION public.finish_trex_paid_operation(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 -- A single-line renewal must report that line's new date, not the earliest
 -- date of an unrelated (possibly expired) connection on the customer.
 SELECT min((r->>'expiration_date')::date) INTO expiration FROM jsonb_array_elements(op.receipts) r;
 result:=jsonb_build_object('success',true,'requestId',op.id,'creditsUsed',op.credits_reserved,'connection_number',op.connection_number,'newExpirationDate',expiration,'message','Trex operation completed.');
 UPDATE public.trex_paid_operations SET state='completed',response=result,updated_at=now() WHERE id=op.id;
 UPDATE public.credit_logs SET notes='Confirmed Trex '||op.kind||' request '||op.id WHERE reseller_id=op.reseller_id AND notes='Reserved for Trex '||op.kind||' request '||op.id||'; pending provider confirmation';
 RETURN result;
END $$;
-- CREATE OR REPLACE preserves existing service-only execution grants.
COMMIT;
