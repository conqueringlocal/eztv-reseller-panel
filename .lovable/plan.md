

# Fix: `userProfile is not defined` Error in renew-customer-group

## Root Cause

The error occurs at line 466:
```typescript
console.log(`⚡ ADMIN OVERRIDE: Bypassing credit check for admin ${userProfile.email}`);
```

The variable `userProfile` is only defined inside the `if (!isServiceCall)` block (line 202-206), but line 466 is reached when `isAdminOverride` is true, which can only happen for **non-service calls** where an admin is logged in.

While this code path can only be hit during normal (non-service) calls, the JavaScript scoping means `userProfile` is not accessible at line 466 because it was declared inside a nested block.

## Solution

Replace `userProfile.email` with `userEmail` on line 466. The `userEmail` variable is properly scoped:
- Initialized at line 198: `let userEmail = 'service-call';`
- Updated at line 216: `userEmail = userProfile.email;` (inside the non-service call block)

This ensures the variable is always available regardless of block scoping.

---

## Technical Change

### File: `supabase/functions/renew-customer-group/index.ts`

**Line 466** - Replace `userProfile.email` with `userEmail`:

```typescript
// Before
console.log(`⚡ ADMIN OVERRIDE: Bypassing credit check for admin ${userProfile.email}`);

// After
console.log(`⚡ ADMIN OVERRIDE: Bypassing credit check for admin ${userEmail}`);
```

---

## Edge Functions to Redeploy

- `renew-customer-group`

---

## Expected Result

After this fix:
- Dashboard manual renewals will work again for admin users
- The credit bypass log will correctly display the admin's email
- Webhook-triggered renewals (service calls) continue to work as designed

