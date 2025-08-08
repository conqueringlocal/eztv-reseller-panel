-- Add revenue_amount column to credit_logs for tracking actual payment amounts
ALTER TABLE public.credit_logs ADD COLUMN revenue_amount DECIMAL(10,2) DEFAULT 0.00;

-- Create monthly_revenue_summary table for aggregated revenue data
CREATE TABLE public.monthly_revenue_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year DATE NOT NULL, -- First day of the month
  total_revenue DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  credit_sales_count INTEGER NOT NULL DEFAULT 0,
  average_sale_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(month_year)
);

-- Enable RLS on monthly_revenue_summary
ALTER TABLE public.monthly_revenue_summary ENABLE ROW LEVEL SECURITY;

-- Create policies for monthly_revenue_summary
CREATE POLICY "Admins can view monthly revenue summary" 
ON public.monthly_revenue_summary 
FOR SELECT 
USING (is_admin());

CREATE POLICY "System can insert monthly revenue summary" 
ON public.monthly_revenue_summary 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update monthly revenue summary" 
ON public.monthly_revenue_summary 
FOR UPDATE 
USING (true);

-- Create function to calculate MRR projections
CREATE OR REPLACE FUNCTION public.calculate_mrr_projections()
RETURNS TABLE(
  current_month_revenue DECIMAL(10,2),
  projected_mrr DECIMAL(10,2),
  growth_rate DECIMAL(5,2),
  avg_sale_amount DECIMAL(10,2),
  total_sales_count INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_month DATE := DATE_TRUNC('month', CURRENT_DATE);
  last_month DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
  three_months_ago DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months');
  current_revenue DECIMAL(10,2) := 0.00;
  last_month_revenue DECIMAL(10,2) := 0.00;
  three_month_avg DECIMAL(10,2) := 0.00;
  calculated_growth_rate DECIMAL(5,2) := 0.00;
  avg_amount DECIMAL(10,2) := 0.00;
  sales_count INTEGER := 0;
BEGIN
  -- Get current month revenue from credit_logs
  SELECT COALESCE(SUM(revenue_amount), 0.00), COUNT(*)
  INTO current_revenue, sales_count
  FROM public.credit_logs
  WHERE action = 'addition' 
  AND DATE_TRUNC('month', date) = current_month
  AND revenue_amount > 0;

  -- Get last month revenue
  SELECT COALESCE(SUM(revenue_amount), 0.00)
  INTO last_month_revenue
  FROM public.credit_logs
  WHERE action = 'addition' 
  AND DATE_TRUNC('month', date) = last_month
  AND revenue_amount > 0;

  -- Calculate 3-month average for projection
  SELECT COALESCE(AVG(monthly_total), 0.00)
  INTO three_month_avg
  FROM (
    SELECT SUM(revenue_amount) as monthly_total
    FROM public.credit_logs
    WHERE action = 'addition' 
    AND DATE_TRUNC('month', date) >= three_months_ago
    AND revenue_amount > 0
    GROUP BY DATE_TRUNC('month', date)
  ) monthly_totals;

  -- Calculate growth rate
  IF last_month_revenue > 0 THEN
    calculated_growth_rate := ((current_revenue - last_month_revenue) / last_month_revenue * 100);
  END IF;

  -- Calculate average sale amount
  IF sales_count > 0 THEN
    avg_amount := current_revenue / sales_count;
  END IF;

  RETURN QUERY SELECT 
    current_revenue,
    three_month_avg,
    calculated_growth_rate,
    avg_amount,
    sales_count;
END;
$$;

-- Create trigger to update monthly_revenue_summary when credit_logs are updated
CREATE OR REPLACE FUNCTION public.update_monthly_revenue_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  month_date DATE := DATE_TRUNC('month', NEW.date);
  revenue_total DECIMAL(10,2);
  sales_count INTEGER;
  avg_amount DECIMAL(10,2);
BEGIN
  -- Only process revenue additions
  IF NEW.action = 'addition' AND NEW.revenue_amount > 0 THEN
    -- Calculate totals for the month
    SELECT 
      COALESCE(SUM(revenue_amount), 0.00),
      COUNT(*),
      CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(revenue_amount), 0.00) / COUNT(*) ELSE 0.00 END
    INTO revenue_total, sales_count, avg_amount
    FROM public.credit_logs
    WHERE action = 'addition' 
    AND DATE_TRUNC('month', date) = month_date
    AND revenue_amount > 0;

    -- Insert or update monthly summary
    INSERT INTO public.monthly_revenue_summary (
      month_year, 
      total_revenue, 
      credit_sales_count, 
      average_sale_amount
    )
    VALUES (month_date, revenue_total, sales_count, avg_amount)
    ON CONFLICT (month_year) 
    DO UPDATE SET
      total_revenue = EXCLUDED.total_revenue,
      credit_sales_count = EXCLUDED.credit_sales_count,
      average_sale_amount = EXCLUDED.average_sale_amount,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on credit_logs
CREATE TRIGGER update_revenue_summary_trigger
  AFTER INSERT OR UPDATE ON public.credit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_revenue_summary();