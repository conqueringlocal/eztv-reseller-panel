
# Fix Malformed M3U URL Issue - Use vpn.eztvclub.online Domain

## Problem

The Trex provider API returns M3U URLs with missing domain:
```
http:///get.php?username=04695d1e80&password=6b378d8755&type=m3u_plus&output=ts
```

The correct format should be:
```
http://vpn.eztvclub.online/get.php?username=04695d1e80&password=6b378d8755&type=m3u_plus&output=ts
```

---

## Solution Overview

Add a constant for the M3U streaming domain and update all edge functions to:
1. Detect malformed URLs from the provider (those starting with `http:///` or missing domain)
2. Always construct proper M3U URLs using `vpn.eztvclub.online`

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/create-trex-user/index.ts` | Add M3U domain constant, fix URL construction |
| `supabase/functions/add-connection-to-customer/index.ts` | Add M3U domain constant, fix URL construction |
| `supabase/functions/sync-device-info/index.ts` | Fix M3U URL when syncing from provider |
| `supabase/functions/renew-trex-user/index.ts` | No changes needed (doesn't update M3U URLs) |
| `supabase/functions/renew-single-connection/index.ts` | No changes needed (doesn't update M3U URLs) |

---

## Detailed Changes

### 1. create-trex-user/index.ts

**Add constant at top of file (around line 30):**
```typescript
// M3U streaming domain for Trex provider
const TREX_M3U_DOMAIN = 'vpn.eztvclub.online';
```

**Update M3U URL construction (lines 452-465):**

Replace the current logic that trusts the provider URL with logic that always constructs the correct URL:

```typescript
// Always construct M3U URL with correct domain
const m3uUrl = `http://${TREX_M3U_DOMAIN}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`;
console.log(`🔗 Constructed M3U URL: ${m3uUrl}`);
```

This removes the dependency on the provider's potentially malformed URL.

---

### 2. add-connection-to-customer/index.ts

**Add constant at top of file (around line 8):**
```typescript
// M3U streaming domain for Trex provider
const TREX_M3U_DOMAIN = 'vpn.eztvclub.online';
```

**Fix M3U URL in migration path (line 172):**

Change from:
```typescript
m3u_url: m3uUrl || `${baseUrl}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`,
```

To:
```typescript
m3u_url: `http://${TREX_M3U_DOMAIN}/get.php?username=${finalUsername}&password=${finalPassword}&type=m3u_plus&output=ts`,
```

**Fix M3U URL in normal flow (line 288):**

Same change - always construct with correct domain.

---

### 3. sync-device-info/index.ts

**Add constant and helper function at top of file:**
```typescript
// M3U streaming domain for Trex provider
const TREX_M3U_DOMAIN = 'vpn.eztvclub.online';

// Helper to fix malformed M3U URLs
function fixM3uUrl(url: string | undefined, username: string, password: string, provider: string): string | undefined {
  if (!username || !password) return url;
  
  // For Trex provider, always construct correct URL
  if (provider === 'trex') {
    return `http://${TREX_M3U_DOMAIN}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
  }
  
  // For other providers, check if URL is malformed (starts with http:///)
  if (url && url.startsWith('http:///')) {
    // URL is malformed - return undefined so it won't be used
    return undefined;
  }
  
  return url;
}
```

**Update sync response handling (lines 134-139):**

Change from:
```typescript
return {
  success: true,
  expire: dat.user_info?.exp_date || dat.expire,
  m3uUrl: dat.user_info?.url || dat.url,
  connectionNumber: connNum
};
```

To:
```typescript
return {
  success: true,
  expire: dat.user_info?.exp_date || dat.expire,
  m3uUrl: fixM3uUrl(dat.user_info?.url || dat.url, creds.username, creds.password, customer.provider),
  connectionNumber: connNum
};
```

Apply similar fix to single connection sync (lines 253-254).

---

## Why This Approach

1. **Reliability**: Always constructing the URL ensures consistent, correct M3U URLs regardless of what the provider returns
2. **Simple**: Single domain constant makes future updates easy
3. **Backward Compatible**: Existing customer records with correct URLs won't be affected
4. **HighLevel Sync**: Fixed URLs will be synced to HighLevel with correct format

---

## Testing Steps

After deployment:

1. Create a new Trex customer via webhook or UI
2. Verify the M3U URL in the database shows: `http://vpn.eztvclub.online/get.php?username=...`
3. Check HighLevel custom fields receive the correct URL format
4. Test "Add Connection" for existing customer - verify new connection has correct URL
5. Test "Sync Device" - verify it doesn't overwrite with malformed URL

---

## Edge Functions to Redeploy

- `create-trex-user`
- `add-connection-to-customer`
- `sync-device-info`
