

# Fix: Prevent Double Renewal on Trex API

## Problem Summary

The user renewed a customer and was effectively charged for 2 one-month renewals (expiration extended by 2 months). Investigation reveals:

1. **First attempt (05:11)**: Called Trex API successfully (+1 month), then crashed during database update due to `userProfile is not defined`
2. **Second attempt (05:13)**: Called Trex API again (+1 month), database update succeeded

**Root Cause**: The idempotency protection only prevents duplicate *database* operations. The Trex API call happens before the database update, so when a failure occurs after the API call but before completion, the next retry calls the Trex API again.

## Solution: Add API-Level Idempotency Flag

Track whether the Trex API was already called for a given transaction, preventing duplicate external API calls on retry.

---

## Technical Changes

### 1. Add `api_calls_completed` Flag to Renewal Transactions

Add a new column to track whether the provider API calls have been completed for this transaction:

```sql
ALTER TABLE renewal_transactions ADD COLUMN IF NOT EXISTS api_calls_completed BOOLEAN DEFAULT FALSE;
```

### 2. Update `renew-customer-group` to Skip API Calls on Retry

Modify the edge function to check if API calls were already made for this transaction. If so, skip directly to the database update phase.

**File: `supabase/functions/renew-customer-group/index.ts`**

After getting the transaction result (around line 446), add:
```typescript
const apiCallsAlreadyCompleted = transactionResult.api_calls_completed === true;

if (apiCallsAlreadyCompleted) {
  console.log(`⚡ API calls already completed for transaction ${transactionId}, skipping to database update`);
}
```

Before the renewal loops (around line 508), wrap the API calls:
```typescript
if (!apiCallsAlreadyCompleted) {
  // Existing renewal logic for MAG and M3U customers...
  // After all renewals succeed, mark API calls as completed
  await supabaseClient
    .from('renewal_transactions')
    .update({ api_calls_completed: true })
    .eq('id', transactionId);
} else {
  // Populate renewalResults with success for database update phase
  renewalResults = groupCustomers.map(c => ({ account: c, success: true }));
}
```

### 3. Update Transaction Key Generation

The current 5-minute window may be too short. Consider increasing to 10 or 15 minutes to better handle edge cases, or making it configurable.

---

## Database Migration

```sql
-- Add api_calls_completed flag to renewal_transactions
ALTER TABLE public.renewal_transactions 
ADD COLUMN IF NOT EXISTS api_calls_completed BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN public.renewal_transactions.api_calls_completed IS 
'Tracks whether external provider API calls (Trex, etc.) have been made for this transaction. 
Prevents duplicate API calls on retry after database errors.';
```

---

## Edge Function Changes

### File: `supabase/functions/renew-customer-group/index.ts`

1. After line 446 (transaction result), add check for `api_calls_completed`
2. Before line 508 (MAG renewals), wrap API calls in conditional
3. After successful API calls (around line 587), update transaction to mark `api_calls_completed = true`
4. If `api_calls_completed` is true, skip directly to database update with success results

---

## Edge Functions to Redeploy

- `renew-customer-group`

---

## Expected Result After Fix

```text
Timeline (with fix):
1. 05:11 - First attempt starts
2. 05:11 - Trex API called (+1 month) 
3. 05:11 - Transaction marked: api_calls_completed = TRUE
4. 05:11 - Database update fails (userProfile error)
5. 05:11 - Transaction marked: status = failed

6. 05:13 - Retry attempt starts  
7. 05:13 - Same transaction found (5-min window)
8. 05:13 - Sees api_calls_completed = TRUE
9. 05:13 - SKIPS Trex API call (no double renewal!)
10. 05:13 - Database update succeeds
11. 05:13 - Transaction marked: status = completed

Result: Customer extended by 1 month (correct), not 2
```

---

## Immediate Workaround

The customer's expiration was incorrectly extended. To fix this specific case:
- Use the Trex panel directly to adjust the expiration date, OR
- Note this for the next renewal (they have an extra month of credit)

