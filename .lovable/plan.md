

# Fix: Upgrade Package ID Fallback

## Problem
When creating new connections during upgrade, the `packageId` fallback uses the literal string `'default'`, which Trex rejects with "Template bouquet not found." error. This happens when `customer.package_id` is null (common for older customers/trials) and the payload doesn't include a package_id.

## Solution
Replace the static `'default'` fallback with a dynamic lookup from `system_settings` table, using the `trex_default_package_id` setting.

---

## Technical Change

### File: `supabase/functions/webhook/enhancedWebhookHandler.ts`

### Location: Lines 1099-1100

**Current Code:**
```typescript
const packageId = customer.package_id || payload.customer.package_id || 'default';
const deviceType = customer.device_type || payload.customer.device_type || 'Smart TV';
```

**New Code:**
```typescript
const deviceType = customer.device_type || payload.customer?.device_type || 'Smart TV';

// Get package ID - prioritize customer's existing package, then payload, then lookup from system settings
let packageId = customer.package_id || payload.customer?.package_id;
if (!packageId) {
  const { data: packageSetting, error: packageSettingError } = await supabase
    .from('system_settings')
    .select('value')
    .eq('id', 'trex_default_package_id')
    .single();
  
  if (packageSettingError) {
    console.log('⚠️ Could not load trex_default_package_id from system_settings (using fallback)');
  }
  
  packageId = packageSetting?.value || '27228';
  console.log(`📦 Using default Trex package ID: ${String(packageId)}`);
}
```

---

## Package ID Resolution Priority

1. `customer.package_id` - existing customer record
2. `payload.customer?.package_id` - if provided in webhook payload
3. `system_settings.trex_default_package_id` - database setting (preferred fallback)
4. `'27228'` - hardcoded fallback only if setting is missing

---

## What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Customer has package_id | Uses it | Uses it (unchanged) |
| Customer has null package_id, no payload | Uses `'default'` (fails) | Looks up from system_settings |
| system_settings missing | N/A | Falls back to `'27228'` |

---

## File to Modify

- `supabase/functions/webhook/enhancedWebhookHandler.ts` (lines 1099-1100)

## Edge Function to Redeploy

- `webhook`

---

## Test Case

Upgrade a customer where `customer.package_id` is null and payload has no `package_id`:
- Existing connection renews on Trex panel
- New connection is created successfully using package ID from system_settings
- Both expirations unify
- HighLevel fields update with both credentials

