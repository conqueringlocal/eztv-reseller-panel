-- Add sample revenue data to existing credit logs to demonstrate the charts
-- Update some existing credit additions with realistic revenue amounts
UPDATE public.credit_logs 
SET revenue_amount = 
  CASE 
    WHEN credits_used >= 100 THEN credits_used * 1.00  -- $1 per credit for large purchases
    WHEN credits_used >= 50 THEN credits_used * 1.25   -- $1.25 per credit for medium purchases  
    WHEN credits_used >= 10 THEN credits_used * 1.50   -- $1.50 per credit for small purchases
    ELSE credits_used * 2.00                           -- $2 per credit for very small purchases
  END
WHERE action = 'addition' 
AND revenue_amount = 0.00
AND notes LIKE '%Stripe%' OR notes LIKE '%purchased%' OR notes LIKE '%Credits purchased%';

-- Insert some additional sample revenue data for testing charts
-- Create a few months of sample data
INSERT INTO public.credit_logs (
  reseller_id, 
  action, 
  credits_used, 
  revenue_amount, 
  customer_name, 
  notes, 
  date
) VALUES 
-- July 2024 data
('541e0e6b-11fa-4b0a-9621-adaa9e466683', 'addition', 100, 120.00, 'Test Customer 1', 'Sample revenue data for charts', '2024-07-15 10:00:00+00'),
('4a67c58b-56c5-4017-a6d7-678f28a01b19', 'addition', 50, 65.00, 'Test Customer 2', 'Sample revenue data for charts', '2024-07-20 14:30:00+00'),
('fee6fd72-07f3-4765-b88b-79cf16d94dda', 'addition', 75, 90.00, 'Test Customer 3', 'Sample revenue data for charts', '2024-07-25 16:45:00+00'),

-- June 2024 data  
('541e0e6b-11fa-4b0a-9621-adaa9e466683', 'addition', 200, 220.00, 'Test Customer 4', 'Sample revenue data for charts', '2024-06-10 09:15:00+00'),
('4a67c58b-56c5-4017-a6d7-678f28a01b19', 'addition', 80, 100.00, 'Test Customer 5', 'Sample revenue data for charts', '2024-06-18 13:20:00+00'),

-- May 2024 data
('fee6fd72-07f3-4765-b88b-79cf16d94dda', 'addition', 150, 165.00, 'Test Customer 6', 'Sample revenue data for charts', '2024-05-05 11:30:00+00'),
('541e0e6b-11fa-4b0a-9621-adaa9e466683', 'addition', 60, 78.00, 'Test Customer 7', 'Sample revenue data for charts', '2024-05-22 15:45:00+00'),

-- April 2024 data
('4a67c58b-56c5-4017-a6d7-678f28a01b19', 'addition', 120, 144.00, 'Test Customer 8', 'Sample revenue data for charts', '2024-04-12 12:00:00+00'),

-- March 2024 data
('fee6fd72-07f3-4765-b88b-79cf16d94dda', 'addition', 90, 112.50, 'Test Customer 9', 'Sample revenue data for charts', '2024-03-08 14:15:00+00'),

-- Current month (August 2024) data
('541e0e6b-11fa-4b0a-9621-adaa9e466683', 'addition', 85, 102.00, 'Test Customer 10', 'Sample revenue data for charts', '2024-08-05 10:30:00+00'),
('4a67c58b-56c5-4017-a6d7-678f28a01b19', 'addition', 40, 52.00, 'Test Customer 11', 'Sample revenue data for charts', '2024-08-12 16:20:00+00');