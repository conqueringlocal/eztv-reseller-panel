import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { money, providerCoverage, type BusinessDashboard } from '@/lib/business';

export function ProviderCoverage({ data }: { data: BusinessDashboard }) {
  const coverage = providerCoverage(data);
  const uncertain = data.balance_needs_check || data.unresolved_operations > 0;
  return <Card className="mb-6">
    <CardHeader><CardTitle>Trex credit coverage</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-sm text-muted-foreground">Unused reseller credits</p><p className="text-2xl font-semibold">{data.outstanding_credits}</p></div>
        <div><p className="text-sm text-muted-foreground">Last recorded Trex balance</p><p className="text-2xl font-semibold">{data.provider_balance?.credits ?? 'Not recorded'}</p></div>
        <div><p className="text-sm text-muted-foreground">Fulfillment value of unused credits</p><p className="text-2xl font-semibold">{money(data.outstanding_credits * data.unit_cost)}</p></div>
      </div>
      {data.provider_balance && <p className="text-sm text-muted-foreground">Manually checked {new Date(data.provider_balance.checked_at).toLocaleString()}. Provider usage outside this dashboard is not tracked automatically.</p>}
      <p role="status" className={`rounded border p-3 text-sm ${uncertain || (coverage.uncovered ?? 0) > 0 ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-slate-50'}`}>
        {!data.provider_balance ? 'Record the balance shown in Trex to calculate your coverage.' : uncertain
          ? 'Check Trex again before relying on this balance. It is older than 24 hours, activity has occurred since the check, or an operation is unresolved.'
          : coverage.uncovered === 0 ? 'The recorded balance covers current unused reseller credits. Recheck after provider activity.' : 'The recorded balance is below unused reseller credits. Plan a Trex top-up.'}
        {coverage.uncovered !== null && coverage.uncovered > 0 && <> Based on the recorded balance: {coverage.uncovered} credits uncovered; {coverage.batches} × 60-credit batches, approximately {money(coverage.restockCash!)}.</>}
      </p>
      <p className="text-sm text-muted-foreground">{data.held_credits} credits are reserved in unresolved paid operations and excluded from unused balances. Review these separately. The fulfillment value is an estimate, not an additional bill on top of credits already held at Trex.</p>
      <Link className="text-sm underline" to="/admin/finance">Record a balance or cost in Finances</Link>
    </CardContent>
  </Card>;
}
