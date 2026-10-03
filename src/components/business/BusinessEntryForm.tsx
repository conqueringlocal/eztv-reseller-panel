import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { entryLabels, money, todayUTC, type EntryKind, type BusinessDashboard } from '@/lib/business';
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
export function BusinessEntryForm({ data }: { data: BusinessDashboard }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<EntryKind>('provider_purchase');
  const [date, setDate] = useState(todayUTC());
  const [amount, setAmount] = useState('100');
  const [credits, setCredits] = useState('60');
  const [reseller, setReseller] = useState('');
  const [saleId, setSaleId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const command = useRef<{ body: string; id: string } | null>(null);
  const needsSale = kind === 'payment_fee' || kind === 'refund';
  const hasCredits = ['sale', 'provider_purchase', 'credit_loss', 'complimentary'].includes(kind);
  const noCash = kind === 'credit_loss' || kind === 'complimentary';
  const sale = data.sales_for_review.find(s => s.id === saleId);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const args = { p_kind: kind, p_date: date, p_amount: noCash ? 0 : Number(amount), p_credits: hasCredits ? Number(credits) : 0,
      p_reseller: needsSale ? sale?.reseller_id ?? null : reseller || null, p_reference: reference.trim(), p_note: note.trim(), p_sale: needsSale ? saleId : null };
    const body = JSON.stringify(args);
    if (!command.current || command.current.body !== body) command.current = { body, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const { error } = await supabase.rpc('record_business_entry', { p_id: command.current.id, ...args });
      if (error) throw error;
      toast.success('Financial record saved. Credit balances were not changed.');
      setReference(''); setNote(''); command.current = null;
      await queryClient.invalidateQueries({ queryKey: ['business-dashboard'] });
    } catch (error) { toast.error((error as Error).message || 'Save not confirmed. Check the ledger before entering it again.'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-muted-foreground">Record completed transactions in USD. These entries do not send money, buy Trex credits, issue reseller credits, or process refunds. Approved PayPal requests are recorded automatically.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="entry-kind">Record type</Label><select id="entry-kind" className={selectClass} value={kind} disabled={busy} onChange={e => { setKind(e.target.value as EntryKind); setAmount(''); setCredits(''); setSaleId(''); }}>{Object.entries(entryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><Label htmlFor="entry-date">Transaction date (UTC)</Label><Input id="entry-date" type="date" value={date} min="2020-01-01" max={todayUTC()} required disabled={busy} onChange={e => setDate(e.target.value)} /></div>
      {needsSale ? <div className="sm:col-span-2"><Label htmlFor="entry-sale">Recorded payment</Label><select id="entry-sale" className={selectClass} value={saleId} disabled={busy} required onChange={e => setSaleId(e.target.value)}><option value="">Select payment</option>{data.sales_for_review.filter(s => kind !== 'payment_fee' || s.needs_fee).map(s => <option key={s.id} value={s.id}>{s.reference} · {money(s.amount)} · {s.occurred_on}</option>)}</select></div>
        : <div><Label htmlFor="entry-reseller">Reseller {kind === 'sale' || kind === 'complimentary' ? '' : '(optional)'}</Label><select id="entry-reseller" className={selectClass} value={reseller} disabled={busy} required={kind === 'sale' || kind === 'complimentary'} onChange={e => setReseller(e.target.value)}><option value="">Business-wide / select reseller</option>{data.resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>}
      {!noCash && <div><Label htmlFor="entry-amount">{kind === 'owner_time' ? 'Time value in USD (hours × your hourly rate)' : 'Actual amount in USD'}</Label><Input id="entry-amount" type="number" min={kind === 'payment_fee' ? 0 : 0.01} max={9999999.99} step="0.01" value={amount} required disabled={busy} onChange={e => setAmount(e.target.value)} /></div>}
      {hasCredits && <div><Label htmlFor="entry-credits">Credits</Label><Input id="entry-credits" type="number" min="1" max="1000000" step="1" value={credits} required disabled={busy} onChange={e => setCredits(e.target.value)} /></div>}
      <div><Label htmlFor="entry-reference">Unique payment / receipt / incident reference</Label><Input id="entry-reference" value={reference} minLength={3} maxLength={200} required disabled={busy} onChange={e => setReference(e.target.value)} /></div>
    </div>
    <div><Label htmlFor="entry-note">Notes (include evidence or explanation)</Label><Input id="entry-note" value={note} maxLength={1000} disabled={busy} onChange={e => setNote(e.target.value)} /></div>
    {kind === 'sale' && <p className="text-sm text-amber-900">Only enter payments verified outside the new credit-request workflow. Do not enter pending requests or credit transfers as sales.</p>}
    {kind === 'complimentary' && <p className="text-sm text-amber-900">Use this only for free credits already issued. Do not record a paid sale again as complimentary credits.</p>}
    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save financial record'}</Button>
  </form>;
}
