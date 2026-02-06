

# Backfill M3U Domain Override Implementation

## Overview
Implementing the complete M3U domain backfill feature that updates all existing customer M3U URLs when a reseller's domain override is saved or cleared.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/_shared/m3u-domain.ts` | CREATE | Shared M3U URL rewrite utility |
| `supabase/functions/_shared/highlevel-api.ts` | MODIFY | Add `updateHighLevelContactPartial` function |
| `supabase/functions/webhook/enhancedWebhookHandler.ts` | MODIFY | Import shared helper, remove inline code |
| `supabase/functions/backfill-m3u-domains/index.ts` | CREATE | New edge function for backfill |
| `supabase/config.toml` | MODIFY | Add function config entry |
| `src/components/resellers/M3UDomainSettings.tsx` | MODIFY | Trigger backfill after save/clear |

---

## Detailed Changes

### 1. CREATE: `supabase/functions/_shared/m3u-domain.ts`

New shared utility with:
- `DEFAULT_M3U_DOMAIN` constant
- `rewriteM3uDomain()` function for URL host rewriting

### 2. MODIFY: `supabase/functions/_shared/highlevel-api.ts`

Add after line 324:
- `HighLevelPartialFields` interface (only URL fields + total_connections)
- `updateHighLevelContactPartial()` function that does NOT require `provision_status`
- Sanitized logging with masked contact IDs

### 3. MODIFY: `supabase/functions/webhook/enhancedWebhookHandler.ts`

- **Line 3**: Add import from shared m3u-domain.ts
- **Line 11**: Remove inline `DEFAULT_M3U_DOMAIN` constant
- **Lines 49-82**: Remove inline `rewriteM3uDomain` function

### 4. CREATE: `supabase/functions/backfill-m3u-domains/index.ts`

New edge function that:
1. Validates JWT and admin role
2. Loads reseller domain override
3. Loads HighLevel settings via `getHighLevelSettings()`
4. Processes customers in batches of 200
5. Rewrites `connection_list[].m3u_url` and legacy `m3u_url`
6. Updates DB only if changed
7. Syncs to HighLevel using `updateHighLevelContactPartial()` (ONLY m3u_url fields + total_connections)
8. Returns summary counts

**Key logic corrections applied:**
- `total_connections = String(Math.min(rewrittenConnectionList.length, 3))` or `"1"` if legacy
- `hlEnabled = !!hlSettings?.token && !!hlSettings?.locationId && !!hlSettings?.isActive`
- Sanitized logging (no URLs, passwords, tokens; masked contact IDs)

### 5. MODIFY: `supabase/config.toml`

Add after line 56:
```toml
[functions.backfill-m3u-domains]
verify_jwt = false
```

### 6. MODIFY: `src/components/resellers/M3UDomainSettings.tsx`

- Add `isBackfilling` state
- Add `runBackfill()` function calling the edge function
- Call backfill after successful save/clear
- Update button states (disabled during backfill)
- Show toast with counts on completion

---

## HighLevel Settings Shape (Verified)

```typescript
interface HighLevelSettings {
  token: string;      // private_integration_token
  locationId: string; // location_id
  isActive: boolean;  // is_active
}
```

---

## Deployment

Functions will auto-deploy on save:
- `backfill-m3u-domains` (NEW)
- `webhook` (updated imports)

---

## Test cURL

```bash
curl -X POST "https://hddnqgggjjlildufirof.supabase.co/functions/v1/backfill-m3u-domains" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reseller_id": "uuid-here"}'
```

---

## Expected Response

```json
{
  "success": true,
  "customersProcessed": 150,
  "customersUpdated": 145,
  "highLevelUpdated": 120,
  "highLevelFailed": 2,
  "highLevelSkipped": 23
}
```

