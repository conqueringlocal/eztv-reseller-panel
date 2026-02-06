

# Implementation: Upgrade Must Renew Existing Connections via Trex API

## Overview

This implementation adds provider-side renewal for existing connections during the upgrade action. Currently, upgrades only update local expiration dates without calling the Trex API, which leaves existing subscriptions un-renewed on the panel.

## Changes to `supabase/functions/webhook/enhancedWebhookHandler.ts`

### Change 1: Add Identifier Masking Helper (After line 25)

```typescript
// Helper to mask identifiers for sanitized logging
// MAC: show first 8 chars + ":xx:xx:xx" (e.g., "00:1A:2B:xx:xx:xx")
// Username: show first 2 + last 2 chars (or full if <= 4 chars)
function maskIdentifier(value: string | undefined, isMac: boolean): string {
  if (!value) return '[empty]';
  
  if (isMac) {
    if (value.length >= 8) {
      return value.substring(0, 8) + ':xx:xx:xx';
    }
    return value.substring(0, 2) + ':xx:xx:xx';
  } else {
    if (value.length <= 4) {
      return value;
    }
    return value.substring(0, 2) + '***' + value.substring(value.length - 2);
  }
}
```

### Change 2: Add Trex Renewal Helper Function (After masking helper)

```typescript
// Helper to renew a single existing connection via Trex API
// Supports both M3U (username+password) and MAG (mac_address) accounts
// NEVER logs passwords, tokens, or m3u_url - only masked identifiers
async function renewConnectionViaTrex(
  connection: { username?: string; password?: string; mac_address?: string },
  planDurationMonths: number
): Promise<{ success: boolean; error?: string }> {
  const trexApiKey = Deno.env.get('TREX_API_KEY');
  const panelUrl = Deno.env.get('TREX_PANEL_URL') || 'https://activationpanel.net/api/api.php';

  if (!trexApiKey) {
    return { success: false, error: 'Trex API key not configured' };
  }

  // Map plan duration to subscription format
  const subMapping: { [key: number]: string } = { 1: '1', 3: '3', 6: '6', 12: '12', 24: '99' };
  const subscriptionPeriod = subMapping[planDurationMonths] || '1';

  const isMagAccount = !!connection.mac_address;
  const accountType = isMagAccount ? 'mag' : 'm3u';

  const renewUrl = new URL(panelUrl);
  renewUrl.searchParams.append('api_key', trexApiKey);
  renewUrl.searchParams.append('action', 'renew');
  renewUrl.searchParams.append('type', accountType);
  renewUrl.searchParams.append('sub', subscriptionPeriod);

  if (isMagAccount) {
    renewUrl.searchParams.append('mac', connection.mac_address!);
  } else {
    renewUrl.searchParams.append('username', connection.username || '');
    renewUrl.searchParams.append('password', connection.password || '');
  }

  try {
    // SANITIZED LOG - only log MASKED identifier
    const rawIdentifier = isMagAccount ? connection.mac_address : connection.username;
    const maskedIdentifier = maskIdentifier(rawIdentifier, isMagAccount);
    console.log(`📡 Trex renewal API call for ${accountType}: ${maskedIdentifier}`);
    
    const response = await fetch(renewUrl.toString());
    const responseText = await response.text();
    
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    // SANITIZED LOG - only safe metadata
    console.log(`📡 Trex renewal response for ${maskedIdentifier}:`, {
      httpStatus: response.status,
      hasError: !!data.error,
      hasMessage: !!data.message,
      status: data.status,
      success: data.success
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    if (data.error) {
      return { success: false, error: data.error };
    }

    // STRICT success check - only clear success indicators
    const isSuccess = data.status === 'true' || data.status === true || 
                      data.success === true || data.status === 'success';
    
    if (isSuccess) {
      console.log(`✅ Trex renewal succeeded for ${maskedIdentifier}`);
      return { success: true };
    }

    // Unclear response = FAILURE
    console.error(`❌ Trex renewal returned unclear response for ${maskedIdentifier}:`, {
      status: data.status, success: data.success, hasError: !!data.error
    });
    return { success: false, error: 'Trex renewal returned unclear response' };
    
  } catch (error) {
    console.error(`❌ Trex renewal exception:`, error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### Change 3: Update Upgrade Flow (Replace lines 927-945)

Replace the block that only updates local expiration with one that calls Trex API for each existing connection:

```typescript
// 9. Migrate primary connection if connection_list is empty
if (existingConnectionList.length === 0 && customer.username && customer.password) {
  console.log('📦 Migrating primary connection to connection_list');
  existingConnectionList.push({
    connection_number: 1,
    username: customer.username,
    password: customer.password,
    mac_address: customer.mac_address || null,
    m3u_url: customer.m3u_url,
    expiration_date: customer.expiration_date,
    status: 'active'
  });
}

// 10. RENEW EXISTING CONNECTIONS VIA TREX API (provider-side renewal)
console.log(`🔄 Renewing ${existingConnectionList.length} existing connection(s) via Trex API...`);

for (let i = 0; i < existingConnectionList.length; i++) {
  const conn = existingConnectionList[i];
  const connNum = conn.connection_number || i + 1;
  
  console.log(`📡 Renewing existing connection ${connNum}/${existingConnectionList.length}...`);
  
  const renewResult = await renewConnectionViaTrex(
    {
      username: conn.username,
      password: conn.password,
      mac_address: conn.mac_address
    },
    planDurationMonths
  );
  
  if (!renewResult.success) {
    const errorMsg = `Failed to renew existing connection ${connNum}: ${renewResult.error}`;
    console.error(`❌ ${errorMsg}`);
    
    await syncHighLevelContact(
      resellerId,
      payload.contact_id,
      false,
      undefined,
      undefined,
      errorMsg
    );
    
    return {
      success: false,
      message: errorMsg,
      errors: ['upgrade_failed']
    };
  }
  
  // Update local expiration AFTER successful API renewal
  existingConnectionList[i] = {
    ...conn,
    expiration_date: newExpirationDateStr
  };
  
  console.log(`✅ Connection ${connNum} renewed and expiration updated to ${newExpirationDateStr}`);
}

console.log(`✅ All ${existingConnectionList.length} existing connection(s) renewed via Trex API`);
```

### Change 4: Renumber Step Comments

Update subsequent step numbers since we added step 10:
- Step 10 (create additional connections) becomes Step 11
- Step 11 (update database) becomes Step 12
- Step 12 (deduct credits) becomes Step 13
- etc.

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Existing connections renewed on Trex? | No | Yes - API call for each |
| Identifier logging | N/A | Masked (first 2 + last 2 chars for username, first 8 chars for MAC) |
| Unclear response handling | N/A | Treated as failure |
| Credits calculation | `requestedConnections * planDurationMonths` | Same (unchanged) |

## Files Modified

- `supabase/functions/webhook/enhancedWebhookHandler.ts`

## Edge Function to Redeploy

- `webhook`

