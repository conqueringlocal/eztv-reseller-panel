// Parses the query string PayPal appends to our return/cancel URLs
// (payments-create-order sets return_url=".../app/billing?paypal=return",
// cancel_url=".../app/billing?paypal=cancel"; PayPal appends its own
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
