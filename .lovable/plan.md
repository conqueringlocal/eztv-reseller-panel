

# Fix: Webhook "Invalid API Key" Error - Missing Column in Query

## Root Cause

The webhook's `getResellerByApiKey` function in `enhancedWebhookHandler.ts` queries:

```sql
profiles!inner(credits, name, provider, m3u_domain_override)
```

The column `m3u_domain_override` **does not exist** on the `profiles` table (or anywhere in the database). This causes the Supabase query to fail, returning `null` for `apiKeyData`, which triggers the "Invalid or inactive API key" error -- even though the API key is valid and active.

## Solution

1. **Remove the non-existent column reference** from the query in `getResellerByApiKey`
2. **Remove** the usage of `m3uDomainOverride` from the return value (since the column doesn't exist)
3. **Search for other references** to `m3u_domain_override` in the enhanced webhook handler and handle them gracefully (default to `null`)

## Changes

**File: `supabase/functions/webhook/enhancedWebhookHandler.ts`**

In the `getResellerByApiKey` function (~line 212):
- Change the select from `profiles!inner(credits, name, provider, m3u_domain_override)` to `profiles!inner(credits, name, provider)`
- Update the return object to set `m3uDomainOverride: null` (hardcoded) instead of reading from the non-existent column

## Deployment

Redeploy the `webhook` edge function after the fix.

