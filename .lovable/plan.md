
# Fix: Webhook Renewal 401 Error

## Problem

The webhook is receiving a **401 Unauthorized** error when calling `renew-customer-group`:
```
❌ Auth verification failed: { error: "invalid claim: missing sub claim" }
```

**Root Cause:** The `renew-customer-group` function requires a valid user JWT, but webhooks authenticate via API key (not JWT). When the webhook invokes this function, there's no valid user session.

## Solution

Add the **serviceCall pattern** (already used by `create-iptv-user` and `create-trex-user`) to `renew-customer-group`. This allows internal service calls to bypass JWT verification while maintaining security for direct user calls.

---

## Changes Required

### File 1: `supabase/functions/renew-customer-group/index.ts`

**1. Update Request Interface (around line 10)**
Add `serviceCall` and `resellerId` parameters:
```typescript
interface RenewGroupRequest {
  customerId: string;
  planDuration: number;
  serviceCall?: boolean;  // NEW: Skip JWT verification for internal calls
  resellerId?: string;    // NEW: Provided when serviceCall=true
}
```

**2. Add Service Call Logic (lines 115-155)**
Wrap the JWT verification in a conditional:
```typescript
const { customerId, planDuration, serviceCall = false, resellerId: providedResellerId }: RenewGroupRequest = await req.json();

// Determine user context based on call type
let verifiedUserId: string | null = null;
let isServiceCall = false;

if (!serviceCall) {
  // Normal path: Verify JWT token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    // ... existing error handling
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !user) {
    // ... existing error handling
  }
  verifiedUserId = user.id;
  console.log(`✅ User authenticated: ${user.email} (ID: ${user.id})`);
} else {
  // Service call path: Skip JWT, trust the provided resellerId
  console.log('🔐 Bypassing JWT authentication for service call');
  if (!providedResellerId) {
    return new Response(
      JSON.stringify({ error: 'resellerId is required for service calls' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  isServiceCall = true;
}
```

**3. Adjust Authorization Logic**
After the customer lookup, use the verified user OR service call context:
```typescript
// For service calls, skip user-based authorization
// The webhook already verified the API key belongs to the reseller
if (!isServiceCall) {
  // Existing user/admin authorization checks...
} else {
  // Service call - verify the provided resellerId matches the customer's reseller
  if (primaryCustomer.reseller_id !== providedResellerId) {
    console.error(`❌ Service call reseller mismatch: provided ${providedResellerId} != customer ${primaryCustomer.reseller_id}`);
    return new Response(
      JSON.stringify({ error: 'Reseller ID mismatch' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  console.log(`✅ Service call authorized for reseller: ${providedResellerId}`);
}
```

---

### File 2: `supabase/functions/webhook/enhancedWebhookHandler.ts`

**Update the renewal invocation (around line 619)**
Pass `serviceCall: true` and the validated `resellerId`:
```typescript
const { data, error } = await supabase.functions.invoke('renew-customer-group', {
  body: {
    customerId: customer.id,
    planDuration: planDuration,
    serviceCall: true,      // NEW: Bypass JWT verification
    resellerId: resellerId  // NEW: Already validated from API key
  }
});
```

---

## Security Notes

- **API Key Validation**: The webhook already validates the API key and resolves `resellerId` before reaching the renewal logic. This is secure.
- **Reseller Mismatch Check**: The service call path still verifies that the provided `resellerId` matches the customer's owner.
- **No JWT Required**: Since the webhook uses API key auth (validated at webhook entry), JWT is not needed for internal calls.

---

## Flow After Fix

```text
Webhook Received (action: renew)
       │
       ▼
┌──────────────────────────────┐
│ Validate API Key             │
│ Resolve resellerId           │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Find customer by contact_id  │
│ or name+email                │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│ Invoke renew-customer-group              │
│   serviceCall: true                      │
│   resellerId: <from API key>             │
│   customerId: <from lookup>              │
│   planDuration: <from payload>           │
└──────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Skip JWT verification        │
│ Verify reseller owns customer│
│ Proceed with renewal         │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Renew ALL connections        │
│ Sync to HighLevel            │
│ Add renewal_success tag      │
└──────────────────────────────┘
```

---

## Edge Functions to Redeploy

- `renew-customer-group`
- `webhook`

---

## Testing

1. Send the same renewal webhook payload
2. Verify no 401 error occurs
3. Check customer expiration date is extended
4. Verify HighLevel contact has `renewal_success` tag
