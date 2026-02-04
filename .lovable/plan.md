
# HighLevel 3-Connection Upgrade Implementation

## Overview

Enhance the HighLevel integration to sync credentials for up to 3 connections per customer, with support for `total_connections` and per-connection credential fields (`service_username_1..3`, `service_password_1..3`, `service_m3u_url_1..3`).

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/_shared/highlevel-api.ts` | MODIFY | Expand interface, field mappings, payload builder for 1-3 connections |
| `supabase/functions/webhook/enhancedWebhookHandler.ts` | MODIFY | Update syncHighLevelContact to accept credentials array |
| `src/components/resellers/HighLevelSettings.tsx` | MODIFY | Update admin UI helper text with new field list |

---

## Detailed Changes

### 1. highlevel-api.ts - Interface, Field Mappings, Payload Builder

**A) Extend HighLevelContactFields interface (lines 11-18)**

Replace current interface with expanded version supporting up to 3 connections:

```typescript
export interface HighLevelContactFields {
  provision_status: 'success' | 'failed';
  service_expiration?: string; // YYYY-MM-DD
  provision_error?: string;
  total_connections?: string;
  // Connection 1
  service_username_1?: string;
  service_password_1?: string;
  service_m3u_url_1?: string;
  // Connection 2
  service_username_2?: string;
  service_password_2?: string;
  service_m3u_url_2?: string;
  // Connection 3
  service_username_3?: string;
  service_password_3?: string;
  service_m3u_url_3?: string;
}
```

**B) Expand requiredFields array (lines 73-80)**

```typescript
const requiredFields = [
  'provision_status',
  'service_expiration',
  'provision_error',
  'total_connections',
  'service_username_1', 'service_password_1', 'service_m3u_url_1',
  'service_username_2', 'service_password_2', 'service_m3u_url_2',
  'service_username_3', 'service_password_3', 'service_m3u_url_3'
];
```

**C) Expand mapping logic in getCustomFieldMappings (lines 111-133)**

Add matching for all new fields:
- `provision_status`, `service_expiration`, `provision_error`, `total_connections`
- `service_username_1..3`, `service_password_1..3`, `service_m3u_url_1..3`

**D) Expand buildCustomFieldsPayload (lines 176-182)**

Add all field keys:
```typescript
addField('provision_status', fields.provision_status);
addField('service_expiration', fields.service_expiration);
addField('provision_error', fields.provision_error);
addField('total_connections', fields.total_connections);
addField('service_username_1', fields.service_username_1);
addField('service_password_1', fields.service_password_1);
addField('service_m3u_url_1', fields.service_m3u_url_1);
// ... connections 2 and 3
```

**E) Update sanitized logging (lines 195-203)**

```typescript
console.log('🔗 HighLevel Update Request:', {
  contactId,
  hasToken: !!token,
  tokenLength: token?.length || 0,
  provision_status: fields.provision_status,
  totalConnections: fields.total_connections,
  hasUsername1: !!fields.service_username_1,
  hasUsername2: !!fields.service_username_2,
  hasUsername3: !!fields.service_username_3,
  hasExpiration: !!fields.service_expiration,
  hasError: !!fields.provision_error
});
```

---

### 2. enhancedWebhookHandler.ts - syncHighLevelContact with Credentials Array

**A) Change syncHighLevelContact signature (lines 114-121)**

```typescript
async function syncHighLevelContact(
  resellerId: string,
  contactId: string | undefined,
  success: boolean,
  credentialsList?: Array<{ username?: string; password?: string; m3u_url?: string }>,
  expirationDate?: string,
  errorMessage?: string
): Promise<void>
```

**B) Build fields with per-connection data (lines 135-151)**

```typescript
const fields: HighLevelContactFields = {
  provision_status: success ? 'success' : 'failed'
};

