

# Payment Integration: PayPal

## Current Status
- **Active Payment Processor**: PayPal (replaced Stripe due to account suspension)
- **Stripe Status**: Account suspended, edge functions (`create-checkout`, `verify-checkout`, `stripe-webhook`) still exist but are unused
- **`PURCHASES_ENABLED`**: `true` — PayPal checkout is live

## PayPal Edge Functions
- `create-paypal-order` — Creates a PayPal order and returns approval URL
- `verify-paypal-order` — Captures payment and adds credits to reseller account

## Secrets Required
- `PAYPAL_CLIENT_ID` — PayPal app client ID
- `PAYPAL_SECRET_KEY` — PayPal app secret key

## Flow
1. Reseller clicks "Buy with PayPal" on credits page
2. `create-paypal-order` creates order via PayPal REST API
3. User redirected to PayPal in new tab to approve payment
4. PayPal redirects back with `token` (order ID) in URL params
5. `verify-paypal-order` captures the payment and adds credits

## To Restore Stripe
If Stripe is restored, set `PURCHASES_ENABLED = false` temporarily, update the package IDs back to Stripe price IDs, and switch the function calls back to `create-checkout` / `verify-checkout`.
