// Reused from V2 at 6fd3d97; route examples updated for V1.
// Parses the query string PayPal appends to our return/cancel URLs
// (paypal-credits sets return_url=".../reseller/credits?paypal=return",
// cancel_url=".../reseller/credits?paypal=cancel"; PayPal appends its own
// `token`/`PayerID` params on top of whichever one it redirects back to).
// Pure so it's unit-testable without React/router.

export type PayPalReturnParams =
  | { kind: 'return'; paypalOrderId: string }
  | { kind: 'cancel' }
  | { kind: 'none' }

export function parsePayPalReturn(search: URLSearchParams): PayPalReturnParams {
  const paypal = search.get('paypal')
  if (paypal === 'cancel') return { kind: 'cancel' }
  if (paypal === 'return') {
    const token = search.get('token')
    if (token) return { kind: 'return', paypalOrderId: token }
  }
  return { kind: 'none' }
}
