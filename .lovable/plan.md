

# Fix Admin HighLevel Integration - Field Mapping & Contact Lookup

## Problems Identified

### 1. Custom Field Mapping Failure
The logs show "22 fields loaded" but all lookups fail. This is because:
- Current code only matches by `field.fieldKey` 
- HighLevel UI-created fields have keys like `contact.reseller_credit_balance` (with prefix)
- OR need to match by normalized name: "Reseller Credit Balance" → `reseller_credit_balance`

### 2. Contact Lookup Not Finding Existing Contacts
The duplicate search created a **new** contact instead of finding your existing reseller contact. This could be because:
- Email doesn't match exactly between the platform and HighLevel
- The search endpoint response format differs

---

## Solution

### Fix 1: Improved Field Matching (lines 113-125 of admin-highlevel-api.ts)

Update `getAdminCustomFieldMappings()` to:
1. Match by `fieldKey` directly
2. Match by `fieldKey` with `contact.` prefix stripped  
3. Match by normalized field name (lowercase, spaces → underscores)
4. Add debug logging to show what fields were found vs missing

```typescript
const targetFields = [
  'reseller_credit_balance',
  'reseller_low_credit_threshold',
  'reseller_credit_alert_reason',
  'reseller_credit_alert_triggered_at',
  'reseller_name',
  'reseller_buy_credits_url'
];

const mapping: CustomFieldMapping = {};
for (const field of fields) {
  const fieldKey = field.fieldKey || field.key || '';
  // Strip 'contact.' prefix if present
  const strippedKey = fieldKey.replace(/^contact\./, '');
  // Normalize name: "Reseller Credit Balance" → "reseller_credit_balance"
  const fieldName = (field.name || '').toLowerCase().replace(/\s+/g, '_');
  const fieldId = field.id;
  
  if (!fieldId) continue;
  
  for (const targetField of targetFields) {
    if (fieldKey === targetField || strippedKey === targetField || fieldName === targetField) {
      mapping[targetField] = fieldId;
      break;
    }
  }
}

// Debug logging
console.log('Admin HL field mapping result:', {
  found: Object.keys(mapping),
  missing: targetFields.filter(f => !mapping[f])
});
```

### Fix 2: Improved Contact Search

Update `upsertAdminResellerContact()` to:
1. Use the HighLevel contacts search API with better query
2. Log the search response for debugging
3. Fall back to the lookup endpoint if search fails

```typescript
// First try to find existing contact by email - use contacts/lookup endpoint
const lookupResponse = await fetch(
  `${HIGHLEVEL_API_BASE}/contacts/lookup?locationId=${locationId}&email=${encodeURIComponent(reseller.email)}`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    }
  }
);

if (lookupResponse.ok) {
  const lookupData = await lookupResponse.json();
  const contacts = lookupData.contacts || [];
  
  console.log('Contact lookup result for reseller:', {
    resellerId: maskId(reseller.id),
    contactsFound: contacts.length
  });
  
  if (contacts.length > 0) {
    const contactId = contacts[0].id;
    console.log('Found existing Admin HL contact:', maskId(contactId));
    return { contactId, isNew: false };
  }
}
```

### Fix 3: Include Both `id` and `key` in Update Payload

Match the per-reseller API pattern - send both field ID and key for maximum compatibility:

```typescript
const customFields: Array<{ id: string; key: string; field_value: string }> = [];

const addField = (key: string, value: string | undefined) => {
  if (!value) return;
  const fieldId = mapping[key];
  if (fieldId) {
    customFields.push({ id: fieldId, key, field_value: value });
  } else {
    console.log(`Custom field '${key}' not found in Admin HL location`);
  }
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/_shared/admin-highlevel-api.ts` | Update field matching + contact lookup + payload format |

---

## After Fix

When you run the credit monitor:
1. Logs should show `found: ['reseller_credit_balance', 'reseller_name', ...]`
2. Contact lookup should find your existing reseller contacts
3. Custom fields will be updated on the contact
4. HighLevel workflow triggers on `reseller_credit_alert_triggered_at` change → sends email/SMS

