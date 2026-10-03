import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RenewCustomerForm } from '@/components/customers/RenewCustomerForm';
import { reminderText, type RenewalItem } from '@/lib/business';
import { toast } from 'sonner';

type Window = '7' | '30' | 'expired' | 'review';
export function RenewalWorklist() {
  const { user } = useAuth();
  const { customers } = useApp();
  const [window, setWindow] = useState<Window>('7');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(8);
  const [selected, setSelected] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState('');
  const admin = user?.role === 'admin';
  const query = useQuery({ queryKey: ['renewal-worklist', user?.id], enabled: !!user?.id,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_renewal_worklist'); if (error) throw error; return data as unknown as RenewalItem[]; },
    refetchInterval: 60_000,
  });
  const all = query.data || [];
  const rows = all.filter(row => {
    const matches = `${row.customer_name} ${admin ? row.reseller_name : ''}`.toLowerCase().includes(search.toLowerCase());
    if (!matches) return false;
    if (window === 'review') return !!row.review_reason;
    if (row.review_reason) return false;
    return window === 'expired' ? row.days_until < 0 && row.days_until >= -30 : row.days_until >= 0 && row.days_until <= Number(window);
  }).sort((a, b) => a.days_until - b.days_until || a.customer_name.localeCompare(b.customer_name));
  const needed = rows.reduce((sum, r) => sum + (r.connections || 0), 0);
  const customer = customers.find(c => c.id === selected && c.resellerId === user?.id);
  const copy = async (row: RenewalItem) => {
    const message = reminderText(row);
    try { await navigator.clipboard.writeText(message); toast.success('Reminder copied. Review it before sending.'); }
    catch { setCopyFallback(message); }
  };
  return <Card className="mb-6"><CardHeader><CardTitle>Renewal worklist</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Plan follow-ups from recorded connection expiry dates (UTC). Quotes below cover a one-month renewal of every connection in the customer group. Confirm the current status and final quote before purchase.</p>
    <div className="flex flex-wrap gap-2">{([['7', 'Next 7 days'], ['30', 'Next 30 days'], ['expired', 'Expired in last 30 days'], ['review', `Needs review (${all.filter(r => r.review_reason).length})`]] as const).map(([value, label]) => <Button key={value} size="sm" variant={window === value ? 'default' : 'outline'} onClick={() => { setWindow(value); setLimit(8); }}>{label}</Button>)}</div>
    <div className="flex flex-wrap gap-3 items-end"><div className="flex-1 min-w-0"><Label htmlFor="renewal-search">Find a customer{admin ? ' or reseller' : ''}</Label><Input id="renewal-search" value={search} onChange={e => { setSearch(e.target.value); setLimit(8); }} placeholder="Search by name" /></div><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh</Button></div>
    {query.isPending && <p role="status">Loading renewal worklist…</p>}
    {query.isError && <p role="alert" className="text-destructive">Could not refresh renewals. Refresh before relying on these estimates.</p>}
    {query.data && <>
      <p className="text-sm">{rows.length} customer group{rows.length === 1 ? '' : 's'}{window !== 'review' ? ` · ${needed} credits for one month across the listed groups` : ' · quotes withheld until reviewed'}{!admin && window !== 'review' && needed > (user?.credits || 0) ? ` · ${needed - (user?.credits || 0)} more credits needed` : ''}</p>
      {!rows.length && <p className="text-muted-foreground">No customer groups in this view.</p>}
      {rows.slice(0, limit).map(row => <div key={row.customer_id} className="rounded border p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{row.customer_name}{admin ? ` · ${row.reseller_name}` : ''}</p><span className="text-sm">{row.first_expiry}{row.last_expiry !== row.first_expiry ? ` – ${row.last_expiry}` : ''}</span></div>
        <p className="text-sm">{row.days_until < 0 ? `Recorded expiry ${-row.days_until} days ago` : row.days_until === 0 ? 'Recorded expiry today' : `First expiry in ${row.days_until} days`}{row.connections !== null ? ` · ${row.connections} connections · ${row.connections} credits / month` : ''}</p>
        {row.first_expiry !== row.last_expiry && <p className="text-sm text-muted-foreground">Connections have different expiry dates. Review individual connections before renewing the whole group.</p>}
        {row.review_reason ? <p className="text-sm text-amber-900">{row.review_reason}. Support reference: <span className="break-all">{row.customer_id}</span></p> : <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void copy(row)}>Copy renewal reminder</Button>
          {!admin && <Button size="sm" disabled={query.isError || !customers.some(c => c.id === row.customer_id && c.resellerId === user?.id)} onClick={() => setSelected(row.customer_id)}>Review renewal</Button>}
        </div>}
      </div>)}
      {rows.length > limit && <Button variant="outline" onClick={() => setLimit(n => n + 8)}>Show more</Button>}
    </>}
    {copyFallback && <div><Label htmlFor="reminder-copy">Copy this reminder manually</Label><textarea id="reminder-copy" readOnly className="w-full rounded border p-3 text-sm" rows={4} value={copyFallback} onFocus={e => e.target.select()} /></div>}
    <Link className="inline-block text-sm underline" to={admin ? '/admin/credits' : '/reseller/credits'}>{admin ? 'Open operation and payment review' : 'View payment requests or request credits'}</Link>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Review renewal</DialogTitle><DialogDescription>Confirm the connection count, duration and credit charge before renewing.</DialogDescription></DialogHeader>{customer && <RenewCustomerForm customer={customer} onSuccess={() => { setSelected(null); void query.refetch(); }} />}</DialogContent></Dialog>
  </CardContent></Card>;
}
