import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { money, providerCoverage, type BusinessDashboard } from '@/lib/business';

export function ProviderCoverage({ data }: { data: BusinessDashboard }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { await queryClient.invalidateQueries({ queryKey: ['business-dashboard'] }); }
    finally { setRefreshing(false); }
  };
  const coverage = providerCoverage(data);
  const uncertain = data.balance_needs_check || data.unresolved_operations > 0;
  return <Card className="mb-6">
    <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-3"><CardTitle>Trex credit coverage</CardTitle><Button variant="outline" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Checking…' : 'Refresh Trex balance'}</Button></CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-sm text-muted-foreground">Unused reseller credits</p><p className="text-2xl font-semibold">{data.outstanding_credits}</p></div>
        <div><p className="text-sm text-muted-foreground">Trex account balance</p><p className="text-2xl font-semibold">{data.provider_balance?.credits ?? 'Not recorded'}</p></div>
        <div><p className="text-sm text-muted-foreground">Fulfillment value of unused credits</p><p className="text-2xl font-semibold">{money(data.outstanding_credits * data.unit_cost)}</p></div>
      </div>
      {data.provider_balance && <p className="text-sm text-muted-foreground">{data.provider_balance.source === 'api' ? 'Retrieved from Trex API' : 'Last manual check'} · {new Date(data.provider_balance.checked_at).toLocaleString()}. Automatic checks run every five minutes and on dashboard refresh (at most once per minute).</p>}
      <p role="status" className={`rounded border p-3 text-sm ${uncertain || (coverage.uncovered ?? 0) > 0 ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-slate-50'}`}>
        {!data.provider_balance ? 'No successful Trex balance check yet. Refresh to try again.' : uncertain
          ? 'Refresh Trex before relying on this balance. A check failed, the balance is stale, activity occurred since the check, or an operation is unresolved.'
          : coverage.uncovered === 0 ? 'The recorded balance covers current unused reseller credits. Use Refresh after provider activity.' : 'The recorded balance is below unused reseller credits. Plan a Trex top-up.'}
        {coverage.uncovered !== null && coverage.uncovered > 0 && <> Based on the recorded balance: {coverage.uncovered} credits uncovered; {coverage.batches} × 60-credit batches, approximately {money(coverage.restockCash!)}.</>}
      </p>
      {data.balance_sync_error && <p role="alert" className="text-sm text-amber-900">The latest Trex refresh failed. Any balance above is the last successful check, not a new reading.</p>}
      <p className="text-sm text-muted-foreground">{data.held_credits} credits are reserved in unresolved paid operations and excluded from unused balances. Review these separately. The fulfillment value is an estimate, not an additional bill on top of credits already held at Trex.</p>
      <Link className="text-sm underline" to="/admin/finance">Record actual purchase costs in Finances</Link>
    </CardContent>
  </Card>;
}
