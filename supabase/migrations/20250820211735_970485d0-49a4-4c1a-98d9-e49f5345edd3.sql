CREATE OR REPLACE FUNCTION public.transfer_credits_to_sub_reseller(parent_reseller_id_param uuid, sub_reseller_id_param uuid, credits_to_transfer integer, notes_param text DEFAULT 'Credits received from parent reseller'::text)
 RETURNS TABLE(success boolean, error_message text, new_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  parent_credits integer;
  sub_reseller_current_credits integer;
  new_sub_reseller_balance integer;
BEGIN
  -- Check if parent has enough credits
  SELECT credits INTO parent_credits
  FROM public.profiles
  WHERE id = parent_reseller_id_param;
  
  IF parent_credits < credits_to_transfer THEN
    RETURN QUERY SELECT false, 'Insufficient credits'::text, 0;
    RETURN;
  END IF;
  
  -- Get current sub-reseller balance
  SELECT credits INTO sub_reseller_current_credits
  FROM public.profiles
  WHERE id = sub_reseller_id_param;
  
  -- Calculate new balance
  new_sub_reseller_balance := sub_reseller_current_credits + credits_to_transfer;
  
  -- Begin transaction
  -- Deduct credits from parent
  UPDATE public.profiles
  SET credits = credits - credits_to_transfer
  WHERE id = parent_reseller_id_param;
  
  -- Add credits to sub-reseller
  UPDATE public.profiles
  SET credits = credits + credits_to_transfer
  WHERE id = sub_reseller_id_param;
  
  -- Log the transfer for sub-reseller (addition)
  INSERT INTO public.credit_logs (
    reseller_id,
    action,
    credits_used,
    notes
  ) VALUES (
    sub_reseller_id_param,
    'addition',
    credits_to_transfer,
    notes_param
  );
  
  -- Log the transfer for parent (deduction instead of removal)
  INSERT INTO public.credit_logs (
    reseller_id,
    action,
    credits_used,
    notes
  ) VALUES (
    parent_reseller_id_param,
    'deduction',
    credits_to_transfer,
    'Credits transferred to sub-reseller'
  );
  
  RETURN QUERY SELECT true, NULL::text, new_sub_reseller_balance;
END;
$function$;