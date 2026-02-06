

# Fix: Preflight Validation for Consolidated Customers

## Problem

The webhook renewal is failing because the preflight validation checks the wrong credentials:

```text
Customer: Michael Kennon
├── Top-level fields (what preflight checks):
│   ├── username: NULL
│   ├── password: NULL
│   └── mac_address: 00:00:00:00:00:00  ← PLACEHOLDER
│
└── connection_list (actual credentials):
    └── [0]:
        ├── username: bd264af259  ← REAL CREDENTIAL
        ├── password: 4de2d92bca  ← REAL CREDENTIAL
        └── m3u_url: http://vpn.eztvclub.online/get.php?...
```

The preflight sends the placeholder MAC `00:00:00:00:00:00` to verify, which the Trex API correctly says doesn't exist.

---

## Solution

Update the preflight validation loop in `renew-customer-group` to:
1. Check if `connection_list` exists and has entries
2. If yes → verify each connection in the list
3. If no → fall back to top-level credentials (legacy single-connection)

Also ensure `renew-trex-user` is passed `serviceCall` flags so it doesn't require JWT.

---

## Technical Changes

### File 1: `supabase/functions/renew-customer-group/index.ts`

**Lines 306-328** - Replace the current preflight loop:

```typescript
for (const customer of groupCustomers) {
  const provider = customer.provider || 'trex';
  const connectionList = customer.connection_list;
  const hasConnectionList = Array.isArray(connectionList) && connectionList.length > 0;
  
  if (hasConnectionList) {
    // CONSOLIDATED CUSTOMER - verify each connection in the list
    console.log(`📋 Customer ${customer.name} has ${connectionList.length} connection(s) in connection_list`);
    
    for (const conn of connectionList) {
      const verification = await verifyConnectionExists(
        { 
          username: conn.username, 
          password: conn.password, 
          mac_address: conn.mac_address 
        },
        provider
      );
      
      if (!verification.exists) {
        console.log(`❌ PREFLIGHT FAILED: ${customer.name} connection ${conn.connection_number || '?'}`);
        missingConnections.push({
          name: `${customer.name} (Connection ${conn.connection_number || '?'})`,
          username: conn.username,
          mac_address: conn.mac_address,
          error: verification.error || 'Account not found in provider panel'
        });
      } else {
        console.log(`✅ PREFLIGHT PASSED: ${customer.name} connection ${conn.connection_number || '?'}`);
      }
    }
  } else {
    // LEGACY SINGLE-CONNECTION - use top-level fields
    const verification = await verifyConnectionExists(
      { 
        username: customer.username, 
        password: customer.password, 
        mac_address: customer.mac_address 
      },
      provider
    );
    
    if (!verification.exists) {
      console.log(`❌ PREFLIGHT FAILED: ${customer.name} does not exist in ${provider} panel`);
      missingConnections.push({
        name: customer.name,
        username: customer.username,
        mac_address: customer.mac_address,
        error: verification.error || 'Account not found in provider panel'
      });
    } else {
      console.log(`✅ PREFLIGHT PASSED: ${customer.name} exists in panel`);
    }
  }
}
```

**Lines 514-518** - Forward serviceCall flags to `renew-trex-user`:

```typescript
const { data, error } = await clientWithAuth.functions.invoke(functionName, {
  body: {
    customerId: customer.id,
    planDuration: planDuration,
    ...(isServiceCall ? { serviceCall: true, resellerId: providedResellerId } : {})
  }
});
```

**Lines 473-478** - Forward serviceCall flags to `renew-mag-user`:

```typescript
const { data, error } = await clientWithAuth.functions.invoke('renew-mag-user', {
  body: {
    customerId: customer.id,
    planDuration: planDuration,
    ...(isServiceCall ? { serviceCall: true, resellerId: providedResellerId } : {})
  }
});
```

---

### File 2: `supabase/functions/renew-trex-user/index.ts`

**Update interface (line 10):**
```typescript
interface RenewRequest {
  customerId: string;
  planDuration: number;
  serviceCall?: boolean;  // Skip JWT for internal calls
  resellerId?: string;    // Required when serviceCall=true
}
```

**Replace JWT verification (lines 40-61):**
```typescript
const { customerId, planDuration, serviceCall = false, resellerId: providedResellerId }: RenewRequest = await req.json();

let isServiceCall = false;

if (!serviceCall) {
  // Normal path: Verify JWT token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'No authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  // ... existing user authorization logic
} else {
  // Service call path: Skip JWT
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

**After fetching customer (line ~81), add reseller check for service calls:**
```typescript
if (isServiceCall) {
  if (customer.reseller_id !== providedResellerId) {
    return new Response(
      JSON.stringify({ error: 'Reseller ID mismatch' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  console.log(`✅ Service call authorized for reseller: ${providedResellerId}`);
}
```

---

### File 3: `supabase/config.toml`

Add JWT bypass for renewal functions (they handle auth internally):

```toml
[functions.renew-trex-user]
verify_jwt = false

[functions.renew-mag-user]
verify_jwt = false
```

---

## Expected Flow After Fix

```text
Webhook → renew-customer-group (serviceCall: true)
    │
    ▼
Preflight checks connection_list:
  └── username: bd264af259 → Trex API returns ✅ exists
    │
    ▼
renew-trex-user (serviceCall: true, resellerId)
  └── JWT bypassed → Trex API renews → ✅ Success
    │
    ▼
Database updated, HighLevel synced with renewal_success tag
```

---

## Edge Functions to Redeploy

- `renew-customer-group`
- `renew-trex-user`
- `renew-mag-user`

---

## Testing

Send the same webhook payload. Expected result:
- HTTP 200 with `success: true`
- Customer expiration extended by 1 month
- HighLevel contact receives `renewal_success` tag

