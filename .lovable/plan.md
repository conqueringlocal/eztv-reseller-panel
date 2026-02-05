
# Fix HighLevel Settings "Permission Denied" Error

## Problem Identified

The database logs show:
```
permission denied for table reseller_highlevel_settings
```

The migration previously ran:
```sql
REVOKE ALL ON public.reseller_highlevel_settings FROM authenticated;
```

This completely blocks ALL authenticated users from the table, **including admins**. The Supabase JS client uses the `authenticated` role, so even admin users are blocked before RLS policies can be evaluated.

---

## Root Cause

PostgreSQL permission model:
1. First, **table-level privileges** (GRANT/REVOKE) are checked
2. Then, **RLS policies** filter which rows the user can access

By revoking ALL privileges from `authenticated`, the admin RLS policy never gets a chance to run because the "permission denied" error happens at step 1.

---

## Solution

Run a new migration that:
1. **Grants** SELECT, INSERT, UPDATE, DELETE to `authenticated` role
2. **Keeps** the existing admin-only RLS policy (which will filter non-admins)

This way:
- Authenticated users can attempt to access the table (table permission passes)
- RLS policy blocks non-admins (only users where `profiles.role = 'admin'`)
- Token is never exposed to non-admins because they can't read any rows

---

## Migration SQL

```sql
-- Fix: Grant table permissions back to authenticated role
-- RLS policy will restrict access to admins only

-- Grant base table permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_highlevel_settings TO authenticated;

-- RLS is enabled and "Admins only - full access" policy already exists
-- This policy ensures only admins can access any rows
```

---

## Security Analysis

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| Admin reads settings | **BLOCKED** (permission denied) | ALLOWED (RLS passes) |
| Admin writes settings | **BLOCKED** (permission denied) | ALLOWED (RLS passes) |
| Reseller reads settings | BLOCKED (permission denied) | BLOCKED (RLS fails - no matching row) |
| Reseller writes settings | BLOCKED (permission denied) | BLOCKED (RLS fails - no matching row) |

The security model is preserved - non-admins still cannot access the table because the RLS policy checks `profiles.role = 'admin'` and will return no rows for resellers.

---

## Files to Create

| File | Action |
|------|--------|
| `supabase/migrations/[timestamp]_fix_highlevel_settings_permissions.sql` | CREATE |

---

## No Code Changes Required

The `HighLevelSettings.tsx` component code is correct. Only the database permissions need to be fixed.

---

## Verification After Fix

1. Navigate to Admin > Resellers > Select a reseller
2. Scroll to "CRM Integration Settings" card
3. Enter Location ID and Private Integration Token
4. Click "Save Settings"
5. Should see success toast: "HighLevel settings saved successfully"
