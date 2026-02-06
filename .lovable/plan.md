

# Upgrade = Renew + Add Connections Implementation

## Overview

Modify the `upgradeCustomerConnections()` function to:
1. Charge for ALL connections (not just delta)
2. Calculate a unified expiration date for all connections
3. Renew existing connections to the new expiration
4. Create additional connections with the same expiration
5. Sync all credentials to HighLevel with the unified date

---

## File to Modify

**`supabase/functions/webhook/enhancedWebhookHandler.ts`**

---

## Technical Changes

### Change 1: Update Credits Calculation (Lines 881-883)

Current:
```typescript
const creditsRequired = delta * planDurationMonths;
console.log(`💰 Credits calculation: delta=${delta} × duration=${planDurationMonths} = ${creditsRequired} credits`);
```

Updated:
```typescript
const creditsRequired = requestedConnections * planDurationMonths;
console.log(`💰 Credits calculation: connections=${requestedConnections} × duration=${planDurationMonths} = ${creditsRequired} credits (upgrade+renew)`);
```

---

### Change 2: Add Helper Function for Date Calculation

Add a helper function after the imports (around line 9) that matches SQL's interval behavior for robust month-end handling:

```typescript
// Helper to calculate expiration date, matching SQL interval behavior
function calculateNewExpirationDate(monthsToAdd: number): string {
  const now = new Date();
  const targetMonth = now.getMonth() + monthsToAdd;
  const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
  const actualMonth = targetMonth % 12;
  
  // Get the last day of the target month
  const lastDayOfTargetMonth = new Date(targetYear, actualMonth + 1, 0).getDate();
  
  // Use current day or last day of month if current day exceeds it
  const targetDay = Math.min(now.getDate(), lastDayOfTargetMonth);
  
  const result = new Date(targetYear, actualMonth, targetDay);
  return result.toISOString().split('T')[0];
}
```

---

### Change 3: Calculate Unified Expiration Date (After credits check, around line 905)

Insert after the credits check:
```typescript
// Calculate unified expiration date for all connections (upgrade = renew + add)
const newExpirationDateStr = calculateNewExpirationDate(planDurationMonths);
console.log(`📅 Unified expiration date: ${newExpirationDateStr} (now + ${planDurationMonths} months)`);
```

---

### Change 4: Update Existing Connection Expirations (Lines 906-917)

Current:
```typescript
// 9. Migrate primary connection if connection_list is empty
if (existingConnectionList.length === 0 && customer.username && customer.password) {
  console.log('📦 Migrating primary connection to connection_list');
  existingConnectionList.push({
    connection_number: 1,
    username: customer.username,
    password: customer.password,
    m3u_url: customer.m3u_url,
    expiration_date: customer.expiration_date,
    status: 'active'
  });
}
```

Updated:
```typescript
// 9. Migrate primary connection if connection_list is empty
if (existingConnectionList.length === 0 && customer.username && customer.password) {
  console.log('📦 Migrating primary connection to connection_list');
  existingConnectionList.push({
    connection_number: 1,
    username: customer.username,
    password: customer.password,
    m3u_url: customer.m3u_url,
    expiration_date: newExpirationDateStr, // Use new unified date
    status: 'active'
  });
} else {
  // Update expiration for ALL existing connections (renew portion of upgrade)
  console.log(`🔄 Renewing ${existingConnectionList.length} existing connection(s) to ${newExpirationDateStr}`);
  existingConnectionList = existingConnectionList.map((conn: any) => ({
    ...conn,
    expiration_date: newExpirationDateStr
  }));
}
```

---

### Change 5: Update New Connection Creation (Lines 942-984)

Update the expirationDate passed to create-iptv-user and stored in newConnections:

Current (lines 942-943):
```typescript
startDate: new Date().toISOString().split('T')[0],
expirationDate: customer.expiration_date, // Match existing expiration
```

Updated:
```typescript
startDate: new Date().toISOString().split('T')[0],
expirationDate: newExpirationDateStr, // Use unified new expiration
```

Current (line 982):
```typescript
expiration_date: customer.expiration_date, // Keep existing expiration
```

Updated:
```typescript
expiration_date: newExpirationDateStr, // Use unified new expiration
```

---

### Change 6: Update Database with New Expiration (Lines 1000-1008)

Current:
```typescript
.update({
  connection_list: updatedConnectionList,
  total_connections: requestedConnections,
  max_connections: requestedConnections
  // NOTE: expiration_date is NOT changed during upgrade
})
```

Updated:
```typescript
.update({
  connection_list: updatedConnectionList,
  total_connections: requestedConnections,
  max_connections: requestedConnections,
  expiration_date: newExpirationDateStr,
  plan_duration: planDurationMonths
})
```

---

### Change 7: Update Credit Log Note (Lines 1030-1037)

Current:
```typescript
notes: `Upgrade from ${currentConnections} to ${requestedConnections} connections (${delta} new × ${planDurationMonths} months)`
```

Updated:
```typescript
notes: `Upgrade+Renew: ${currentConnections} → ${requestedConnections} connections for ${planDurationMonths} months`
```

---

### Change 8: Update HighLevel Sync Expiration (Lines 1051-1058)

Current:
```typescript
await syncHighLevelContact(
  resellerId,
  contactIdToUse,
  true,
  credentialsList,
  customer.expiration_date, // Old date
  undefined,
  ['upgrade_success']
);
```

Updated:
```typescript
await syncHighLevelContact(
  resellerId,
  contactIdToUse,
  true,
  credentialsList,
  newExpirationDateStr, // New unified date
  undefined,
  ['upgrade_success']
);
```

---

### Change 9: Update Response End Date (Line 1070)

Current:
```typescript
end_date: customer.expiration_date, // No change during upgrade
```

Updated:
```typescript
end_date: newExpirationDateStr, // New unified expiration
```

---

## Summary of Changes

| Aspect | Before | After |
|--------|--------|-------|
| Credits charged | `delta × duration` | `requestedConnections × duration` |
| Existing connections renewed? | No | Yes |
| `expiration_date` updated? | No | Yes (all connections get same date) |
| HighLevel `service_expiration` | Old date | New unified date |
| Response `end_date` | Old date | New unified date |
| Date calculation | N/A (used old date) | Helper function matching SQL interval |

---

## Test Cases Validation

| Scenario | Connections | Duration | Credits |
|----------|-------------|----------|---------|
| 1 → 3 for 1 month | 3 | 1 | 3 |
| 1 → 2 for 6 months | 2 | 6 | 12 |
| 1 → 3 for 12 months | 3 | 12 | 36 |
| 2 → 3 for 3 months | 3 | 3 | 9 |

---

## Edge Function to Redeploy

- `webhook`

