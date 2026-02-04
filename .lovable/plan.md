

## Fix: Revenue and Sales Tracking Not Working

### Problem Summary

Revenue tracking stopped working after August 2025. The admin dashboard shows $0 revenue because:
1. The Stripe webhook does not record the actual purchase amount when logging credit purchases
2. The verify-checkout function also omits the revenue amount
3. The monthly revenue summary table is not being updated

### Root Cause Analysis

When a reseller purchases credits via Stripe:
1. **Current flow**: Credit log is created with `credits_used` but `revenue_amount` is left as default (0.00)
2. **Expected flow**: Credit log should include `revenue_amount` from the Stripe session's `amount_total`

The `revenue_amount` field exists in the `credit_logs` table but is never populated for real transactions.

---

### Solution

#### 1. Fix Stripe Webhook (`supabase/functions/stripe-webhook/index.ts`)

Add revenue tracking when logging credit purchases:

```typescript
// Current code (line 133-140):
const { error: logError } = await supabaseAdmin
  .from("credit_logs")
  .insert({
    reseller_id: userId,
    action: "addition",
    credits_used: creditsToAdd,
    notes: `Credits purchased via Stripe. Session ID: ${session.id}`,
  });

// Fixed code:
const revenueAmount = (session.amount_total || 0) / 100; // Convert cents to dollars

const { error: logError } = await supabaseAdmin
  .from("credit_logs")
  .insert({
    reseller_id: userId,
    action: "addition",
    credits_used: creditsToAdd,
    revenue_amount: revenueAmount,
    notes: `Credits purchased via Stripe. Session ID: ${session.id}`,
  });
```

#### 2. Fix Verify Checkout (`supabase/functions/verify-checkout/index.ts`)

Add revenue tracking to the backup checkout verification:

```typescript
// Current code (line 200-207):
const { error: logError } = await adminClient
  .from("credit_logs")
  .insert({
    reseller_id: user.id,
    action: "addition",
    credits_used: creditsToAdd,
    notes: `Credits purchased via Stripe. Session ID: ${sessionId}. Amount: $${(session.amount_total || 0) / 100}`,
  });

// Fixed code:
const revenueAmount = (session.amount_total || 0) / 100;

const { error: logError } = await adminClient
  .from("credit_logs")
  .insert({
    reseller_id: user.id,
    action: "addition",
    credits_used: creditsToAdd,
    revenue_amount: revenueAmount,
    notes: `Credits purchased via Stripe. Session ID: ${sessionId}`,
  });
```

#### 3. Backfill Historical Revenue Data (Database Migration)

Create a migration to update past Stripe purchases with estimated revenue:

```sql
-- Update credit_logs for Stripe purchases that have revenue_amount = 0
-- Using a default rate of $1.25 per credit (adjust as needed for your pricing)
UPDATE public.credit_logs
SET revenue_amount = credits_used * 1.25
WHERE action = 'addition'
  AND notes LIKE '%Credits purchased via Stripe%'
  AND revenue_amount = 0
  AND date > '2025-08-31';

-- Refresh the monthly revenue summary
SELECT public.update_monthly_revenue_summary();
```

#### 4. Verify Trigger Exists for Monthly Summary

Confirm the `update_monthly_revenue_summary` trigger is properly attached to the `credit_logs` table. If not, create it:

```sql
CREATE OR REPLACE TRIGGER update_revenue_summary_trigger
  AFTER INSERT ON public.credit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_monthly_revenue_summary();
```

---

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/stripe-webhook/index.ts` | Add `revenue_amount` field to credit log insert |
| `supabase/functions/verify-checkout/index.ts` | Add `revenue_amount` field to credit log insert |
| `supabase/migrations/[timestamp]_backfill_revenue.sql` | Backfill historical revenue and ensure trigger exists |

---

### Expected Results After Fix

- New Stripe purchases will record actual revenue amounts
- Dashboard will show accurate current month revenue
- Historical data (Sept 2025 - Feb 2026) will have estimated revenue based on credits purchased
- Monthly revenue summary will auto-update on new transactions
- MRR projections and growth rate will be calculated correctly

