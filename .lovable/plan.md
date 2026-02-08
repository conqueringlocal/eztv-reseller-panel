

# Low Credit Alerts - Implementation Plan

## Overview
Implement a "Low Credit Alerts" system using a single Admin HighLevel subaccount to trigger automated email/SMS alerts when reseller credits drop below a configurable threshold.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database Migration | CREATE | Add columns to profiles + new admin_highlevel_settings table |
| `supabase/functions/_shared/admin-highlevel-api.ts` | CREATE | Admin HL helper functions |
| `supabase/functions/reseller-credit-monitor/index.ts` | CREATE | Scheduled edge function |
| `src/components/admin/AdminHighLevelAlertSettings.tsx` | CREATE | Admin HL alert settings UI |
| `src/components/resellers/ResellerAlertSettings.tsx` | CREATE | Per-reseller threshold UI |
| `src/pages/admin/AdminSettings.tsx` | MODIFY | Add Alerts tab (5th tab) |
| `src/pages/admin/AdminResellerDetail.tsx` | MODIFY | Add alert settings card |
| `supabase/config.toml` | MODIFY | Add function entry |

---

## Final Tweaks Applied

### 1. Dual Auth: CRON_SECRET OR Admin JWT
The edge function accepts EITHER:
- **A) Scheduled calls:** `X-CRON-SECRET` header matches env `CRON_SECRET`
- **B) Manual admin calls:** `Authorization: Bearer <JWT>` + `has_role('admin') = true`

This allows cron to stay locked down while "Run Credit Monitor Now" works from the UI without exposing CRON_SECRET to the browser.

```typescript
// Check for cron secret first
const cronSecret = req.headers.get('X-CRON-SECRET');
const expectedCronSecret = Deno.env.get('CRON_SECRET');
const isCronAuth = cronSecret && cronSecret === expectedCronSecret;

// If not cron, check for admin JWT
if (!isCronAuth) {
  const authHeader = req.headers.get('Authorization');
  // ... validate JWT and has_role('admin')
}
```

### 2. Dry Run Mode
Optional request body flag `{ dry_run: boolean }`:
- If `dry_run=true`: compute eligible resellers and return stats, but do NOT:
  - Call HighLevel API
  - Write `admin_highlevel_contact_id` to DB
  - Write `last_low_credit_alert_at` to DB

### 3. Credits Null Safety
If `reseller.credits` is null/undefined, skip that reseller and count `skippedNoCredits++` (do not alert).

---

## Database Migration

### 1. Extend `profiles` table

```sql
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS low_credit_threshold integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS low_credit_alert_cooldown_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS last_low_credit_alert_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS admin_highlevel_contact_id text NULL;
```

### 2. Create `admin_highlevel_settings` table (single-row, nullable credentials)

```sql
CREATE TABLE IF NOT EXISTS public.admin_highlevel_settings (
  id text PRIMARY KEY DEFAULT 'admin',
  private_integration_token text NULL,  -- Nullable
  location_id text NULL,                -- Nullable
  is_active boolean NOT NULL DEFAULT false,  -- Default false
  custom_field_mappings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS using is_admin() function
ALTER TABLE public.admin_highlevel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins only - full access" 
  ON public.admin_highlevel_settings
  FOR ALL 
  USING (is_admin());
```

---

## Required Secret

A new secret `CRON_SECRET` must be configured in Supabase Edge Function secrets. This will be used by the cron job to authenticate scheduled calls.

---

## Edge Function: `reseller-credit-monitor/index.ts`

### Dual Auth Logic
```typescript
// 1. Check for cron secret
const cronSecret = req.headers.get('X-CRON-SECRET');
const expectedCronSecret = Deno.env.get('CRON_SECRET');
const isCronAuth = cronSecret && cronSecret === expectedCronSecret;

// 2. If not cron, check for admin JWT
if (!isCronAuth) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }
  
  const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin'
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403 });
  }
}
```

