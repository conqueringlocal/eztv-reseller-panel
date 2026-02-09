

# Fix: Import Customers to HighLevel - 400 Bad Request on Field Update

## Root Cause

The per-reseller `highlevel-api.ts` has the same field mapping bug that was previously fixed in the admin version. HighLevel UI-created custom fields have keys like `contact.service_username_1`, but the code only checks `fieldKey` directly without stripping the `contact.` prefix.

This means:
- Field ID lookup fails for all fields
- The update payload includes `key` but no `id`
- HighLevel API rejects the payload with 400 Bad Request

## Solution

Update `getCustomFieldMappings()` in `supabase/functions/_shared/highlevel-api.ts` to strip the `contact.` prefix when matching fields -- the same fix already applied to `admin-highlevel-api.ts`.

## Changes

**File: `supabase/functions/_shared/highlevel-api.ts`** (lines 126-167)

Replace the field matching loop with a cleaner approach that:
1. Strips the `contact.` prefix from `fieldKey`
2. Matches by raw key, stripped key, or normalized name
3. Iterates over target fields instead of using a long if/else chain

```typescript
const mapping: CustomFieldMapping = {};
for (const field of customFields) {
  const fieldKey = field.fieldKey || field.key || '';
  const strippedKey = fieldKey.replace(/^contact\./, '');
  const fieldName = (field.name || '').toLowerCase().replace(/\s+/g, '_');
  const fieldId = field.id;
  
  if (!fieldId) continue;
  
  for (const targetField of requiredFields) {
    if (!mapping[targetField] && 
        (fieldKey === targetField || strippedKey === targetField || fieldName === targetField)) {
      mapping[targetField] = fieldId;
      break;
    }
  }
}
```

This reuses the existing `requiredFields` array already defined at line 86, making the code shorter and consistent with the admin helper.

## Deployment

Redeploy `import-customers-to-highlevel` (and any other functions using this shared helper) after the change.

