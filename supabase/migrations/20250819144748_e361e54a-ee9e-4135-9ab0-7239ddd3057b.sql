-- Manually populate the monthly_revenue_summary table with aggregated data
-- from the credit_logs we just inserted
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
GROUP BY DATE_TRUNC('month', date)
ON CONFLICT (month_year) 
DO UPDATE SET
  total_revenue = EXCLUDED.total_revenue,
  credit_sales_count = EXCLUDED.credit_sales_count,
  average_sale_amount = EXCLUDED.average_sale_amount,
  updated_at = now();