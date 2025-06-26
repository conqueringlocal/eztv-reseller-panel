
-- Create a simple function to increment user credits
CREATE OR REPLACE FUNCTION public.increment_user_credits(user_id uuid, credit_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits + credit_amount
  WHERE id = user_id;
END;
$$;
