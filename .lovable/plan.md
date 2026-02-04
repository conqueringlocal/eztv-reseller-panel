

## Fix: Renewal Showing "0 accounts and 0 credits"

### Root Cause

The SQL function `calculate_renewal_credits_required` has a bug in its connection counting logic. For single-connection customers (like "Alex (Connection 1)") who have:
- `total_connections: NULL`
- `connection_list: []` (empty array, not NULL)
- Valid top-level credentials (`username`, `password`)

The function checks:
1. `total_connections IS NOT NULL` → FALSE (it's NULL)
2. `connection_list IS NOT NULL` → **TRUE** (empty array `[]` is NOT null!)
3. Returns `jsonb_array_length([])` → **0 connections**

This causes the UI to show "0 accounts and 0 credits" and the renewal to fail because it tries to process 0 accounts.

---

### Solution

Update the `calculate_renewal_credits_required` function to check if `connection_list` has **at least one element**, not just that it exists:

```sql
-- BEFORE (buggy):
ELSIF customer_record.connection_list IS NOT NULL THEN
  connections_count := jsonb_array_length(customer_record.connection_list);

-- AFTER (fixed):
ELSIF customer_record.connection_list IS NOT NULL 
      AND jsonb_array_length(customer_record.connection_list) > 0 THEN
  connections_count := jsonb_array_length(customer_record.connection_list);
```

This ensures that empty arrays fall through to the group counting logic, which correctly returns 1 for single-connection customers.

---

### Technical Implementation

**Database Migration**
Create a new migration to replace the `calculate_renewal_credits_required` function with the fixed version:

```sql
CREATE OR REPLACE FUNCTION public.calculate_renewal_credits_required(
  customer_id_param uuid, 
  duration_months integer
)
RETURNS TABLE(
  credits_required integer, 
  accounts_count integer, 
  customer_group_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  customer_record RECORD;
  connections_count integer;
BEGIN
  SELECT * INTO customer_record
  FROM public.customers
  WHERE id = customer_id_param;
  
  IF customer_record.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  
  -- Determine actual number of connections
  IF customer_record.total_connections IS NOT NULL 
     AND customer_record.total_connections > 0 THEN
    connections_count := customer_record.total_connections;
    
  ELSIF customer_record.connection_list IS NOT NULL 
        AND jsonb_array_length(customer_record.connection_list) > 0 THEN
    -- Only use connection_list if it has actual entries
    connections_count := jsonb_array_length(customer_record.connection_list);
    
  ELSE
    -- Fall back to counting rows in customer_group
    SELECT COUNT(*) INTO connections_count
    FROM public.customers
    WHERE customer_group = customer_record.customer_group
    AND status != 'cancelled';
  END IF;
  
  RETURN QUERY SELECT 
    (connections_count * duration_months)::integer as credits_required,
    connections_count::integer as accounts_count,
    customer_record.customer_group as customer_group_name;
END;
$$;
```

---

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/[timestamp]_fix_renewal_credits_empty_array.sql` | Create | Fix the connection counting logic |

---

### Expected Result After Fix

For "Alex (Connection 1)":
- Function will check `total_connections` → NULL, skip
- Function will check `connection_list` → `[]` empty, **now skips** because length is 0
- Function falls back to counting group members → finds 1 active customer
- Returns `credits_required: 1`, `accounts_count: 1`
- UI shows "This will renew 1 account and consume 1 credit"
- Renewal proceeds successfully

