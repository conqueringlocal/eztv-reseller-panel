
-- Create a function to calculate total credits required for renewal based on customer grouping
CREATE OR REPLACE FUNCTION public.calculate_renewal_credits_required(
  customer_id_param uuid,
  duration_months integer
) RETURNS TABLE(
  credits_required integer,
  accounts_count integer,
  customer_group_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  customer_group_val text;
  accounts_in_group integer;
BEGIN
  -- Get the customer group for the given customer
  SELECT customer_group INTO customer_group_val
  FROM public.customers
  WHERE id = customer_id_param;
  
  -- Count all accounts in the same customer group
  SELECT COUNT(*) INTO accounts_in_group
  FROM public.customers
  WHERE customer_group = customer_group_val
  AND status != 'cancelled';
  
  -- Return the calculated values
  RETURN QUERY SELECT 
    accounts_in_group * duration_months as credits_required,
    accounts_in_group as accounts_count,
    customer_group_val as customer_group_name;
END;
$$;

-- Create a function to renew all accounts in a customer group
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
  accounts_count integer;
  credits_needed integer;
  reseller_credits integer;
  renewal_record RECORD;
BEGIN
  -- Get customer group
  SELECT customer_group INTO customer_group_val
  FROM public.customers
  WHERE id = customer_id_param;
  
  IF customer_group_val IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 'Customer not found'::text;
    RETURN;
  END IF;
  
  -- Calculate requirements
  SELECT credits_required, accounts_count INTO credits_needed, accounts_count
  FROM public.calculate_renewal_credits_required(customer_id_param, duration_months);
  
  -- Check reseller credits
  SELECT credits INTO reseller_credits
  FROM public.profiles
  WHERE id = reseller_id_param;
  
  IF reseller_credits < credits_needed THEN
    RETURN QUERY SELECT false, 0, 0, 'Insufficient credits'::text;
    RETURN;
  END IF;
  
  -- Update all accounts in the group
  UPDATE public.customers
  SET 
    expiration_date = expiration_date + (duration_months || ' months')::interval,
    plan_duration = duration_months,
    status = 'active',
    updated_at = now()
  WHERE customer_group = customer_group_val
  AND status != 'cancelled';
  
  -- Deduct credits from reseller
  UPDATE public.profiles
  SET credits = credits - credits_needed
  WHERE id = reseller_id_param;
  
  -- Return success
  RETURN QUERY SELECT true, accounts_count, credits_needed, NULL::text;
END;
$$;
