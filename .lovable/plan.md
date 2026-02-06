

# Surgical Implementation: Reseller M3U Domain Override

This implementation adds the M3U domain override feature to the webhook handler. All changes are surgical - no refactoring or behavior changes outside explicitly listed items.

---

## File to Modify

`supabase/functions/webhook/enhancedWebhookHandler.ts`

---

## Change 1: Add DEFAULT_M3U_DOMAIN Constant

**Location:** Line 9 (after Supabase client initialization)

**Add:**
```typescript
const DEFAULT_M3U_DOMAIN = Deno.env.get('DEFAULT_M3U_DOMAIN') || 'vpn.eztvclub.online';
```

---

## Change 2: Add rewriteM3uDomain Helper Function

**Location:** After line 44 (after `maskIdentifier` helper)

**Add exact code:**
```typescript
// Rewrite M3U URL to use reseller's custom domain (or platform default)
// Always enforces DEFAULT_M3U_DOMAIN if no override is provided
function rewriteM3uDomain(
  originalUrl: string | undefined | null,
  domainOverride: string | null | undefined,
  defaultDomain: string
): string | undefined {
  if (!originalUrl) return undefined;

  try {
    const url = new URL(originalUrl);

    const targetDomainRaw =
      domainOverride && domainOverride.trim() !== ''
        ? domainOverride.trim()
        : defaultDomain;

    // Normalize override (supports with or without protocol)
    const targetHost = targetDomainRaw
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .trim();

    if (!targetHost) return originalUrl;

    // Replace ONLY host — preserve protocol, path, query, port
    url.host = targetHost;

    return url.toString();
  } catch {
    console.log('⚠️ M3U URL rewrite failed (using original)');
    return originalUrl;
  }
}
```

---

## Change 3: Update getResellerByApiKey to Include m3uDomainOverride

**Location:** Lines 209-230

**Before:**
```typescript
const { data: apiKeyData, error: apiKeyError } = await supabase
  .from('reseller_api_keys')
  .select(`
    reseller_id,
    is_active,
    profiles!inner(credits, name, provider)
  `)
  .eq('api_key', apiKey)
  .eq('is_active', true)
  .single();

...

return {
  resellerId: apiKeyData.reseller_id,
  credits: apiKeyData.profiles.credits,
  name: apiKeyData.profiles.name,
  provider: 'trex' // Trex-only mode
};
```

**After:**
```typescript
const { data: apiKeyData, error: apiKeyError } = await supabase
  .from('reseller_api_keys')
  .select(`
    reseller_id,
    is_active,
    profiles!inner(credits, name, provider, m3u_domain_override)
  `)
  .eq('api_key', apiKey)
  .eq('is_active', true)
  .single();

...

return {
  resellerId: apiKeyData.reseller_id,
  credits: apiKeyData.profiles.credits,
  name: apiKeyData.profiles.name,
  provider: 'trex',
  m3uDomainOverride: apiKeyData.profiles.m3u_domain_override || null
};
```

---

## Change 4: Update Legacy Reseller Lookup

**Location:** Lines 1331-1350

**Before:**
```typescript
const { data: reseller, error: resellerError } = await supabase
  .from('profiles')
  .select('id, credits, name, provider')
  .eq('id', payload.resellerId)
  .single();

...

resellerData = {
  resellerId: reseller.id,
  credits: reseller.credits,
  name: reseller.name,
  provider: reseller.provider || 'trex'
};
```

**After:**
```typescript
const { data: reseller, error: resellerError } = await supabase
  .from('profiles')
  .select('id, credits, name, provider, m3u_domain_override')
  .eq('id', payload.resellerId)
  .single();

...

resellerData = {
  resellerId: reseller.id,
  credits: reseller.credits,
  name: reseller.name,
  provider: reseller.provider || 'trex',
  m3uDomainOverride: reseller.m3u_domain_override || null
};
```

---

## Change 5: Update createTrialAccount to Apply Domain Rewrite

**Location:** Lines 405-439

Apply rewrite before syncing to HighLevel and in response. Update the credentials list and response to use rewritten URLs.

**Insert after line 400 (before HighLevel sync):**
```typescript
// Rewrite M3U URL for domain override (uses reseller's custom domain or platform default)
const resellerM3uDomainOverride = resellerData?.m3uDomainOverride || null;
const rewrittenM3uUrl = rewriteM3uDomain(
  data.customer?.m3uUrl,
  resellerM3uDomainOverride,
  DEFAULT_M3U_DOMAIN
);
console.log('🔗 M3U domain override applied:', !!resellerM3uDomainOverride);
```

**Update HighLevel sync (lines 406-420):**
```typescript
const credentialsList = [{
  username: data.customer.username,
  password: data.customer.password,
  m3u_url: rewrittenM3uUrl
}];
```

**Update response (lines 422-439) to use rewrittenM3uUrl:**
```typescript
m3u_url: rewrittenM3uUrl,
...
m3u_url_1: rewrittenM3uUrl,
```

