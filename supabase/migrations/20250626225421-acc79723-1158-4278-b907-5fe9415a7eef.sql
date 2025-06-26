
-- Fix the renew_customer_group function to remove the non-existent updated_at column
CREATE OR REPLACE FUNCTION public.renew_customer_group(
  customer_id_param uuid,
  duration_months integer,
  reseller_id_param uuid
) RETURNS TABLE(
  success boolean,
  accounts_renewed integer,
  credits_used integer,
  error_message text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  customer_group_val text;
  accounts_count_val integer;
  credits_needed integer;
  reseller_credits integer;
BEGIN
  -- Get customer group
  SELECT customer_group INTO customer_group_val
  FROM public.customers
  WHERE id = customer_id_param;
  
  IF customer_group_val IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 'Customer not found'::text;
    RETURN;
  END IF;
  
  -- Calculate requirements using the existing function
  SELECT cr.credits_required, cr.accounts_count 
  INTO credits_needed, accounts_count_val
  FROM public.calculate_renewal_credits_required(customer_id_param, duration_months) cr;
  
  -- Check reseller credits
  SELECT credits INTO reseller_credits
  FROM public.profiles
  WHERE id = reseller_id_param;
  
  IF reseller_credits < credits_needed THEN
    RETURN QUERY SELECT false, 0, 0, 'Insufficient credits'::text;
    RETURN;
  END IF;
  
  -- Update all accounts in the group (removed updated_at column reference)
  UPDATE public.customers
  SET 
    expiration_date = expiration_date + (duration_months || ' months')::interval,
    plan_duration = duration_months,
    status = 'active'
  WHERE customer_group = customer_group_val
  AND status != 'cancelled';
  
  -- Deduct credits from reseller
  UPDATE public.profiles
  SET credits = credits - credits_needed
  WHERE id = reseller_id_param;
  
  -- Log the credit usage
  INSERT INTO public.credit_logs (
    reseller_id,
    action,
    credits_used,
    customer_name,
    customer_id,
    notes
  ) VALUES (
    reseller_id_param,
    'account_creation',
    credits_needed,
    (SELECT name FROM public.customers WHERE id = customer_id_param LIMIT 1),
    customer_id_param,
    'Group renewal for ' || accounts_count_val || ' accounts'
  );
  
  -- Return success
  RETURN QUERY SELECT true, accounts_count_val, credits_needed, NULL::text;
END;
$$;