### Processing Logic
1. Parse body for `{ dry_run?: boolean }`
2. Load `admin_highlevel_settings` → exit with `{ disabled: true }` if not active or missing credentials
3. Query resellers: `role = 'reseller'`
4. For each reseller:
   - Skip if `credits` is null/undefined → `skippedNoCredits++`
   - Skip if `credits > threshold` → normal (not counted)
   - Skip if in cooldown → `skippedCooldown++`
   - Skip if no email → `skippedNoEmail++`
   - If `dry_run=true`: count as would-be alerted but skip HL calls and DB writes
   - Otherwise:
     - Upsert Admin HL contact by email
     - Save `admin_highlevel_contact_id` to DB if new
     - Update HL custom fields (only non-empty values)
     - Update `last_low_credit_alert_at = NOW()` in DB
5. 150ms delay between HL API calls
6. Return stats JSON

### Response JSON
```json
{
  "success": true,
  "disabled": false,
  "dryRun": false,
  "stats": {
    "scanned": 25,
    "eligible": 8,
    "alerted": 3,
    "skippedCooldown": 5,
    "skippedNoEmail": 1,
    "skippedNoCredits": 0,
    "hlFailed": 0,
    "contactsCreated": 2,
    "contactsUpdated": 1
  }
}
```

### Sanitized Logging
```typescript
const maskId = (id: string): string => {
  if (!id || id.length < 8) return '****';
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
};
// Example: "abcd...wxyz"
// NEVER log: tokens, emails, URLs
```

---

## Shared Helper: `admin-highlevel-api.ts`

New file for Admin HL operations:

### Functions
```typescript
// Get Admin HL settings - returns null if inactive or missing credentials
export async function getAdminHighLevelSettings(): Promise<AdminHighLevelSettings | null>

// Upsert reseller contact in Admin HL (by email, fallback create)
export async function upsertAdminResellerContact(
  token: string,
  locationId: string,
  reseller: { id: string; name: string; email: string }
): Promise<{ contactId: string | null; isNew: boolean }>

// Get custom field mappings for Admin HL (cached)
async function getAdminCustomFieldMappings(
  locationId: string,
  token: string
): Promise<CustomFieldMapping>

// Update reseller alert fields - NEVER sends blank strings
export async function updateAdminResellerAlertFields(
  contactId: string,
  token: string,
  locationId: string,
  fields: AdminResellerAlertFields
): Promise<{ success: boolean; error?: string }>
```

### No Blank Strings Pattern
```typescript
const addField = (key: string, value: string | undefined) => {
  if (!value) return; // Skip undefined or empty strings
  customFields.push({ key, field_value: value });
};
```

---

## Admin UI: `AdminHighLevelAlertSettings.tsx`

New component for Admin Settings > Alerts tab:

### Features
- **Private Integration Token** input (password with show/hide, masked when saved)
- **Location ID** input
- **Active** toggle switch (default off)
- **Save** button (uses UPSERT on id='admin')
- **Test Connection** button (validates token by fetching custom fields)
- **Run Credit Monitor Now** button:
  - Calls `reseller-credit-monitor` edge function with admin JWT (no X-CRON-SECRET needed)
  - Shows toast with returned stats
- **Required custom fields list** for HighLevel setup
- **Cron job setup instructions**

### UPSERT Save Pattern
```typescript
const { error } = await supabase
  .from('admin_highlevel_settings')
  .upsert({
    id: 'admin',
    private_integration_token: token || null,
    location_id: locationId || null,
    is_active: isActive,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
```

---

## Reseller UI: `ResellerAlertSettings.tsx`

New component for AdminResellerDetail page:

### Features
- **Low Credit Threshold** - Number input (default 10)
- **Cooldown Hours** - Number input (default 24)
- **Current Credits** - Read-only display
- **Last Alert Sent** - Read-only timestamp or "Never"
- **Save** button

---

