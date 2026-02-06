-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_or_create_renewal_transaction(uuid, uuid, integer, integer);

-- Recreate with api_calls_completed in return type
CREATE OR REPLACE FUNCTION public.get_or_create_renewal_transaction(p_customer_id uuid, p_reseller_id uuid, p_plan_duration integer, p_credits_required integer)
 RETURNS TABLE(transaction_id uuid, is_new_transaction boolean, current_status text, api_calls_completed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_transaction_key TEXT;
  v_existing_transaction RECORD;
  v_new_transaction_id UUID;
BEGIN
  -- Generate transaction key
  v_transaction_key := public.generate_renewal_transaction_key(p_customer_id, p_plan_duration);
  
  -- Try to find existing transaction
  SELECT id, status, renewal_transactions.api_calls_completed INTO v_existing_transaction
  FROM public.renewal_transactions
  WHERE transaction_key = v_transaction_key
  AND customer_id = p_customer_id;
  
  IF v_existing_transaction.id IS NOT NULL THEN
    -- Return existing transaction
    RETURN QUERY SELECT 
      v_existing_transaction.id,
      FALSE,
      v_existing_transaction.status,
      COALESCE(v_existing_transaction.api_calls_completed, FALSE);
  ELSE
    -- Create new transaction
    INSERT INTO public.renewal_transactions (
      customer_id,
      reseller_id,
      plan_duration,
      credits_required,
      transaction_key,
      status,
      api_calls_completed
    ) VALUES (
      p_customer_id,
      p_reseller_id,
      p_plan_duration,
      p_credits_required,
      v_transaction_key,
      'pending',
      FALSE
    ) RETURNING id INTO v_new_transaction_id;
    
    RETURN QUERY SELECT 
      v_new_transaction_id,
      TRUE,
      'pending'::TEXT,
      FALSE;
  END IF;
END;
$function$;