ALTER TABLE public.renewal_transactions
  DROP CONSTRAINT renewal_transactions_customer_id_fkey;

ALTER TABLE public.renewal_transactions
  ADD CONSTRAINT renewal_transactions_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE CASCADE;