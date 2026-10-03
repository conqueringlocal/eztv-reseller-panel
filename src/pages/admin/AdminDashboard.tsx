import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProviderCoverage } from '@/components/business/ProviderCoverage';
import { RenewalWorklist } from '@/components/business/RenewalWorklist';
import { useBusinessDashboard } from '@/hooks/useBusinessDashboard';
import { useApp } from '@/contexts/AppContext';
import { businessTotals, money, todayUTC } from '@/lib/business';
import { DollarSign, Users, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminDashboard() {
  const { customers, resellers } = useApp();
  const query = useBusinessDashboard(todayUTC().slice(0, 7));
  const data = query.data;
  const totals = data ? businessTotals(data) : null;
  return <DashboardLayout>
    <div className="mb-6 flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-bold">Admin Dashboard</h1><p className="text-muted-foreground">Credit coverage, recorded sales and renewals that need attention</p></div><Button asChild><Link to="/admin/finance">Open Finances</Link></Button></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <StatCard title="Customer records" value={customers.length} description="Includes expired records; not a paying-customer count" icon={<Users className="h-5 w-5" />} />
      <StatCard title="Resellers" value={resellers.length} icon={<Users className="h-5 w-5" />} />
      <StatCard title="Recorded sales this month" value={data ? money(data.summary.sales) : '—'} description="Verified purchases and entered historical payments" icon={<DollarSign className="h-5 w-5" />} />
      <StatCard title="Estimated contribution" value={totals ? money(totals.contribution) : '—'} description="Before overhead; missing fees and costs can overstate this" icon={<CreditCard className="h-5 w-5" />} />
    </div>
    {query.isPending && <p role="status" className="mb-6">Loading financial overview…</p>}
    {query.isError && <p role="alert" className="mb-6 text-destructive">Financial overview could not be refreshed. <button className="underline" onClick={() => void query.refetch()}>Try again</button></p>}
    {data && <><ProviderCoverage data={data} /><Card className="mb-6"><CardHeader><CardTitle>Owner follow-up</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-4 text-sm"><Link className="underline" to="/admin/credits">{data.pending_payments} pending payments · {data.unresolved_operations} unresolved guarded operations</Link><Link className="underline" to="/admin/finance">{data.summary.missing_fees} payment{data.summary.missing_fees === 1 ? '' : 's'} this month {data.summary.missing_fees === 1 ? 'needs' : 'need'} fees recorded</Link><p className="text-muted-foreground">Historical review items are also listed in Credit Management.</p></CardContent></Card></>}
    <RenewalWorklist />
  </DashboardLayout>;
}
