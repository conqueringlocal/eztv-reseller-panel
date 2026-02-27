

# Temporarily Disable Credit Purchases

## Changes

**File: `src/pages/reseller/ResellerCredits.tsx`**

Replace the purchase card section (when `credit_purchase_enabled` is true) with a notice banner instead of the Stripe checkout buttons:

- Show an `Alert` component with a message: "Credit purchases are temporarily unavailable. Please contact your administrator to have credits added to your account."
- Keep the credit balance display and credit history table intact
- Remove the buy buttons and pricing cards from rendering (but keep the code commented or behind a flag so it's easy to re-enable)

Add a simple boolean flag at the top of the file:
```typescript
const PURCHASES_ENABLED = false;
```

When `false`, show the unavailable notice instead of the purchase cards. When Stripe is restored, flip it to `true`.

