-- Add package_id field to customers table to store the selected package ID
ALTER TABLE public.customers 
ADD COLUMN package_id text;