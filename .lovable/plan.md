

# Fix: HighLevel 400 Bad Request - Key/ID Mismatch in Custom Fields Payload

## Root Cause

The `buildCustomFieldsPayload` function in `supabase/functions/_shared/highlevel-api.ts` sends **both** `id` and `key` in the custom fields payload. The problem:

- HighLevel stores field keys as `contact.provision_status`, `contact.service_username_1`, etc.
- The payload sends `key: "provision_status"` (without the `contact.` prefix)
- HighLevel sees the `id` pointing to one field but the `key` not matching, and rejects the request with **400 Bad Request**

The field ID mappings in the cache are correct (all 13 fields resolved). The issue is purely the mismatched `key` in the payload.

## Solution

Update `buildCustomFieldsPayload` to **omit the `key` field when an `id` is available**. The `id` alone is sufficient and more reliable for HighLevel's API. Only fall back to sending `key` when no `id` is mapped.

## Changes

**File: `supabase/functions/_shared/highlevel-api.ts`** -- `buildCustomFieldsPayload` function (lines 164-206)

Update the `addField` helper to:
1. When field ID exists: send `{ id, field_value }` only (no key)
2. When field ID is missing: send `{ key, field_value }` as fallback

```typescript
function buildCustomFieldsPayload(
  fields: HighLevelContactFields,
  mapping: CustomFieldMapping
): Array<{ id?: string; key?: string; field_value: string }> {
  const customFields: Array<{ id?: string; key?: string; field_value: string }> = [];

  const addField = (key: string, value: string | undefined) => {
    if (!value) return;
    if (mapping[key]) {
      // Use field ID only - more reliable, avoids key format mismatches
      customFields.push({ id: mapping[key], field_value: value });
    } else {
      // Fallback to key-based update
      customFields.push({ key, field_value: value });
    }
  };

  // ... rest of field additions unchanged
```

Also update the same pattern in `updateHighLevelContactPartial` (around line 300) for consistency.

## Deployment

Redeploy the `import-customers-to-highlevel` function after the change. All other functions using the shared helper will also benefit once redeployed.

