-- Create a function to detect and report duplicate customers
CREATE OR REPLACE FUNCTION public.detect_duplicate_customers(
  p_reseller_id UUID DEFAULT NULL
)
RETURNS TABLE(
  customer1_id UUID,
  customer1_name TEXT,
  customer1_email TEXT,
  customer2_id UUID,
  customer2_name TEXT,
  customer2_email TEXT,
  match_type TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH normalized_customers AS (
    SELECT 
      id,
      name,
      email,
      LOWER(TRIM(email)) as normalized_email,
      LOWER(TRIM(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s]', '', 'g'))) as normalized_name,
      customer_group,
      reseller_id
    FROM public.customers
    WHERE status != 'cancelled'
    AND (p_reseller_id IS NULL OR reseller_id = p_reseller_id)
  )
  SELECT DISTINCT
    c1.id as customer1_id,
    c1.name as customer1_name,
    c1.email as customer1_email,
    c2.id as customer2_id,
    c2.name as customer2_name,
    c2.email as customer2_email,
    CASE 
      WHEN c1.normalized_email = c2.normalized_email THEN 'exact_email_match'
      WHEN c1.normalized_name = c2.normalized_name THEN 'exact_name_match'
      ELSE 'similar'
    END as match_type
  FROM normalized_customers c1
  INNER JOIN normalized_customers c2 
    ON c1.reseller_id = c2.reseller_id
    AND c1.id < c2.id  -- Avoid duplicate pairs and self-matches
    AND (c1.customer_group IS NULL OR c2.customer_group IS NULL OR c1.customer_group != c2.customer_group)  -- Exclude already consolidated customers
    AND (
      c1.normalized_email = c2.normalized_email  -- Same email
      OR c1.normalized_name = c2.normalized_name  -- Same name (normalized)
    )
  ORDER BY customer1_name, customer2_name;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.detect_duplicate_customers TO authenticated;

-- Create an index to improve duplicate detection performance
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON public.customers (LOWER(TRIM(email)));
CREATE INDEX IF NOT EXISTS idx_customers_name_normalized ON public.customers (LOWER(TRIM(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s]', '', 'g'))));

COMMENT ON FUNCTION public.detect_duplicate_customers IS 'Detects potential duplicate customers based on email and name similarity to prevent double charges during renewals';