Note: This requires passing `resellerData` to `createTrialAccount` function signature.

---

## Change 6: Update createConsolidatedAccount to Apply Domain Rewrite

**Location:** Lines 543-648

**After line 551, add rewrite logic:**
```typescript
// Rewrite M3U URLs for all connections (uses reseller's custom domain or platform default)
const rewrittenConnectionDetails = consolidatedConnectionDetails.map((cred: any) => ({
  ...cred,
  m3u_url: rewriteM3uDomain(cred.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
}));
console.log('🔗 M3U domain override applied:', !!resellerData.m3uDomainOverride);
```

**Use `rewrittenConnectionDetails` everywhere instead of `consolidatedConnectionDetails`:**
- Database insert (`connection_list`, `connection_details`)
- Response (`credentials`, individual `m3u_url_N` fields)
- HighLevel sync

---

## Change 7: Update renewCustomerGroup to Apply Domain Rewrite

**Location:** Lines 783-810

**Replace credentials building logic:**
```typescript
let credentialsList: Array<{ username?: string; password?: string; m3u_url?: string }> = [];

if (customer.connection_list && Array.isArray(customer.connection_list) && customer.connection_list.length > 0) {
  credentialsList = customer.connection_list.slice(0, 3).map((conn: any) => ({
    username: conn.username,
    password: conn.password,
    m3u_url: rewriteM3uDomain(conn.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
  }));
} else if (customer.username || customer.password) {
  credentialsList = [{
    username: customer.username,
    password: customer.password,
    m3u_url: rewriteM3uDomain(customer.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
  }];
}

console.log('🔗 M3U domain override applied for renewal:', !!resellerData.m3uDomainOverride);
```

---

## Change 8: Update upgradeCustomerConnections to Apply Domain Rewrite

**Location:** Lines 1191-1285

**Step 1: Before database update (after line 1192), rewrite all URLs in updatedConnectionList:**
```typescript
// Rewrite M3U URLs for persistence and downstream use
const rewrittenConnectionList = updatedConnectionList.map((conn: any) => ({
  ...conn,
  m3u_url: rewriteM3uDomain(conn.m3u_url, resellerData.m3uDomainOverride, DEFAULT_M3U_DOMAIN)
}));
console.log('🔗 M3U domain override applied for upgrade:', !!resellerData.m3uDomainOverride);
```

**Step 2: Use `rewrittenConnectionList` in database update (line 1197):**
```typescript
connection_list: rewrittenConnectionList,
```

**Step 3: Use `rewrittenConnectionList` in HighLevel sync (lines 1239-1243):**
```typescript
const credentialsList = rewrittenConnectionList.slice(0, 3).map((conn: any) => ({
  username: conn.username,
  password: conn.password,
  m3u_url: conn.m3u_url
}));
```

**Step 4: Use `rewrittenConnectionList` in response (lines 1269-1285):**
```typescript
credentials: rewrittenConnectionList
...
rewrittenConnectionList.slice(0, 3).forEach((cred: any, index: number) => {
  ...
});
```

---

## Change 9: Update createTrialAccount Function Signature

**Current (line 331-336):**
```typescript
async function createTrialAccount(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerName: string, 
  provider: string
): Promise<EnhancedWebhookResult>
```

**Updated:**
```typescript
async function createTrialAccount(
  payload: EnhancedWebhookPayload, 
  resellerId: string, 
  resellerName: string, 
  provider: string,
  resellerData: any
): Promise<EnhancedWebhookResult>
```

**Also update the call site (line 1364):**
```typescript
return await createTrialAccount(payload, resellerData.resellerId, resellerData.name, resellerData.provider, resellerData);
```

---

## Summary of Changes

| Location | Change |
|----------|--------|
| Line 9 | Add `DEFAULT_M3U_DOMAIN` constant |
| After line 44 | Add `rewriteM3uDomain` helper |
| Lines 209-230 | Update `getResellerByApiKey` to include `m3u_domain_override` |
| Lines 1331-1350 | Update legacy reseller lookup to include `m3u_domain_override` |
| Lines 331-449 | Update `createTrialAccount` for domain rewrite |
| Lines 543-648 | Update `createConsolidatedAccount` for domain rewrite |
| Lines 783-810 | Update `renewCustomerGroup` for domain rewrite |
| Lines 1191-1285 | Update `upgradeCustomerConnections` for domain rewrite |
| Line 1364 | Update trial function call |

---

## Edge Function to Redeploy

- `webhook`

---

## Expected Behavior After Implementation

| Scenario | Result |
|----------|--------|
| No override configured | M3U URLs use `vpn.eztvclub.online` |
| Override = `custom.domain.com` | M3U URLs use `custom.domain.com` |
| Override = `https://custom.domain.com` | M3U URLs use `custom.domain.com` |
| Override = `custom.domain.com:8443` | M3U URLs use `custom.domain.com:8443` |
| Parse failure | Original URL returned (no breakage) |
| All flows (create/renew/upgrade/trial) | Rewritten URLs in DB, HighLevel, response |

