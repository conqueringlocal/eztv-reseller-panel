
# Upgrade Action Implementation (Corrected)

## Overview

Add a new webhook action `upgrade` that increases an existing customer's connection count from N to M (where M > N, max 3). This uses the same provisioning path as `createConsolidatedAccount`.

---

## Corrected Payload Structure

```json
{
  "api_key": "{{custom_values.iptv_reseller_api_key}}",
  "contact_id": "{{contact.id}}",
  "action": "upgrade",
  "connections": 3,
  "customer": {
    "name": "{{contact.first_name}} {{contact.last_name}}",
    "email": "{{contact.email}}",
    "device_type": "{{contact.device_type}}",
    "plan_duration_months": 6
  }
}
```

**OR** with top-level plan_duration:
```json
{
  "api_key": "...",
  "action": "upgrade",
  "connections": 3,
  "plan_duration_months": 6,
  "customer": { ... }
}
```

---

## Technical Implementation

### 1. Update `index.ts` - Add 'upgrade' to Action Routing

**Line 124**: Add `'upgrade'` to the enhanced webhook action check:
```typescript
if (payload.action && ['create', 'renew', 'trial', 'upgrade'].includes(payload.action)) {
```

**Line 63**: Add `'upgrade'` to GET parameter action type.

---

### 2. Update `EnhancedWebhookPayload` Interface

**Line 14**: Update action union type:
```typescript
action: 'create' | 'renew' | 'trial' | 'upgrade';
```

**Add** `plan_duration_months?: number;` at root level (line ~33) for flexibility.

---

### 3. New Function: `upgradeCustomerConnections`

Location: After `renewCustomerGroup` function (around line 719)

```text
Signature:
async function upgradeCustomerConnections(
  payload: EnhancedWebhookPayload,
  resellerId: string,
  resellerData: any
): Promise<EnhancedWebhookResult>
```

**Logic Flow:**

1. **Extract plan_duration_months** (REQUIRED)
   - Read from `payload.customer.plan_duration_months` OR `payload.plan_duration_months`
   - If missing/invalid: return error `missing_plan_duration`

2. **Validate requested connections**
   - Must be 2 or 3 (max allowed is 3)
   - If < 1 or > 3: return error `invalid_connections`

3. **Find existing customer** (same priority as renew)
   - Priority 1: Lookup by `highlevel_contact_id` if `contact_id` provided
   - Priority 2: Fallback to name + email
   - If not found: return `customer_not_found`, sync failure to HighLevel

4. **Persist contact_id** if provided but customer lacks it

5. **Determine current connection count**
   ```text
   If customer.connection_list exists and length > 0:
       currentConnections = connection_list.length
   Else if customer.total_connections > 0:
       currentConnections = total_connections
   Else if customer.username exists:
       currentConnections = 1  // Legacy single-connection
   Else:
       currentConnections = 0  // Error state
   ```

6. **Validate upgrade is possible**
   - If `requestedConnections <= currentConnections`:
     Return `no_upgrade_needed` with message: "Customer already has N connection(s). Use 'renew' to extend subscription."
   - If `requestedConnections > 3`:
     Return `invalid_connections`

7. **Calculate credits required**
   ```text
   delta = requestedConnections - currentConnections
   creditsRequired = delta * planDurationMonths
   ```

8. **Check reseller credits**
   - If insufficient: sync failure to HighLevel, return `insufficient_credits`

9. **Migrate primary connection if needed**
   - If `connection_list` is empty but customer has `username`/`password`:
     - Create connection 1 from existing top-level credentials with existing expiration_date
     - This becomes the base for appending new connections

10. **Create additional connections (delta)**
    - Loop `delta` times using `create-iptv-user` function (same as createConsolidatedAccount)
    - Use customer's existing `package_id`, `device_type`
    - Use `planDurationMonths` from payload for the new connection duration
    - Extract credentials from each response
    - Build connection objects with proper `connection_number`

11. **Update database**
    ```text
    updatedConnectionList = [...existingConnections, ...newConnections]
    
    UPDATE customers SET
        connection_list = updatedConnectionList,
        total_connections = requestedConnections,
        max_connections = requestedConnections
        -- NOTE: expiration_date is NOT changed
    WHERE id = customer.id
    ```

12. **Deduct credits**
    ```text
    UPDATE profiles SET credits = credits - creditsRequired WHERE id = resellerId
    ```

13. **Log credit usage**
    ```text
    INSERT INTO credit_logs (action='account_creation', notes='Upgrade from N to M connections')
    ```

14. **Sync to HighLevel** (non-blocking)
    - Build `credentialsList` from updated `connection_list` (up to 3)
    - Call `syncHighLevelContact()` with:
      - `success: true`
      - `credentialsList`: all connection credentials
      - `expirationDate`: existing customer.expiration_date (NO CHANGE)
      - `successTags`: `['upgrade_success']`

15. **Return response** with all credentials (up to 3)

---

### 4. Add Switch Case in `processEnhancedWebhook`

**Line ~793** (after 'renew' case):
```typescript
case 'upgrade':
  return await upgradeCustomerConnections(payload, resellerData.resellerId, resellerData);
```

---

## Error Response Codes

| Error Code | Condition |
|------------|-----------|
| `missing_plan_duration` | No plan_duration_months in payload |
| `invalid_connections` | Requested connections > 3 or < 1 |
| `customer_not_found` | No match by contact_id or name+email |
| `no_upgrade_needed` | Requested connections <= current |
| `insufficient_credits` | Reseller lacks credits for delta |
| `upgrade_failed` | Provisioning API call failed |

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/webhook/index.ts` | Add `'upgrade'` to action check (line 124), add GET param support (line 63) |
| `supabase/functions/webhook/enhancedWebhookHandler.ts` | Add to type (line 14), add root-level `plan_duration_months` field, add `upgradeCustomerConnections()` function, add switch case |

---

## Edge Functions to Redeploy

- `webhook`

---

## Key Corrections Applied

1. **plan_duration_months is REQUIRED** - Read from `payload.customer.plan_duration_months` OR `payload.plan_duration_months`
2. **Credits = delta × plan_duration_months** - No prorating, matches purchased product
3. **Expiration NOT changed** - Keep existing `customer.expiration_date`
4. **Uses existing create-iptv-user** - Same provisioning path as createConsolidatedAccount
5. **Customer lookup priority** - contact_id first, then name+email fallback
6. **HighLevel sync** - Uses existing expirationDate, syncs all credentials

---

## Expected Success Response

```json
{
  "success": true,
  "message": "Upgraded from 1 to 3 connections",
  "name": "John Doe",
  "email": "john@example.com",
  "device_type": "Smart TV",
  "start_date": "2026-01-09",
  "end_date": "2026-07-09",
  "account_type": "m3u",
  "credits_used": 12,
  "total_connections": 3,
  "credentials": [...],
  "username_1": "...",
  "password_1": "...",
  "m3u_url_1": "...",
  "username_2": "...",
  "password_2": "...",
  "m3u_url_2": "...",
  "username_3": "...",
  "password_3": "...",
  "m3u_url_3": "..."
}
```

---

## Expected Error Response (No Upgrade Needed)

```json
{
  "success": false,
  "message": "Customer already has 3 connection(s). No upgrade needed. Use 'renew' to extend subscription.",
  "errors": ["no_upgrade_needed"]
}
```
