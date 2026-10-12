import { Config, Order, PaymentError, approveUrl, createPayPal, receipt } from './paypal.ts';
// Supabase adapter boundary: all mutations below must check error before acknowledging.
// deno-lint-ignore no-explicit-any
export function createHandler(db: any, authenticate: (jwt: string) => Promise<string | null>, env: (key: string) => string | undefined, webhook = false) {
  const cors = { 'Access-Control-Allow-Origin': 'https://reseller.eztvclub.com', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  // deno-lint-ignore no-explicit-any
  const checked = (result: any) => { if (result.error) {
    if (['price_changed', 'existing_order_price_changed'].includes(result.error.message)) throw new PaymentError(result.error.message, 409);
    throw new PaymentError('payment_state_unconfirmed');
  } return result.data; };
  function configuration(): Config | null {
    const environment = env('EZTV_PAYPAL_ENV');
    const clientId = env('EZTV_PAYPAL_CLIENT_ID'), secret = env('EZTV_PAYPAL_CLIENT_SECRET'), webhookId = env('EZTV_PAYPAL_WEBHOOK_ID'), merchantId = env('EZTV_PAYPAL_MERCHANT_ID');
    if (!['live', 'sandbox'].includes(environment || '') || !clientId || !secret || !webhookId || !merchantId) return null;
    let appUrl = 'https://reseller.eztvclub.com';
    if (environment === 'sandbox') {
      try {
        const url = new URL(env('EZTV_PAYPAL_APP_URL') || '');
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname === 'reseller.eztvclub.com') return null;
        appUrl = url.origin;
      } catch { return null; }
    }
    return { environment: environment as 'live' | 'sandbox', clientId, secret, webhookId, merchantId, appUrl };
  }
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    try {
      let user: string | null = null;
      if (!webhook) {
        const match = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
        if (!match || !(user = await authenticate(match[1]))) return json({ error: 'Sign in required.' }, 401);
      }
      const raw = await req.text();
      if (raw.length > 131072) return json({ error: 'request_too_large' }, 413);
      const body = JSON.parse(raw || '{}');
      const config = configuration();
      if (!webhook && body.action === 'config') {
        const setting = checked(await db.from('paypal_credit_settings').select('enabled,environment').eq('id', true).single());
        return json({ enabled: !!config && env('EZTV_PAYPAL_ENABLED') === 'true' && setting.enabled && setting.environment === config.environment, environment: config?.environment });
      }
      if (!config) throw new PaymentError('checkout_unavailable');
      const paypal = createPayPal(config);
      async function lookup(id: string, owned = false): Promise<Order> {
        if (!/^[A-Z0-9]{8,64}$/.test(id)) throw new PaymentError('invalid_order', 400);
        let query = db.from('paypal_credit_orders').select('*').eq('paypal_order_id', id).eq('environment', config!.environment);
        if (owned) query = query.eq('reseller_id', user);
        const order = checked(await query.maybeSingle());
        if (!order) throw new PaymentError('order_not_found', 404);
        return order;
      }
      async function fulfill(order: Order, eventId?: string, mayCapture = false) {
        if (order.status !== 'created') return { status: order.status };
        let response = await paypal.getOrder(order.paypal_order_id!);
        // Validate identity and price even before any attempt to capture money.
        receipt(response, order, config!.merchantId);
        if (response.status === 'APPROVED' && mayCapture) response = await paypal.capture(order);
        const cap = receipt(response, order, config!.merchantId);
        if (!cap) return { status: 'pending' };
        const status = checked(await db.rpc('fulfill_paypal_credit_order', { p_id: order.id, p_environment: config!.environment, p_order: order.paypal_order_id, p_capture: cap.captureId, p_amount: order.amount_cents, p_fee: cap.feeCents, p_event: eventId || null }));
        return { status };
      }
      if (webhook) {
        const event = await paypal.verify(raw, req.headers);
        if (typeof event.id !== 'string' || event.id.length > 200 || typeof event.event_type !== 'string') throw new PaymentError('invalid_event', 400);
        const r = event.resource || {};
        if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
          const result = await fulfill(await lookup(r.id), undefined, true);
          // Approval can have a pending capture; the completed event will finish it.
          return json(result);
        }
        if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
          const result = await fulfill(await lookup(r.supplementary_data?.related_ids?.order_id), event.id);
          if (result.status === 'pending') throw new PaymentError('capture_not_yet_confirmed');
          return json(result);
        }
        if (['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.DECLINED','CUSTOMER.DISPUTE.CREATED'].includes(event.event_type)) {
          let capture = r.id, orderId = r.supplementary_data?.related_ids?.order_id;
          if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
            const link = r.links?.find((l: {rel: string}) => l.rel === 'up')?.href;
            const match = typeof link === 'string' ? /^https:\/\/api(?:-m)?\.(?:sandbox\.)?paypal\.com\/v2\/payments\/captures\/([A-Z0-9]{8,64})$/.exec(link) : null;
            if (!match) throw new PaymentError('refund_capture_unresolved');
            capture = match[1];
            orderId = (await paypal.getCapture(capture)).supplementary_data?.related_ids?.order_id;
          }
          if (event.event_type === 'CUSTOMER.DISPUTE.CREATED') {
            if (r.disputed_transactions?.length !== 1) throw new PaymentError('dispute_requires_reconciliation');
            capture = r.disputed_transactions[0].seller_transaction_id;
            orderId = capture;
          }
          return json({ status: checked(await db.rpc('review_paypal_credit_event', { p_event: event.id, p_type: event.event_type, p_capture: capture, p_order: orderId || null })) });
        }
        return json({ status: 'ignored' });
      }
      if (body.action === 'create') {
        if (env('EZTV_PAYPAL_ENABLED') !== 'true') throw new PaymentError('checkout_unavailable');
        if (Number.isInteger(body.credits) && body.credits < 10) throw new PaymentError('minimum_credit_purchase', 400);
        if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.requestId || '') || ![10,20,50].includes(body.credits)) throw new PaymentError('invalid_purchase', 400);
        if (body.expectedUnitPriceCents !== undefined && (!Number.isInteger(body.expectedUnitPriceCents) || body.expectedUnitPriceCents < 1 || body.expectedUnitPriceCents > 42949672)) throw new PaymentError('invalid_purchase', 400);
        const order: Order = checked(await db.rpc('prepare_paypal_credit_order_priced', { p_id: body.requestId, p_actor: user, p_credits: body.credits, p_environment: config.environment, p_expected_unit_price_cents: body.expectedUnitPriceCents ?? 300 }));
        if (order.status !== 'created') return json({ status: order.status });
        if (order.paypal_order_id) {
          const remote = await paypal.getOrder(order.paypal_order_id);
          if (remote.status !== 'CREATED' && remote.status !== 'PAYER_ACTION_REQUIRED') return json(await fulfill(order, undefined, true));
          return json({ approve_url: approveUrl(remote.links?.find((l: {rel: string}) => l.rel === 'approve' || l.rel === 'payer-action')?.href, config.environment) });
        }
        const created = await paypal.create(order);
        // PostgREST reapplies the OR filter to the returned update rows. Include
        // its column in the projection or the generated query fails with 42703.
        const saved = checked(await db.from('paypal_credit_orders').update({ paypal_order_id: created.id }).eq('id', order.id).or(`paypal_order_id.is.null,paypal_order_id.eq.${created.id}`).select('id,paypal_order_id'));
        if (saved.length !== 1 || saved[0].id !== order.id || saved[0].paypal_order_id !== created.id) throw new PaymentError('order_storage_unconfirmed');
        return json({ approve_url: created.url });
      }
      if (body.action === 'capture' || body.action === 'status') return json(await fulfill(await lookup(body.paypalOrderId, true), undefined, body.action === 'capture'));
      return json({ error: 'invalid_action' }, 400);
    } catch (error) {
      const known = error instanceof PaymentError;
      return json({ error: known ? error.code : 'payment_unconfirmed', message: 'Payment could not be confirmed. Check your purchase status before paying again.' }, known ? error.status : 503);
    }
  };
}
