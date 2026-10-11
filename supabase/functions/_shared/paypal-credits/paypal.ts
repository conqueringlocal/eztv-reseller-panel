// Adapted from V2 _shared/payments/paypal.ts (6fd3d97). Keep Orders v2 flow;
// add durable request IDs, strict receipt checks, timeouts and raw-body verification.
export class PaymentError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export type Config = { environment: 'live' | 'sandbox'; clientId: string; secret: string; webhookId: string; merchantId: string; appUrl: string };
export type Order = { id: string; reseller_id: string; environment: string; credits: number; amount_cents: number; paypal_order_id: string | null; status: string };
export function cents(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,8}\.\d{2}$/.test(value)) throw new PaymentError('invalid_amount', 422);
  return Number(value.replace('.', ''));
}
export function approveUrl(value: unknown, environment: string): string {
  if (typeof value !== 'string') throw new PaymentError('missing_approval_url');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== (environment === 'live' ? 'www.paypal.com' : 'www.sandbox.paypal.com') || url.username || url.password || url.port) throw new PaymentError('invalid_approval_url');
  return url.href;
}
// PayPal response objects are validated here before being trusted.
// deno-lint-ignore no-explicit-any
export function receipt(body: any, order: Order, merchantId: string) {
  if (body?.id !== order.paypal_order_id || body?.purchase_units?.length !== 1) throw new PaymentError('order_mismatch', 422);
  const unit = body.purchase_units[0];
  if (unit.custom_id !== order.id || unit.payee?.merchant_id !== merchantId || unit.amount?.currency_code !== 'USD' || cents(unit.amount?.value) !== order.amount_cents) throw new PaymentError('payment_mismatch', 422);
  if (body.status !== 'COMPLETED') return null;
  if (unit.payments?.captures?.length !== 1) throw new PaymentError('capture_mismatch', 422);
  const cap = unit.payments.captures[0];
  if (cap.status !== 'COMPLETED') return null;
  if (!/^[A-Z0-9]{8,64}$/.test(cap.id) || cap.final_capture !== true || cap.amount?.currency_code !== 'USD' || cents(cap.amount?.value) !== order.amount_cents) throw new PaymentError('capture_mismatch', 422);
  const fee = cap.seller_receivable_breakdown?.paypal_fee;
  if (fee && fee.currency_code !== 'USD') throw new PaymentError('fee_currency_mismatch', 422);
  return { captureId: cap.id as string, feeCents: fee ? cents(fee.value) : null };
}
export function createPayPal(config: Config, request: typeof fetch = fetch) {
  const base = config.environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  async function api(path: string, method = 'GET', body?: string, key?: string) {
    const tokenResponse = await request(`${base}/v1/oauth2/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${btoa(`${config.clientId}:${config.secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    if (!tokenResponse.ok) throw new PaymentError('paypal_auth_unavailable');
    const token = (await tokenResponse.json()).access_token;
    if (typeof token !== 'string') throw new PaymentError('paypal_auth_unavailable');
    const res = await request(base + path, { method, body, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(key ? { 'PayPal-Request-Id': key } : {}),
    } });
    if (!res.ok) throw new PaymentError('paypal_request_unconfirmed');
    return res.json();
  }
  return {
    async create(order: Order) {
      const body = await api('/v2/checkout/orders', 'POST', JSON.stringify({ intent: 'CAPTURE',
        purchase_units: [{ custom_id: order.id, payee: { merchant_id: config.merchantId }, description: `${order.credits} EZTV reseller credits`, amount: { currency_code: 'USD', value: (order.amount_cents / 100).toFixed(2) } }],
        application_context: { return_url: `${config.appUrl}/reseller/credits?paypal=return`, cancel_url: `${config.appUrl}/reseller/credits?paypal=cancel`, shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', brand_name: 'EZTV' },
      }), `create-${order.id}`);
      if (!/^[A-Z0-9]{8,64}$/.test(body.id)) throw new PaymentError('invalid_order_response');
      return { id: body.id as string, url: approveUrl(body.links?.find((l: {rel: string}) => l.rel === 'approve' || l.rel === 'payer-action')?.href, config.environment) };
    },
    getOrder: (id: string) => api(`/v2/checkout/orders/${encodeURIComponent(id)}`),
    getCapture: (id: string) => api(`/v2/payments/captures/${encodeURIComponent(id)}`),
    capture: (order: Order) => api(`/v2/checkout/orders/${encodeURIComponent(order.paypal_order_id!)}/capture`, 'POST', '{}', `capture-${order.id}`),
    async verify(raw: string, headers: Headers) {
      const names = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
      if (names.some(name => !headers.get(name))) throw new PaymentError('invalid_signature', 400);
      const cert = new URL(headers.get('paypal-cert-url')!);
      const certHosts = config.environment === 'live' ? ['api-m.paypal.com', 'api.paypal.com'] : ['api-m.sandbox.paypal.com', 'api.sandbox.paypal.com'];
      if (cert.protocol !== 'https:' || !certHosts.includes(cert.hostname) || cert.username || cert.password || cert.port || !cert.pathname.startsWith('/v1/notifications/certs/')) throw new PaymentError('invalid_signature', 400);
      const data = { auth_algo: headers.get(names[0]), cert_url: headers.get(names[1]), transmission_id: headers.get(names[2]), transmission_sig: headers.get(names[3]), transmission_time: headers.get(names[4]), webhook_id: config.webhookId };
      const body = JSON.stringify(data).slice(0, -1) + ',"webhook_event":' + raw + '}';
      const verified = await api('/v1/notifications/verify-webhook-signature', 'POST', body);
      if (verified.verification_status !== 'SUCCESS') throw new PaymentError('invalid_signature', 400);
      return JSON.parse(raw);
    },
  };
}
