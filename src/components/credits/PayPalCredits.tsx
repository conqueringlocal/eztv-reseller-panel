import { useCreditPricing, priceLabel } from '@/hooks/useCreditPricing';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parsePayPalReturn } from '@/lib/payments/paypalReturn';

type Purchase = { id: string; reseller_id: string; credits: number; amount_cents: number; status: string; paypal_order_id: string | null; capture_id: string | null; review_reason: string | null; review_note: string | null; created_at: string };
const paymentsDb: SupabaseClient = supabase;
const labels: Record<string, string> = { created: 'Awaiting payment confirmation', credited: 'Credits added', review_required: 'Administrator review required', reviewed: 'Review resolved' };

export function PayPalCredits({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  return <PayPalCreditsForUser key={`${user?.id}:${admin}`} admin={admin} />;
}
function PayPalCreditsForUser({ admin }: { admin: boolean }) {
  const pricing = useCreditPricing(!admin);
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState('');
  const [credits, setCredits] = useState(10);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const returned = useRef(false);
  const storageKey = `eztv-paypal-purchase:${user?.id}`;
  const [pending, setPending] = useState<{requestId: string; credits: number; expectedUnitPriceCents: number} | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return saved ? { ...saved, expectedUnitPriceCents: saved.expectedUnitPriceCents ?? 300 } : null;
    } catch { return null; }
  });
  const unitPrice = pricing.data?.unit_price_cents;
  const checkoutPrice = pending?.credits === credits ? pending.expectedUnitPriceCents : unitPrice;
  const load = useCallback(async () => {
    if (!user?.id) return;
    let query = paymentsDb.from('paypal_credit_orders').select('id,reseller_id,credits,amount_cents,status,paypal_order_id,capture_id,review_reason,review_note,created_at').order('created_at', { ascending: false }).limit(admin ? 100 : 20);
    if (!admin) query = query.eq('reseller_id', user.id);
    const { data, error } = await query;
    if (!error) { setOrders(data || []); window.dispatchEvent(new CustomEvent('creditsUpdated')); }
    else setMessage('Purchase history could not be loaded. Refresh before sending another payment.');
  }, [admin, user?.id]);
  const confirm = useCallback(async (paypalOrderId: string, capture = false) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('paypal-credits', { body: { action: capture ? 'capture' : 'status', paypalOrderId } });
      if (error || data?.error) throw new Error('Payment is not confirmed yet. Check again before paying again.');
      setMessage(data.status === 'credited' ? 'Payment confirmed—your credits have been added.' : data.status === 'review_required' ? 'This payment needs administrator review. Please do not pay again.' : 'PayPal has not confirmed completion yet. Please check again shortly.');
      if (['credited', 'reviewed'].includes(data.status)) { localStorage.removeItem(storageKey); setPending(null); }
      await load();
    } catch { setMessage('Payment could not be confirmed. Check again before paying again.'); }
    finally { setBusy(false); }
  }, [load, storageKey]);
  useEffect(() => {
    if (!user?.id) return;
    void load();
    if (!admin) void supabase.functions.invoke('paypal-credits', { body: { action: 'config' } }).then(({ data, error }) => {
      if (!error) { setEnabled(data?.enabled === true); setEnvironment(data?.environment || ''); }
    });
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load(); window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [admin, load, user?.id]);
  useEffect(() => {
    if (!user?.id || admin || returned.current) return;
    const result = parsePayPalReturn(new URLSearchParams(window.location.search));
    if (result.kind === 'none') return;
    returned.current = true;
    if (result.kind === 'return') void confirm(result.paypalOrderId, true);
    else { localStorage.removeItem(storageKey); setPending(null); setMessage('Checkout cancelled. If PayPal shows a charge, check your purchase status before paying again.'); }
    const url = new URL(window.location.href);
    for (const key of ['paypal', 'token', 'PayerID']) url.searchParams.delete(key);
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [admin, confirm, storageKey, user?.id]);
  async function buy() {
    if (busy || !enabled || pricing.isError || !unitPrice) return;
    setBusy(true); setMessage('');
    try {
      const saved = localStorage.getItem(storageKey);
      const request = saved ? { expectedUnitPriceCents: 300, ...JSON.parse(saved) } : { requestId: crypto.randomUUID(), credits, expectedUnitPriceCents: unitPrice };
      if (request.credits >= 10 && request.credits !== credits) { setMessage(`An earlier ${request.credits}-credit checkout is unfinished. Select that package to resume it, or contact support.`); return; }
      localStorage.setItem(storageKey, JSON.stringify(request)); setPending(request);
      const { data, error } = await supabase.functions.invoke('paypal-credits', { body: { action: 'create', ...request } });
      let code = data?.error;
      if (!code && error?.context instanceof Response) code = (await error.context.json()).error;
      if (code === 'minimum_credit_purchase') {
        localStorage.removeItem(storageKey); setPending(null); setCredits(10);
        setMessage('The minimum purchase is now 10 credits. Review the package and continue.'); return;
      }
      if (code === 'price_changed') {
        localStorage.removeItem(storageKey); setPending(null);
        await pricing.refetch(); setMessage('Your price changed. Review the updated price before continuing.'); return;
      }
      if (code === 'existing_order_price_changed') { setMessage('Your earlier checkout has a different saved price. Check its payment history or contact support before paying again.'); return; }
      if (error || code) throw new Error('Checkout unavailable');
      if (data.status) { setMessage(labels[data.status] || 'Check your purchase status.'); if (['credited', 'reviewed'].includes(data.status)) { localStorage.removeItem(storageKey); setPending(null); } await load(); return; }
      const url = new URL(data.approve_url);
      const host = environment === 'live' ? 'www.paypal.com' : 'www.sandbox.paypal.com';
      if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) throw new Error('Invalid checkout destination');
      window.location.assign(url.href);
    } catch { setMessage('Checkout could not be confirmed. Retry the same purchase or check its status before paying manually.'); }
    finally { setBusy(false); }
  }
  async function resolveReview(orderId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await paymentsDb.rpc('resolve_paypal_credit_review', { p_id: orderId, p_note: reviewNotes[orderId] || '' });
      if (error) throw error;
      setMessage('Review resolved. This action does not change money or credits.'); await load();
    } catch { setMessage('Review could not be resolved. Check the outcome note and refresh.'); }
    finally { setBusy(false); }
  }
  if (!enabled && !orders.length && !message) return null;
  return <Card className="mb-6"><CardHeader><CardTitle>{admin ? 'PayPal purchases and payment reviews' : 'Buy credits with PayPal'}</CardTitle></CardHeader><CardContent className="space-y-4">
    {message && <p role="status" className="text-sm">{message}</p>}
    {!admin && enabled && <>
      {environment === 'sandbox' && <p className="font-semibold">Test checkout—no real payment.</p>}
      {pricing.isError ? <p role="alert">Unable to load your price. <Button variant="outline" onClick={() => void pricing.refetch()}>Retry</Button></p> : !unitPrice ? <p>Loading your price…</p> : <p>Minimum purchase: 10 credits. Credits cost {priceLabel(unitPrice)} USD each and are added automatically after PayPal confirms payment.</p>}
      {pending && <p className="text-sm">Your unfinished {pending.credits}-credit checkout keeps its original total of {priceLabel(pending.credits * pending.expectedUnitPriceCents)} USD. Select that package to resume it.</p>}
      <Label htmlFor="paypal-package">Credit package</Label>
      <select id="paypal-package" className="w-full rounded border bg-background p-2" value={credits} disabled={busy || !unitPrice || pricing.isError} onChange={e => setCredits(Number(e.target.value))}>
        {[10,20,50].map(n => <option key={n} value={n}>{n} credits · {unitPrice && !pricing.isError ? `${priceLabel(n * (pending?.credits === n ? pending.expectedUnitPriceCents : unitPrice))} USD${pending?.credits === n ? ' (saved checkout)' : ''}` : 'Price unavailable'}</option>)}
      </select>
      <Button disabled={busy || !unitPrice || pricing.isError} onClick={() => void buy()}>{busy ? 'Checking payment…' : checkoutPrice ? `Pay ${priceLabel(credits * checkoutPrice)} with PayPal` : 'Loading price…'}</Button>
      <p className="text-sm text-muted-foreground">Use one payment method per purchase. A payment awaiting confirmation does not need another payment.</p>
    </>}
    {admin && <p className="text-sm">Refunds, reversals and disputes require review. Check PayPal, then record any refund and credit adjustment using the existing finance and credit tools. No automatic credit clawback is applied.</p>}
    {orders.map(order => <div key={order.id} className="space-y-1 rounded border p-3 text-sm">
      <p className="font-medium">{order.credits} credits · ${(order.amount_cents / 100).toFixed(2)} USD · {labels[order.status]}</p>
      <p>{new Date(order.created_at).toLocaleString()}</p>
      <p className="break-all">Purchase: {order.id}</p>
      {admin && <><p className="break-all">Reseller: {order.reseller_id}</p><p className="break-all">PayPal capture: {order.capture_id || 'Not recorded'}</p>{order.review_reason && <p>{order.review_reason}</p>}</>}
      {admin && order.status === 'review_required' && <div className="space-y-2">
        <Label htmlFor={`review-${order.id}`}>Verified payment/refund and credit adjustment outcome</Label>
        <Input id={`review-${order.id}`} value={reviewNotes[order.id] || ''} onChange={e => setReviewNotes(notes => ({ ...notes, [order.id]: e.target.value }))} maxLength={1000} />
        <Button variant="outline" disabled={busy || (reviewNotes[order.id] || '').trim().length < 10} onClick={() => void resolveReview(order.id)}>Mark review resolved</Button>
      </div>}
      {admin && order.review_note && <p>{order.review_note}</p>}
      {!admin && order.status === 'created'  && order.paypal_order_id && <Button variant="outline" disabled={busy} onClick={() => void confirm(order.paypal_order_id!, true)}>Check payment</Button>}
    </div>)}
  </CardContent></Card>;
}
