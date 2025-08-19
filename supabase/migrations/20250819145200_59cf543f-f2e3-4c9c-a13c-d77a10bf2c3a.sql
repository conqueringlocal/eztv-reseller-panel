-- Update the sample data to be more recent (2025) for better demonstration
UPDATE public.credit_logs 
SET date = CASE 
  WHEN date::text LIKE '2024-08%' THEN (date + INTERVAL '1 year')::timestamp with time zone
  WHEN date::text LIKE '2024-07%' THEN (date + INTERVAL '1 year')::timestamp with time zone  
  WHEN date::text LIKE '2024-06%' THEN (date + INTERVAL '1 year')::timestamp with time zone
  WHEN date::text LIKE '2024-05%' THEN (date + INTERVAL '1 year')::timestamp with time zone
  WHEN date::text LIKE '2024-04%' THEN (date + INTERVAL '1 year')::timestamp with time zone
  WHEN date::text LIKE '2024-03%' THEN (date + INTERVAL '1 year')::timestamp with time zone
  ELSE date
END
WHERE notes = 'Sample revenue data for charts';

-- Also update the monthly summary to reflect the new dates
DELETE FROM public.monthly_revenue_summary WHERE month_year < '2025-01-01';

-- Repopulate with updated data
INSERT INTO public.monthly_revenue_summary (
  month_year, 
  total_revenue, 
  credit_sales_count, 
  average_sale_amount
)
SELECT 
  DATE_TRUNC('month', date)::date as month_year,
  SUM(revenue_amount) as total_revenue,
  COUNT(*) as credit_sales_count,
  AVG(revenue_amount) as average_sale_amount
FROM public.credit_logs
WHERE action = 'addition' 
AND revenue_amount > 0
AND date >= '2025-01-01'
GROUP BY DATE_TRUNC('month', date)
ON CONFLICT (month_year) 
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  credit_sales_count = EXCLUDED.credit_sales_count,
  average_sale_amount = EXCLUDED.average_sale_amount,
  updated_at = now();