

# Fix: Customer Type Classification for Renewals

## Problem Identified

The `renew-customer-group` function incorrectly classifies customers as MAG or M3U based on whether `mac_address` is truthy:

```typescript
// Current logic (line 470-471)
const magCustomers = groupCustomers.filter(c => c.mac_address);
const m3uCustomers = groupCustomers.filter(c => !c.mac_address);
```

**Michael Kennon** has:
- `device_type: Smart TV` → This is an **M3U** device
- `mac_address: 00:00:00:00:00:00` → This is a **placeholder**, not a real MAC
- `connection_list` with username/password credentials (M3U format)

Because `'00:00:00:00:00:00'` is a truthy string, the customer is incorrectly routed to `renew-mag-user` instead of `renew-trex-user`.

The `renew-mag-user` function then correctly logs:
```
⚠️ Connection 1 missing MAC address, skipping
```
...because the credentials in `connection_list` don't have a valid MAC.

---

## Solution

Fix the classification logic to use `device_type` instead of `mac_address` presence:

```typescript
// Fixed logic
const isMagDevice = (deviceType: string) => {
  const magTypes = ['MAG Box', 'STB Device', 'MAG 254', 'MAG 256', 'MAG 322', 'MAG 424', 'Other MAG'];
  return magTypes.some(t => deviceType?.toLowerCase().includes(t.toLowerCase()) || 
                            deviceType?.toLowerCase().includes('mag') ||
                            deviceType?.toLowerCase().includes('stb'));
};

const magCustomers = groupCustomers.filter(c => isMagDevice(c.device_type));
const m3uCustomers = groupCustomers.filter(c => !isMagDevice(c.device_type));
```

This ensures:
- `Smart TV`, `Android Box`, `Fire TV`, etc. → Routed to `renew-trex-user`
- `MAG Box`, `MAG 254`, `STB Device`, etc. → Routed to `renew-mag-user`

---

## Technical Change

### File: `supabase/functions/renew-customer-group/index.ts`

**Lines 469-471** - Replace the customer classification logic:

```typescript
// Before
const magCustomers = groupCustomers.filter(c => c.mac_address);
const m3uCustomers = groupCustomers.filter(c => !c.mac_address);

// After
// Helper function to determine if device is MAG type
const isMagDevice = (deviceType: string | null | undefined): boolean => {
  if (!deviceType) return false;
  const dt = deviceType.toLowerCase();
  return dt.includes('mag') || dt.includes('stb');
};

const magCustomers = groupCustomers.filter(c => isMagDevice(c.device_type));
const m3uCustomers = groupCustomers.filter(c => !isMagDevice(c.device_type));
```

---

## Edge Functions to Redeploy

- `renew-customer-group`

---

## Expected Result After Fix

```text
Customer: Michael Kennon
├── device_type: Smart TV → isMagDevice() returns false
├── Classified as: M3U customer ✅
└── Routed to: renew-trex-user ✅

Renewal flow:
1. Preflight validates connection_list credentials ✅ (already fixed)
2. Customer classified as M3U (by device_type) ✅
3. renew-trex-user called with correct credentials ✅
4. Trex API renewal succeeds ✅
```

