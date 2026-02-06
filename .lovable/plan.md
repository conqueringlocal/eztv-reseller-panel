
# Renewal by HighLevel Contact ID + Success Tag

## Overview

Add the ability to renew customers using only their HighLevel `contact_id`, and add a `renewal_success` tag on successful renewals to trigger HighLevel workflows.

---

## Simplified Webhook Payload

**Minimal Renewal (Contact ID Lookup):**
```json
{
  "api_key": "{{custom_values.iptv_reseller_api_key}}",
  "contact_id": "{{contact.id}}",
  "action": "renew",
  "customer": {
    "plan_duration_months": 1
  }
}
```

**Full Renewal (Backwards Compatible with Fallback):**
```json
{
  "api_key": "{{custom_values.iptv_reseller_api_key}}",
  "contact_id": "{{contact.id}}",
  "action": "renew",
  "customer": {
    "name": "{{contact.first_name}} {{contact.last_name}}",
    "email": "{{contact.email}}",
    "plan_duration_months": 1
  }
}
```

No need to specify connections - the system automatically renews ALL connections in the customer's `connection_list`.

---

## How It Works

```text
Webhook Received
       │
       ▼
┌──────────────────────────────┐
│  Has contact_id?             │
└──────────────────────────────┘
       │ Yes              │ No
       ▼                  │
┌────────────────────┐    │
│ Query customers by │    │
│ highlevel_contact_id│   │
└────────────────────┘    │
       │                  │
   Found?                 │
       │ No               │
       ▼                  ▼
┌─────────────────────────────┐
│ Query by name + email       │
│ (backwards compatible)      │
└─────────────────────────────┘
       │
   Found?
       │ No ────▶ Return Error + provision_failed tag
       │
       ▼
┌─────────────────────────────┐
│ renew-customer-group        │
│ (renews ALL connections)    │
└─────────────────────────────┘
       │
   Success?
       │ Yes
       ▼
┌─────────────────────────────┐
│ Sync to HighLevel:          │
│ • provision_status: success │
│ • service_expiration        │
│ • All credentials (1-3)     │
│ • renewal_success tag       │
└─────────────────────────────┘
```

---

## What Gets Synced to HighLevel

**On Success:**
| Field | Value |
|-------|-------|
| `provision_status` | `success` |
| `service_expiration` | New expiry date (YYYY-MM-DD) |
| `total_connections` | Number of connections (1-3) |
| `service_username_1..3` | Credentials for each connection |
| `service_password_1..3` | Credentials for each connection |
| `service_m3u_url_1..3` | M3U URLs for each connection |
| **Tag Added** | `renewal_success` |

**On Failure:**
| Field | Value |
|-------|-------|
| `provision_status` | `failed` |
| `provision_error` | Error message |
| **Tag Added** | `provision_failed` |

---

## Technical Changes

### File to Modify

`supabase/functions/webhook/enhancedWebhookHandler.ts`

### Changes

**1. Update Customer Lookup (lines 546-572)**

Add contact_id lookup before name+email:

```typescript
// First try to find by highlevel_contact_id if contact_id is provided
let customer = null;
if (payload.contact_id) {
  const { data: contactCustomers } = await supabase
    .from('customers')
    .select('*')
    .eq('reseller_id', resellerId)
    .eq('highlevel_contact_id', payload.contact_id)
    .in('status', ['active', 'expired', 'expiring_soon'])
    .limit(1);
  
  if (contactCustomers && contactCustomers.length > 0) {
    customer = contactCustomers[0];
    console.log(`✅ Found customer by highlevel_contact_id: ${customer.name}`);
  }
}

// Fallback to name + email lookup
if (!customer && payload.customer.name && payload.customer.email) {
  const { data: nameEmailCustomers } = await supabase
    .from('customers')
    .select('*')
    .eq('reseller_id', resellerId)
    .eq('name', payload.customer.name)
    .eq('email', payload.customer.email)
    .in('status', ['active', 'expired', 'expiring_soon'])
    .limit(1);
  
  if (nameEmailCustomers && nameEmailCustomers.length > 0) {
    customer = nameEmailCustomers[0];
  }
}

if (!customer) {
  // Sync failure to HighLevel
  await syncHighLevelContact(resellerId, payload.contact_id, false, undefined, undefined, 
    'No customer found matching the provided contact_id, name, or email');
  return { success: false, message: 'Customer not found', errors: ['customer_not_found'] };
}
```

**2. Add renewal_success Tag on Success (line 629-635)**

Update the HighLevel sync call to include the success tag:

```typescript
await syncHighLevelContact(
  resellerId,
  contactIdToUse,
  true,
  credentialsList,
  newExpiry.toISOString().split('T')[0],
  undefined,
  ['renewal_success']  // NEW: Tag for workflow triggers
);
```

---

## Multi-Connection Handling

No changes needed - the existing `renew-customer-group` function already:

1. Retrieves the customer's `connection_list` JSONB array
2. Validates all connections exist in the provider panel (pre-flight check)
3. Iterates through each connection and renews individually
4. Updates all expiration dates in the database
5. Deducts credits based on total connections x duration

---

## Edge Function to Redeploy

- `webhook`

---

## Testing After Deployment

1. **Test Contact ID Lookup:**
   - Send renewal with only `contact_id` and `plan_duration_months`
   - Verify customer is found and renewed

2. **Test Backwards Compatibility:**
   - Send renewal with `name`, `email`, and `plan_duration_months`
   - Verify existing flow still works

3. **Test Multi-Connection Renewal:**
   - Renew a customer with 2-3 connections
   - Verify all connections get extended

4. **Test HighLevel Sync:**
   - Check contact has `renewal_success` tag
   - Verify credentials and expiration are updated

5. **Test Failure Scenario:**
   - Send renewal with non-existent `contact_id`
   - Verify `provision_failed` tag is added
