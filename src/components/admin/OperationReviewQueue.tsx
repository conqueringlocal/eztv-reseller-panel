import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
type Item={id:string;reseller_id:string;customer_id?:string;kind:string;state:string;created_at:string;reserved_credits?:number;confirmed_lines?:number;unverified_lines?:number};
export function OperationReviewQueue(){
 const {resellers,customers}=useApp();const [items,setItems]=useState<Item[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{setLoading(true);const {data,error}=await supabase.rpc('get_operation_review_queue');if(error)setError('Could not load the review queue.');else{setItems((data||[]) as Item[]);setError('');}setLoading(false);},[]);
 useEffect(()=>{void load();},[load]);
 return <Card className="mb-6"><CardHeader><CardTitle>Provider operations needing review</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Check Trex and the credit history before resolving these operations. A stored receipt confirms a provider response; it does not authorize another purchase. Reserved credits remain held until the outcome is reconciled.</p><Button variant="outline" disabled={loading} onClick={()=>void load()}>{loading?'Loading…':'Refresh review queue'}</Button>{error&&<p role="alert">{error}</p>}{!loading&&!error&&items.length===0&&<p>No operations awaiting review.</p>}{items.map(item=><div className="border rounded p-3 space-y-1" key={item.id}><p className="font-medium">{item.kind} · {item.state.replace(/_/g,' ')}</p><p>{resellers.find(r=>r.id===item.reseller_id)?.name||'Reseller'} · {customers.find(c=>c.id===item.customer_id)?.name||'See request record'}</p><p className="text-xs break-all">Reference: {item.id} · {new Date(item.created_at).toLocaleString()}</p>{item.unverified_lines!=null&&<p className="text-sm">Connections to review: {item.unverified_lines}</p>}{item.reserved_credits!=null&&<p className="text-sm">Credits reserved: {item.reserved_credits} · Confirmed lines: {item.confirmed_lines||0}</p>}</div>)}</CardContent></Card>;
}