if (success && credentialsList && credentialsList.length > 0) {
  const maxConnections = Math.min(credentialsList.length, 3);
  fields.total_connections = String(maxConnections);
  
  if (credentialsList[0]) {
    fields.service_username_1 = credentialsList[0].username;
    fields.service_password_1 = credentialsList[0].password;
    fields.service_m3u_url_1 = credentialsList[0].m3u_url;
  }
  // ... connections 2 and 3
}
```

**C) Update call sites:**

- **Insufficient credits failure (line 281-288):** Pass `undefined` for credentialsList
- **Create success (line 446-459):** Pass FULL credentials array (up to 3):
  ```typescript
  const credentialsList = consolidatedConnectionDetails.slice(0, 3).map((cred: any) => ({
    username: cred.username,
    password: cred.password,
    m3u_url: cred.m3u_url
  }));
  await syncHighLevelContact(resellerId, payload.contact_id, true, credentialsList, expirationDateStr);
  ```
- **Customer not found failure (line 494-502):** Pass `undefined` for credentialsList
- **Renew success (line 544-558):** Build from `connection_list` or legacy fields:
  ```typescript
  let credentialsList = [];
  if (customer.connection_list?.length > 0) {
    credentialsList = customer.connection_list.slice(0, 3).map((conn: any) => ({
      username: conn.username, password: conn.password, m3u_url: conn.m3u_url
    }));
  } else if (customer.username || customer.password) {
    credentialsList = [{ username: customer.username, password: customer.password, m3u_url: customer.m3u_url }];
  }
  await syncHighLevelContact(resellerId, contactIdToUse, true, credentialsList, newExpiry);
  ```

---

### 3. HighLevelSettings.tsx - Admin UI Helper Text

**Update Required Custom Fields list (lines 175-188)**

Replace current list with expanded version including per-connection fields:

```tsx
<Alert className="mb-4 border-blue-200 bg-blue-50">
  <Info className="h-4 w-4 text-blue-600" />
  <AlertDescription className="text-blue-800">
    <strong>Required Custom Fields in HighLevel:</strong>
    <ul className="mt-2 ml-4 list-disc text-sm">
      <li><code>provision_status</code> - Success or failed status</li>
      <li><code>service_expiration</code> - Expiration date (YYYY-MM-DD)</li>
      <li><code>provision_error</code> - Error message if failed</li>
      <li><code>total_connections</code> - Number of connections (1-3)</li>
      <li className="mt-1"><strong>Connection 1:</strong></li>
      <li className="ml-4"><code>service_username_1</code>, <code>service_password_1</code>, <code>service_m3u_url_1</code></li>
      <li><strong>Connection 2:</strong></li>
      <li className="ml-4"><code>service_username_2</code>, <code>service_password_2</code>, <code>service_m3u_url_2</code></li>
      <li><strong>Connection 3:</strong></li>
      <li className="ml-4"><code>service_username_3</code>, <code>service_password_3</code>, <code>service_m3u_url_3</code></li>
    </ul>
  </AlertDescription>
</Alert>
```

---

## Technical Constraints (Preserved)

| Constraint | Implementation |
|------------|----------------|
| Sanitized logging | Never log token, passwords, or m3u_url. Only usernames logged. |
| Non-blocking sync | HighLevel sync failures do not block provisioning |
| Cache invalidation | Preserved - resets on token/location change |
| Supabase insert format | All `.insert()` calls use array format `[{...}]` |
| Safe error access | All error.message uses `instanceof Error` check |

---

## Test Verification

**Webhook test with 3 connections:**
```bash
curl -X POST https://[project].supabase.co/functions/v1/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "eztvclub_xxx",
    "action": "create",
    "connections": 3,
    "contact_id": "HIGHLEVEL_CONTACT_ID",
    "customer": {
      "name": "Test 3 Connection",
      "email": "test3conn@example.com",
      "device_type": "Smart TV",
      "plan_duration_months": 1
    }
  }'
```

**Expected HighLevel custom fields:**
- `provision_status` = "success"
- `service_expiration` = "YYYY-MM-DD"
- `total_connections` = "3"
- `service_username_1`, `service_password_1`, `service_m3u_url_1`
- `service_username_2`, `service_password_2`, `service_m3u_url_2`
- `service_username_3`, `service_password_3`, `service_m3u_url_3`

---

## Deliverables

1. Updated `highlevel-api.ts` with expanded interface and field mappings
2. Updated `enhancedWebhookHandler.ts` with credentials array support
3. Updated `HighLevelSettings.tsx` admin UI helper text
4. Edge function redeployed successfully
5. No TypeScript errors
