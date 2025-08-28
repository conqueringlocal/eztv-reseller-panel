-- Fix security warnings by adding search_path to functions

-- Fix generate_renewal_transaction_key function
CREATE OR REPLACE FUNCTION public.generate_renewal_transaction_key(
  p_customer_id UUID,
  p_plan_duration INTEGER,
  p_time_window_minutes INTEGER DEFAULT 5
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  time_bucket TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Create a time bucket to group requests within X minutes
  time_bucket := date_trunc('minute', NOW()) - (EXTRACT(MINUTE FROM NOW())::INTEGER % p_time_window_minutes) * INTERVAL '1 minute';
  
  RETURN p_customer_id::TEXT || '_' || p_plan_duration::TEXT || '_' || EXTRACT(EPOCH FROM time_bucket)::TEXT;
END;
$$;

-- Fix get_or_create_renewal_transaction function
CREATE OR REPLACE FUNCTION public.get_or_create_renewal_transaction(
  p_customer_id UUID,
  p_reseller_id UUID,
  p_plan_duration INTEGER,
  p_credits_required INTEGER
) RETURNS TABLE(
  transaction_id UUID,
  is_new_transaction BOOLEAN,
  current_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_transaction_key TEXT;
  v_existing_transaction RECORD;
  v_new_transaction_id UUID;
BEGIN
  -- Generate transaction key
  v_transaction_key := public.generate_renewal_transaction_key(p_customer_id, p_plan_duration);
  
  -- Try to find existing transaction
  SELECT id, status INTO v_existing_transaction
  FROM public.renewal_transactions
  WHERE transaction_key = v_transaction_key
  AND customer_id = p_customer_id;
  
  IF v_existing_transaction.id IS NOT NULL THEN
    -- Return existing transaction
    RETURN QUERY SELECT 
      v_existing_transaction.id,
      FALSE,
      v_existing_transaction.status;
  ELSE
    -- Create new transaction
    INSERT INTO public.renewal_transactions (
      customer_id,
      reseller_id,
      plan_duration,
      credits_required,
      transaction_key,
      status
    ) VALUES (
      p_customer_id,
      p_reseller_id,
      p_plan_duration,
      p_credits_required,
      v_transaction_key,
      'pending'
    ) RETURNING id INTO v_new_transaction_id;
    
    RETURN QUERY SELECT 
      v_new_transaction_id,
      TRUE,
      'pending'::TEXT;
  END IF;
END;
$$;

-- Fix complete_renewal_transaction function
CREATE OR REPLACE FUNCTION public.complete_renewal_transaction(
  p_transaction_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.renewal_transactions
  SET 
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_transaction_id
  AND status = 'pending';
  
  RETURN FOUND;
END;
$$;

-- Fix fail_renewal_transaction function
CREATE OR REPLACE FUNCTION public.fail_renewal_transaction(
  p_transaction_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.renewal_transactions
  SET 
    status = 'failed',
    completed_at = NOW(),
    rollback_reason = p_reason
  WHERE id = p_transaction_id
  AND status = 'pending';
  
  RETURN FOUND;
END;
$$;

-- Fix detect_duplicate_renewals function
CREATE OR REPLACE FUNCTION public.detect_duplicate_renewals(
  p_hours_back INTEGER DEFAULT 24
) RETURNS TABLE(
  customer_id UUID,
  customer_name TEXT,
  reseller_id UUID,
  duplicate_count INTEGER,
  total_excess_credits INTEGER,
  log_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  WITH duplicate_logs AS (
    SELECT 
      cl.customer_id,
      cl.reseller_id,
      cl.credits_used,
      COUNT(*) as occurrence_count,
      ARRAY_AGG(cl.id) as log_ids,
      -- Get customer name from first matching record
      (SELECT name FROM public.customers WHERE id = cl.customer_id LIMIT 1) as customer_name
    FROM public.credit_logs cl
    WHERE 
      cl.action = 'account_creation'
      AND cl.notes LIKE 'Group renewal for%'
      AND cl.date > (NOW() - (p_hours_back || ' hours')::INTERVAL)
      AND cl.customer_id IS NOT NULL
    GROUP BY 
      cl.customer_id, 
      cl.reseller_id, 
      cl.credits_used,
      DATE_TRUNC('minute', cl.date) -- Group by minute to catch rapid duplicates
    HAVING COUNT(*) > 1
  )
  SELECT 
    dl.customer_id,
    dl.customer_name,
    dl.reseller_id,
    (dl.occurrence_count - 1)::INTEGER as duplicate_count,
    ((dl.occurrence_count - 1) * dl.credits_used)::INTEGER as total_excess_credits,
    dl.log_ids
  FROM duplicate_logs dl;
END;
$$;

-- Fix refund_duplicate_charges function
CREATE OR REPLACE FUNCTION public.refund_duplicate_charges(
  p_reseller_id UUID,
  p_credits_to_refund INTEGER,
  p_reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Add credits back to reseller
  UPDATE public.profiles
  SET credits = credits + p_credits_to_refund
  WHERE id = p_reseller_id;
  
  -- Log the refund
  INSERT INTO public.credit_logs (
    reseller_id,
    action,
    credits_used,
    notes
  ) VALUES (
    p_reseller_id,
    'addition',
    p_credits_to_refund,
    'REFUND: ' || p_reason
  );
  
  RETURN TRUE;
END;
$$;