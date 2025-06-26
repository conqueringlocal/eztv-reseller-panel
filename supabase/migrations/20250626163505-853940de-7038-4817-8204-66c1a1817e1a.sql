
-- Add grouping columns to customers table to support connection consolidation
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS customer_group TEXT,
ADD COLUMN IF NOT EXISTS connection_sequence INTEGER DEFAULT 1;

-- Create an index for better performance when grouping customers
CREATE INDEX IF NOT EXISTS idx_customers_group ON public.customers(customer_group, reseller_id);

-- Update existing customers to have proper grouping
-- Group by email and reseller_id to identify customers with multiple connections
UPDATE public.customers 
SET customer_group = CONCAT(LOWER(email), '_', reseller_id::text)
WHERE customer_group IS NULL;

-- Set connection sequence numbers for grouped customers
WITH numbered_connections AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY customer_group 
      ORDER BY created_at ASC
    ) as seq_num
  FROM public.customers
  WHERE customer_group IS NOT NULL
)
UPDATE public.customers c
SET connection_sequence = nc.seq_num
FROM numbered_connections nc
WHERE c.id = nc.id;

-- Make customer_group NOT NULL after setting values
ALTER TABLE public.customers 
ALTER COLUMN customer_group SET NOT NULL;
