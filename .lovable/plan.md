

## Investigation: 1-Month Renewal Giving 2 Months

### Evidence Found

I traced the full credit and renewal history for Nick's customers. The data reveals a consistent pattern of an **extra month** being added:

**Nick V** (username: ab66f50f4a):
- Created Aug 30, 2025. 6 credits spent total (creation + 5 successful renewals).
- Expected expiration: Aug 30 + 6 months = ~Feb 28, 2026.
- **Actual expiration: Apr 4, 2026** -- approximately 1 extra month.

**Chris Salazar** (username: f57eef9182):
- Created Dec 14, 2025. 3 credits spent effectively.
- Expected expiration: Dec 14 + 3 months = ~Mar 14, 2026.
- **Actual expiration: Apr 14, 2026** -- exactly 1 extra month.

### Root Cause

The Trex panel's "renew" API action interprets the `sub` parameter differently from the "create" action. In many Xtream Codes-based panels, the `sub` value for renewals is **0-indexed** (referring to a subscription package index), while for creation it's 1-indexed:

- **Create action**: `sub=1` → 1 month (works correctly)
- **Renew action**: `sub=1` → selects the **second** subscription package (which is 2 months), `sub=0` → 1 month

Our code currently uses the same mapping for both, sending `sub=1` for 1-month renewals, which the Trex renewal endpoint interprets as 2 months.

After the Trex panel extends the account by 2 months, the `sync-device-info` function (called manually or during data refresh) pulls the Trex panel's expiration date back into our database, overwriting the locally-calculated 1-month extension with the panel's 2-month value.

### Fix

**File: `supabase/functions/renew-trex-user/index.ts`** (lines 18-28)

Change `mapPlanDurationToSub` to use 0-indexed values for renewals:

```typescript
function mapPlanDurationToSub(planDuration: number): string {
  const mapping: { [key: number]: string } = {
    1: '0',    // 1 month (0-indexed for renewal)
    3: '2',    // 3 months
    6: '5',    // 6 months
    12: '11',  // 12 months
  };
  return mapping[planDuration] || '0';
}
```

**File: `supabase/functions/renew-mag-user/index.ts`** -- Apply the same fix if it has a similar mapping.

**Redeploy** both edge functions after the change.

### Risk & Verification

This fix is based on strong evidence (consistent +1 month pattern across multiple customers) but the exact Trex panel package index mapping may vary. After deploying:

1. Renew one of Nick's customers for 1 month
2. Check the Trex panel to confirm the expiration extended by exactly 1 month (not 2)
3. If it under-extends (0 months), the panel may use 1-indexed after all and the issue is elsewhere -- we would then revert

