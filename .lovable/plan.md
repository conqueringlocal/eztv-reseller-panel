

## Fix: Revert Trex Renewal `sub` Parameter to Match API Documentation

### Problem

The Trex API documentation at `activationpanel.net/api/panel_api.html` clearly states that the `sub` parameter for renewals uses the same values as creation: **`sub = 1, 3, 6, 12`** (subscription length in months). There is no `sub=0` or `sub=2`.

Our previous "fix" incorrectly changed the `sub` parameter to 0-indexed values, which broke renewals entirely (Trex returns "Something is missing" for `sub=0`). The original doubling issue was caused by duplicate API calls on our end, not incorrect `sub` values.

### Current (broken) state in 3 files

| File | Current `sub` logic | Sends for 1-month |
|------|--------------------|--------------------|
| `renew-trex-user/index.ts` | `mapping: { 1: '0', 3: '2', 6: '5', 12: '11' }` | `sub=0` |
| `renew-mag-user/index.ts` | `(planDuration - 1).toString()` | `sub=0` |
| `renew-single-connection/index.ts` | `(planDuration - 1).toString()` | `sub=0` |

### Fix — all 3 files

Set `sub` to the plan duration directly (1, 3, 6, or 12), matching the API docs exactly.

**File: `supabase/functions/renew-trex-user/index.ts`** (lines 17-29)
Replace `mapPlanDurationToSub` with a simple pass-through:
```typescript
function mapPlanDurationToSub(planDuration: number): string {
  // Per Trex API docs: sub = 1,3,6,12 (subscription length in months)
  return planDuration.toString();
}
```

**File: `supabase/functions/renew-mag-user/index.ts`** (lines 183-184 and 246-247)
Change `(planDuration - 1).toString()` to `planDuration.toString()` in both the consolidated and single-connection paths. Remove the incorrect "0-indexed" comments.

**File: `supabase/functions/renew-single-connection/index.ts`** (lines 165-166)
Change `(planDuration - 1).toString()` to `planDuration.toString()`. Remove the incorrect "0-indexed" comment.

**CORS headers** — also update all 3 files to include the full required headers:
```typescript
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
```

**Deploy** all 3 edge functions after changes.

