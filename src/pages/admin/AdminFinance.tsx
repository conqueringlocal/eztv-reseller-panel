import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BusinessEntryForm } from '@/components/business/BusinessEntryForm';
import { ProviderBalanceForm } from '@/components/business/ProviderBalanceForm';
import { ProviderCoverage } from '@/components/business/ProviderCoverage';
import { useBusinessDashboard } from '@/hooks/useBusinessDashboard';
import { businessTotals, entryLabels, money, todayUTC, type BusinessEntry } from '@/lib/business';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function AdminFinance() {
  const [month, setMonth] = useState(todayUTC().slice(0, 7));
  const query = useBusinessDashboard(month);
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState<BusinessEntry | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const data = query.data;
  const totals = data ? businessTotals(data) : null;
  const voidEntry = async () => {
    if (!voiding || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('void_business_entry', { p_id: voiding.id, p_reason: reason.trim() });
      if (error) throw error;
      setVoiding(null); setReason(''); toast.success('Record voided with an audit note.');
      await queryClient.invalidateQueries({ queryKey: ['business-dashboard'] });
    } catch (error) { toast.error((error as Error).message || 'Correction not confirmed. Refresh the ledger.'); }
    finally { setBusy(false); }
  };
  return <DashboardLayout>
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><h1 className="text-2xl font-bold">Finances</h1><p className="text-muted-foreground">Recorded cash flow and estimated credit margin · USD</p></div>
      <div className="flex items-end gap-2"><div><Label htmlFor="finance-month">Reporting month (UTC)</Label><Input id="finance-month" type="month" value={month} min="2020-01" max={todayUTC().slice(0, 7)} onChange={e => setMonth(e.target.value)} /></div><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button></div>
    </div>
    {query.isPending && <p role="status">Loading financial records…</p>}
    {query.isError && <p role="alert" className="text-destructive mb-4">Financial records could not be loaded. Refresh to try again.</p>}
    {data && totals && <>
      <div className="rounded border bg-amber-50 p-4 mb-6 text-sm space-y-2">
        <p>These are recorded totals, not a complete profit statement. Historical credit adjustments are not assumed to be sales. Enter actual expenses, refunds and fees before using the operating estimate.</p>
        <p>{data.summary.missing_fees} payment{data.summary.missing_fees === 1 ? '' : 's'} in this month still {data.summary.missing_fees === 1 ? 'needs' : 'need'} an actual fee recorded (enter $0 only when confirmed). {data.legacy_unpriced_additions} credit additions have no cash amount in the legacy log.</p>
        <p>Planning cost: {money(data.unit_cost)} per credit. Defaults to $100 / 60 credits in USD until a Trex purchase is recorded. Each sale keeps its cost estimate from when it was recorded.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        {[
          ['Recorded sales', money(data.summary.sales), `${data.summary.credits_sold} credits sold`],
          ['Net recorded cash flow', money(totals.netCash), 'Sales less fees, refunds, cash expenses and Trex purchases'],
          ['Estimated contribution', money(totals.contribution), 'Sales less fulfillment estimate, fees, refunds and recorded credit losses / gifts'],
          ['Operating estimate', money(totals.operatingEstimate), 'Contribution less recorded expenses and owner time; before tax'],
        ].map(([label, value, detail]) => <Card key={label}><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground mt-2">{detail}</p></CardContent></Card>)}
      </div>
      <ProviderCoverage data={data} />
      <div className="flex flex-wrap gap-4 mb-6 text-sm"><Link className="underline" to="/admin/credits">{data.pending_payments} pending credit requests · review operations</Link><span>{data.completed_credits_used} credits used by completed guarded operations this month (legacy usage excluded)</span></div>
      <div className="grid gap-6 xl:grid-cols-2 mb-6">
        <Card><CardHeader><CardTitle>Record a transaction or cost</CardTitle></CardHeader><CardContent><BusinessEntryForm data={data} /></CardContent></Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Update the Trex balance check</CardTitle></CardHeader><CardContent><ProviderBalanceForm /></CardContent></Card>
          <Card><CardHeader><CardTitle>Recorded costs this month</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            <p>Payment fees: {money(data.summary.fees)} · Refunds: {money(data.summary.refunds)}</p>
            <p>Cash expenses: {money(data.summary.expenses)} · Owner time value: {money(data.summary.owner_time)}</p>
            <p>Trex purchases: {money(data.summary.provider_purchases)} for {data.summary.provider_credits} credits</p>
            <p>Confirmed lost credits: {data.summary.lost_credits} · Complimentary credits: {data.summary.complimentary_credits}</p>
            <p className="text-muted-foreground">Trex purchases reduce cash flow. Margin uses the estimated cost of credits sold, avoiding a second deduction for the purchase. Refunds conservatively retain fulfillment cost until provider recovery is established.</p>
          </CardContent></Card>
        </div>
      </div>
      <Card className="mb-6"><CardHeader><CardTitle>Recorded contribution by reseller</CardTitle></CardHeader><CardContent>
        <p className="text-sm text-muted-foreground mb-3">Before business-wide expenses and owner time. Missing fees and unrecorded transactions can overstate contribution.</p>
        {data.by_reseller.length === 0 ? <p>No reseller transactions recorded for this month.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Reseller</th><th className="p-2">Credits sold</th><th className="p-2">Sales</th><th className="p-2">Est. contribution</th></tr></thead><tbody>{data.by_reseller.map(row => <tr key={row.reseller_id} className="border-b"><td className="p-2">{data.resellers.find(r => r.id === row.reseller_id)?.name || 'Former reseller'}</td><td className="p-2">{row.credits_sold}</td><td className="p-2">{money(row.sales || 0)}</td><td className="p-2">{money(row.contribution)}</td></tr>)}</tbody></table></div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Financial ledger</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Records stay in the audit history. Void an incorrect manual record with a reason, then enter its replacement. This does not reverse a payment or change credits.</p>
        {voiding && <form className="rounded border p-4 space-y-3" onSubmit={e => { e.preventDefault(); void voidEntry(); }}><p>Void {voiding.reference} ({money(voiding.amount)})?</p><Label htmlFor="void-reason">Correction reason</Label><Input id="void-reason" minLength={3} maxLength={500} required value={reason} onChange={e => setReason(e.target.value)} /><div className="flex gap-2"><Button type="submit" variant="destructive" disabled={busy}>Confirm void</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setVoiding(null)}>Cancel</Button></div></form>}
        {data.entries.length === 0 && <p>No financial records for this month. Missing records do not mean there were no sales or costs.</p>}
        {data.entries.map(entry => <div key={entry.id} className={`rounded border p-3 ${entry.voided_at ? 'opacity-60' : ''}`}>
          <div className="flex flex-wrap gap-2 justify-between"><p className="font-medium">{entryLabels[entry.kind]} · {money(entry.amount)}{entry.credits > 0 ? ` · ${entry.credits} credits` : ''}</p><span className="text-sm">{entry.occurred_on}</span></div>
          <p className="text-sm break-all">{entry.reference}{entry.source_request_id ? ' · Verified credit request' : ''}</p>
          {entry.note && <p className="text-sm break-words text-muted-foreground">{entry.note}</p>}
          {entry.voided_at ? <p className="text-sm">Voided: {entry.void_reason}</p> : !entry.source_request_id && <Button size="sm" variant="ghost" onClick={() => { setVoiding(entry); setReason(''); }}>Correct this record</Button>}
        </div>)}
      </CardContent></Card>
    </>}
  </DashboardLayout>;
}