## AdminSettings.tsx Changes

Add 5th tab "Alerts":
```tsx
<TabsList className="grid w-full grid-cols-5">
  <TabsTrigger value="settings">System Settings</TabsTrigger>
  <TabsTrigger value="highlevel">HighLevel</TabsTrigger>
  <TabsTrigger value="alerts">Alerts</TabsTrigger>
  <TabsTrigger value="security">Security Audit</TabsTrigger>
  <TabsTrigger value="audit">Renewal Audit</TabsTrigger>
</TabsList>

<TabsContent value="alerts">
  <AdminHighLevelAlertSettings />
</TabsContent>
```

---

## AdminResellerDetail.tsx Changes

Add `ResellerAlertSettings` card after M3UDomainSettings (around line 324):
```tsx
<div className="mb-6">
  <ResellerAlertSettings 
    resellerId={id!} 
    currentCredits={reseller.credits} 
  />
</div>
```

---

## Config.toml Update

Add after existing function entries:
```toml
[functions.reseller-credit-monitor]
verify_jwt = false
```

---

## HighLevel Custom Fields (Admin Subaccount)

These fields must be created in the Admin HighLevel location:
- `reseller_credit_balance` - Current credit count (text/number)
- `reseller_low_credit_threshold` - Threshold that triggered alert (text/number)
- `reseller_credit_alert_reason` - "low_credit" (text)
- `reseller_credit_alert_triggered_at` - ISO timestamp (text)
- `reseller_name` - Reseller's business name (text, optional)

---

## Cron Schedule Setup

After deployment and adding `CRON_SECRET` to edge function secrets, configure cron via Supabase Dashboard SQL Editor:
```sql
SELECT cron.schedule(
  'reseller-credit-monitor',
  '*/15 * * * *', -- Every 15 minutes
  $$
  SELECT net.http_post(
    url := 'https://hddnqgggjjlildufirof.supabase.co/functions/v1/reseller-credit-monitor',
    headers := '{"Content-Type": "application/json", "X-CRON-SECRET": "YOUR_CRON_SECRET_HERE"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Replace `YOUR_CRON_SECRET_HERE` with the actual secret value.

---

## Edge Cases Handled

| Case | Handling |
|------|----------|
| No auth (no cron secret, no JWT) | Return 401 Unauthorized |
| Invalid cron secret | Check JWT fallback |
| Invalid JWT | Return 401 Unauthorized |
| JWT user not admin | Return 403 Forbidden |
| Admin HL not configured | Return `{ disabled: true }` |
| Admin HL inactive (`is_active=false`) | Return `{ disabled: true }` |
| Token/location_id null | Return `{ disabled: true }` |
| Reseller credits null | Skip, increment `skippedNoCredits` |
| Reseller has no email | Skip, increment `skippedNoEmail` |
| Reseller in cooldown | Skip, increment `skippedCooldown` |
| Credits above threshold | Normal, no alert |
| HL API fails | Continue to next, increment `hlFailed` |
| Empty field values | Use `undefined` to skip field entirely |
| `dry_run=true` | Compute stats but skip all HL calls and DB writes |

---

## Implementation Summary

| # | File | Type | Description |
|---|------|------|-------------|
| 1 | Database Migration | DB | Add profiles columns + admin_highlevel_settings table |
| 2 | `admin-highlevel-api.ts` | Shared | Admin HL helper functions |
| 3 | `reseller-credit-monitor/index.ts` | Edge | Scheduled monitor function with dual auth |
| 4 | `AdminHighLevelAlertSettings.tsx` | UI | Admin settings with Run Now button |
| 5 | `ResellerAlertSettings.tsx` | UI | Per-reseller threshold/cooldown UI |
| 6 | `AdminSettings.tsx` | UI | Add Alerts tab |
| 7 | `AdminResellerDetail.tsx` | UI | Add alert settings card |
| 8 | `config.toml` | Config | Add function entry |

