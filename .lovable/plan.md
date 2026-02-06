
# Sunset 8K/IPTV Panel - Trex-Only Mode

## Overview

This plan "sunsets" the 8K/IPTV panel integrations by changing all defaults to Trex and removing 8K-specific API call logic. The code files will remain in place (no deletion) but will no longer be actively called or pinged.

---

## Database Migration

Update existing data and column defaults to Trex:

```sql
-- Update profiles table
ALTER TABLE profiles ALTER COLUMN provider SET DEFAULT 'trex';
UPDATE profiles SET provider = 'trex' WHERE provider = '8k' OR provider = 'iptv' OR provider IS NULL;

-- Update customers table  
ALTER TABLE customers ALTER COLUMN provider SET DEFAULT 'trex';
UPDATE customers SET provider = 'trex' WHERE provider = '8k' OR provider = 'iptv' OR provider IS NULL;
```

---

## Edge Function Changes

### High Priority (Remove 8K API Calls)

| File | Current Behavior | Change |
|------|------------------|--------|
| `renew-customer-group/index.ts` | Defaults to `'8k'` when provider is missing; has 8K case in `verifyConnectionExists`; calls `renew-iptv-user` | Default to `'trex'`; remove 8K case; always call `renew-trex-user` for M3U accounts |
| `sync-device-info/index.ts` | Has `case '8k'` in provider switch; pings 8K panel URL | Remove 8K case; default to Trex credentials |
| `add-connection-to-customer/index.ts` | Defaults provider to `'8k'`; has 8K/IPTV API call blocks | Default to `'trex'`; remove 8K API logic |
| `create-iptv-user/index.ts` | Defaults to 8K; has full 8K account creation flow | Default to `'trex'`; invoke `create-trex-user` instead |
| `webhook/enhancedWebhookHandler.ts` | Defaults provider to `'8k'` in multiple places | Change all defaults to `'trex'` |
| `get-iptv-packages/index.ts` | Fetches 8K packages as default | Default to Trex; remove 8K package fetch |
| `check-iptv-user-exists/index.ts` | Has 8K verification logic | Remove 8K check; use Trex only |
| `update-reseller-provider/index.ts` | Allows `'8k'` as valid provider | Remove `'8k'` from valid providers list |

### Lower Priority (Keep but Won't Be Called)

These functions will remain in the codebase but won't be invoked:
- `create-8k-user/index.ts` - Keep file, but no longer called
- `renew-iptv-user/index.ts` - Keep file, but `renew-customer-group` will only call `renew-trex-user`
- `delete-iptv-user/index.ts` - Keep file, but no longer called

---

## Frontend Changes

| File | Change |
|------|--------|
| `src/components/customers/CreateTrialWithProviderForm.tsx` | Default provider to `'trex'`; remove `'8k'` from Zod enum |
| `src/components/customers/AddCustomerForm.tsx` | Default provider to `'trex'` |
| `src/components/customers/BulkImportForm.tsx` | Default provider to `'trex'` |
| `src/hooks/useIptvPackages.ts` | Default provider state to `'trex'` |
| `src/hooks/useAllIptvPackages.ts` | Remove `'8k'` from providers array |
| `src/contexts/app/hooks/useCustomers.ts` | Default `userProvider` to `'trex'` |
| `src/contexts/app/utils/customerUtils.ts` | Default provider fallback to `'trex'` |
| `src/components/resellers/ChangeProviderDialog.tsx` | Simplify to assume Trex is the only option |

---

## Detailed Edge Function Changes

### 1. `renew-customer-group/index.ts`

**Line 318, 520, 548** - Change provider fallback:
```typescript
// Before
const provider = customer.provider || '8k';

// After
const provider = customer.provider || 'trex';
```

**Lines 36-48** - Remove 8K case from `verifyConnectionExists`:
```typescript
// Before
switch (provider) {
  case 'trex':
    apiKey = Deno.env.get('TREX_API_KEY');
    panelUrl = Deno.env.get('TREX_PANEL_URL');
    break;
  case '8k':
    apiKey = Deno.env.get('8K_API_KEY');
    panelUrl = Deno.env.get('8K_PANEL_URL');
    break;
  default:
    apiKey = Deno.env.get('IPTV_API_KEY');
    panelUrl = Deno.env.get('IPTV_PANEL_URL');
    break;
}

// After
// Always use Trex credentials
apiKey = Deno.env.get('TREX_API_KEY');
panelUrl = Deno.env.get('TREX_PANEL_URL');
```

**Line 521** - Always use Trex renewal function:
```typescript
// Before
const functionName = provider === 'trex' ? 'renew-trex-user' : 'renew-iptv-user';

// After
const functionName = 'renew-trex-user';
```

### 2. `sync-device-info/index.ts`

**Lines 86-99** - Remove provider switch:
```typescript
// Before
switch (customer.provider) {
  case 'trex':
    apiKey = Deno.env.get('TREX_API_KEY');
    panelUrl = Deno.env.get('TREX_PANEL_URL');
    break;
  case '8k':
    apiKey = Deno.env.get('8K_API_KEY');
    panelUrl = Deno.env.get('8K_PANEL_URL');
    break;
  default:
    apiKey = Deno.env.get('IPTV_API_KEY');
    panelUrl = Deno.env.get('IPTV_PANEL_URL');
    break;
}

// After
// Trex only
apiKey = Deno.env.get('TREX_API_KEY');
panelUrl = Deno.env.get('TREX_PANEL_URL');
```

### 3. `add-connection-to-customer/index.ts`

**Lines 102, 218** - Change default provider:
```typescript
// Before
const provider = customer.provider || '8k';

// After
const provider = customer.provider || 'trex';
```

**Lines 179-213, 295-329** - Remove 8K/IPTV API call blocks (the `else` branches after Trex):
```typescript
// Remove the entire else block that calls 8K/IPTV API
// Only keep the Trex API logic
```

### 4. `webhook/enhancedWebhookHandler.ts`

**Lines 104, 447** - Change default provider:
```typescript
// Before
provider: apiKeyData.profiles.provider || '8k'
provider: resellerData.provider || '8k'

// After
provider: apiKeyData.profiles.provider || 'trex'
provider: resellerData.provider || 'trex'
```

### 5. `get-iptv-packages/index.ts`

Change to always fetch Trex packages only.

---

## Files NOT Being Deleted (Sunset Only)

These files will remain in the codebase but will no longer be actively invoked:

```text
supabase/functions/create-8k-user/          (kept, not called)
supabase/functions/renew-iptv-user/         (kept, not called)
supabase/functions/delete-iptv-user/        (kept, not called)
```

---

## Summary of What This Achieves

1. **No more 8K/IPTV panel pings** - All API calls go to Trex only
2. **Existing customers migrated** - Database migration updates all `'8k'` providers to `'trex'`
3. **New accounts default to Trex** - Column defaults changed
4. **UI simplified** - No provider selection needed (Trex assumed)
5. **Code preserved** - Old files remain for reference but are inactive

---

## Edge Functions to Redeploy

After changes:
- `renew-customer-group`
- `sync-device-info`
- `add-connection-to-customer`
- `webhook`
- `get-iptv-packages`
- `check-iptv-user-exists`
- `update-reseller-provider`
- `create-iptv-user`

---

## Testing After Deployment

1. Create a new customer - verify only Trex API is called
2. Renew an existing customer - verify only `renew-trex-user` is invoked
3. Sync device info - verify Trex panel URL is used
4. Add connection - verify Trex API is used
5. Check database - confirm all providers are now `'trex'`
