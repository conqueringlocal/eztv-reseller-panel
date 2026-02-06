
# Fix: Expiration Dates Not Updating on Dashboard After HighLevel Renewal

## Problem Identified

When a customer is renewed through HighLevel (or any webhook path), the expiration dates are not reflected on the dashboard immediately. This happens because:

1. **Top-level `expiration_date` is updated** - The SQL function `renew_customer_group` and the admin override path both correctly update the `expiration_date` column in the `customers` table.

2. **`connection_list` JSONB is NOT updated** - Neither the SQL function nor the edge function updates the `expiration_date` fields stored inside the `connection_list` array.

3. **Dashboard reads from `connection_list`** - The `CustomerCredentials.tsx` component (lines 158-162) specifically reads the expiration date from `connection_list[].expiration_date` for consolidated customers:
   ```typescript
   const connectionData = connectionList.find((c: any) => c.connection_number === connection.connectionNumber);
   const actualExpirationDate = connectionData?.expiration_date || connectionExpirationDate;
   ```

**Result**: The dashboard shows stale dates from the `connection_list` while the top-level field is correct.

---

## Solution: Two-Part Fix

### Part 1: Update `connection_list` During Renewal

Modify both the SQL function and the edge function admin path to update the `expiration_date` inside each connection in the `connection_list` JSONB array.

### Part 2: Auto-Sync After Webhook Renewal (Safety Net)

Call the `sync-device-info` function after successful webhook renewals to fetch authoritative expiration dates from the Trex panel.

---

## Technical Implementation

### 1. Update SQL Function: `renew_customer_group`

Create a new migration to replace the function with one that updates `connection_list`:

```sql
CREATE OR REPLACE FUNCTION public.renew_customer_group(
  customer_id_param uuid,
  duration_months integer,
  reseller_id_param uuid
)
RETURNS TABLE(success boolean, accounts_renewed integer, credits_used integer, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  customer_group_val text;
  accounts_count_val integer;
  credits_needed integer;
  reseller_credits integer;
  new_expiration_date date;
  customer_record record;
BEGIN
  -- Get customer group
  SELECT customer_group INTO customer_group_val
  FROM public.customers
  WHERE id = customer_id_param;
  
  IF customer_group_val IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 'Customer not found'::text;
    RETURN;
  END IF;
  
  -- Calculate requirements
  SELECT cr.credits_required, cr.accounts_count 
  INTO credits_needed, accounts_count_val
  FROM public.calculate_renewal_credits_required(customer_id_param, duration_months) cr;
  
  -- Check reseller credits
  SELECT credits INTO reseller_credits
  FROM public.profiles
  WHERE id = reseller_id_param;
  
  IF reseller_credits < credits_needed THEN
    RETURN QUERY SELECT false, 0, 0, 'Insufficient credits'::text;
    RETURN;
  END IF;
  
  -- Update each customer in the group, including connection_list
  FOR customer_record IN 
    SELECT id, expiration_date, connection_list 
    FROM public.customers 
    WHERE customer_group = customer_group_val AND status != 'cancelled'
  LOOP
    new_expiration_date := (customer_record.expiration_date + (duration_months || ' months')::interval)::date;
    
    UPDATE public.customers
    SET 
      expiration_date = new_expiration_date,
      plan_duration = duration_months,
      status = 'active',
      -- Update connection_list: set expiration_date for each connection
      connection_list = CASE 
        WHEN connection_list IS NOT NULL AND jsonb_array_length(connection_list) > 0 THEN
          (SELECT jsonb_agg(
            conn || jsonb_build_object('expiration_date', new_expiration_date::text)
          )
          FROM jsonb_array_elements(connection_list) AS conn)
        ELSE connection_list
      END
    WHERE id = customer_record.id;
  END LOOP;
  
  -- Deduct credits from reseller
  UPDATE public.profiles
  SET credits = credits - credits_needed
  WHERE id = reseller_id_param;
  
  -- Log the credit usage
  INSERT INTO public.credit_logs (
    reseller_id, action, credits_used, customer_name, customer_id, notes
  ) VALUES (
    reseller_id_param, 'account_creation', credits_needed,
    (SELECT name FROM public.customers WHERE id = customer_id_param LIMIT 1),
    customer_id_param,
    'Group renewal for ' || accounts_count_val || ' accounts'
  );
  
  RETURN QUERY SELECT true, accounts_count_val, credits_needed, NULL::text;
END;
$$;
```

### 2. Update Edge Function: `renew-customer-group/index.ts`

Modify the admin override path (lines 648-687) to also update `connection_list`:

```typescript
if (isAdminOverride) {
  console.log(`⚡ ADMIN: Updating customer expiration dates directly (no credit deduction)`);
  
  const newExpirationDate = new Date();
  newExpirationDate.setMonth(newExpirationDate.getMonth() + planDuration);
  const newExpirationDateStr = newExpirationDate.toISOString().split('T')[0];
  
  // For each customer in the group, update both expiration_date and connection_list
  for (const customer of groupCustomers) {
    const connectionList = customer.connection_list;
    let updatedConnectionList = connectionList;
    
    // Update expiration_date in each connection if connection_list exists
    if (Array.isArray(connectionList) && connectionList.length > 0) {
      updatedConnectionList = connectionList.map((conn: any) => ({
        ...conn,
        expiration_date: newExpirationDateStr
      }));
    }
    
    const { error: updateError } = await supabaseClient
      .from('customers')
      .update({
        expiration_date: newExpirationDateStr,
        plan_duration: planDuration,
        status: 'active',
        connection_list: updatedConnectionList
      })
      .eq('id', customer.id);
    
    if (updateError) {
      console.error(`❌ Admin database update failed for ${customer.name}:`, updateError);
      // Handle error...
    }
  }
  
  console.log(`✅ Admin renewal completed successfully`);
}
```

### 3. Optional: Auto-Sync in Webhook Handler (Safety Net)

In `enhancedWebhookHandler.ts`, after a successful renewal, optionally call `sync-device-info`:

```typescript
// After successful renewal, trigger sync to get authoritative dates from provider
if (data.success && customer.id) {
  try {
    console.log('🔄 Triggering post-renewal sync for customer:', customer.id);
    await supabase.functions.invoke('sync-device-info', {
      body: { customerId: customer.id }
    });
  } catch (syncError) {
    console.log('⚠️ Post-renewal sync failed (non-blocking):', syncError);
  }
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Update `renew_customer_group` function to update `connection_list` |
| `supabase/functions/renew-customer-group/index.ts` | Update admin override path to update `connection_list` |
| `supabase/functions/webhook/enhancedWebhookHandler.ts` | Add optional post-renewal sync call |

---

## Edge Functions to Redeploy

- `renew-customer-group`
- `webhook`

---

## Expected Result

After implementation:
1. When renewal is triggered via HighLevel webhook, both the top-level `expiration_date` AND the `connection_list[].expiration_date` fields will be updated
2. The dashboard will immediately show the correct new expiration dates for all connections
3. The optional sync call provides an extra safety net by fetching authoritative dates from the Trex panel
