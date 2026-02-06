-- Add api_calls_completed flag to renewal_transactions
ALTER TABLE public.renewal_transactions 
ADD COLUMN IF NOT EXISTS api_calls_completed BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.renewal_transactions.api_calls_completed IS 
'Tracks whether external provider API calls (Trex, etc.) have been made for this transaction. Prevents duplicate API calls on retry after database errors.';