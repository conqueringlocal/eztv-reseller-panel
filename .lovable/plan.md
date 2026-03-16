

## Fix: Foreign Key Constraint Blocking Customer Deletion

### Problem
Deleting a customer fails because `renewal_transactions.customer_id` has a foreign key reference to `customers.id` without `ON DELETE CASCADE`. When you try to delete a customer who has renewal transaction records, Postgres blocks the deletion.

### Fix
Run a migration to drop the existing foreign key constraint and recreate it with `ON DELETE CASCADE`. This way, when a customer is deleted, their associated renewal transactions are automatically cleaned up.

```sql
ALTER TABLE public.renewal_transactions
  DROP CONSTRAINT renewal_transactions_customer_id_fkey;

ALTER TABLE public.renewal_transactions
  ADD CONSTRAINT renewal_transactions_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id)
  ON DELETE CASCADE;
```

Single migration, no code changes needed.

