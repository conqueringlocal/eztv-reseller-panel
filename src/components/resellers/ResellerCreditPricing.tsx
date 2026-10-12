import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pricingDb, priceLabel } from '@/hooks/useCreditPricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ResellerCreditPricing({ resellerId }: { resellerId: string }) {
  const query = useQuery({
    queryKey: ['reseller-credit-pricing', resellerId],
    queryFn: async () => {
      const { data, error } = await pricingDb.from('reseller_credit_pricing').select('unit_price_cents').eq('reseller_id', resellerId).maybeSingle();
      if (error) throw error;
      return (data?.unit_price_cents ?? null) as number | null;
    },
  });
  return <Card className="mb-6"><CardHeader><CardTitle>Credit purchase pricing</CardTitle></CardHeader><CardContent>
    {query.isLoading ? <p>Loading price…</p> : query.isError ? <p role="alert">Unable to load pricing. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p>
      : <PricingForm key={`${resellerId}:${query.data}`} resellerId={resellerId} current={query.data} />}
  </CardContent></Card>;
}
function PricingForm({ resellerId, current }: { resellerId: string; current: number | null }) {
  const cache = useQueryClient();
  const [value, setValue] = useState(current == null ? '' : (current / 100).toFixed(2));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const text = value.trim(), cents = text === '' ? null : Math.round(Number(text) * 100);
  const valid = text === '' || (/^\d+(\.\d{1,2})?$/.test(text) && cents > 0 && cents <= 42949672);
  async function save() {
    if (busy || !valid) return;
    setBusy(true); setMessage('');
    const { error } = await pricingDb.rpc('set_reseller_credit_price', { p_reseller: resellerId, p_price_cents: cents });
    if (error) { setMessage('Price could not be saved. Please try again.'); setBusy(false); return; }
    await cache.invalidateQueries({ queryKey: ['credit-pricing'] });
    await cache.invalidateQueries({ queryKey: ['reseller-credit-pricing', resellerId] });
    setMessage('Price saved.'); setBusy(false);
  }
  return <div className="space-y-3">
    <p>Current price: <strong>{priceLabel(current ?? 300)} USD per credit</strong>{current == null ? ' (standard)' : ''}.</p>
    <Label htmlFor="reseller-credit-price">Price per credit (USD)</Label>
    <Input id="reseller-credit-price" inputMode="decimal" value={value} placeholder="Standard: 3.00" disabled={busy} aria-invalid={!valid} onChange={e => setValue(e.target.value)} />
    <p className="text-sm text-muted-foreground">Leave blank to restore $3.00. Applies to direct PayPal purchases and manual payment requests. Existing orders keep their original prices. Parent-managed credit pricing is separate.</p>
    {!valid && <p role="alert">Enter a positive price with up to two decimal places.</p>}
    {message && <p role="status">{message}</p>}
    <Button disabled={busy || !valid || cents === current} onClick={() => void save()}>{busy ? 'Saving…' : 'Save price'}</Button>
  </div>;
}
