-- Backfill historical revenue data for Stripe purchases since Sept 2025
-- Using $1.25 per credit as the default rate
UPDATE public.credit_logs
SET revenue_amount = credits_used * 1.25
WHERE action = 'addition'
  AND notes LIKE '%Credits purchased via Stripe%'
  AND (revenue_amount IS NULL OR revenue_amount = 0)
  AND date > '2025-08-31';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_revenue_summary_trigger ON public.credit_logs;

-- Create trigger to update monthly revenue summary on new credit log entries
CREATE TRIGGER update_revenue_summary_trigger
  AFTER INSERT ON public.credit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_revenue_summary();

-- Manually refresh the monthly revenue summary for all months with data
INSERT INTO public.monthly_revenue_summary (month_year, total_revenue, credit_sales_count, average_sale_amount)
SELECT 
  DATE_TRUNC('month', date) as month_year,
  COALESCE(SUM(revenue_amount), 0.00) as total_revenue,
  COUNT(*) as credit_sales_count,
  CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(revenue_amount), 0.00) / COUNT(*) ELSE 0.00 END as average_sale_amount
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