import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
type CreditRequest = Database['public']['Tables']['manual_credit_requests']['Row'];

export function ManualCreditRequests({ admin = false }: { admin?: boolean }) {
 const { user } = useAuth();
 const { resellers, refreshData } = useApp();
 const [requests,setRequests]=useState<CreditRequest[]>([]);
 const [credits,setCredits]=useState(10);
 const [reference,setReference]=useState('');
 const [busy,setBusy]=useState<string|null>(null);
 const [loadError,setLoadError]=useState('');
 const [loaded,setLoaded]=useState(false);
 const [reviewing,setReviewing]=useState<CreditRequest|null>(null);
 const [verified,setVerified]=useState('');
 const [note,setNote]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const requestId=useRef(crypto.randomUUID());
 const load=useCallback(async()=>{
  let query=supabase.from('manual_credit_requests').select('*').order('created_at',{ascending:false}).limit(100);
  if(!admin && user?.id) query=query.eq('reseller_id',user.id);
  const {data,error}=await query;
  if(error){setLoadError('Requests could not be loaded. Refresh before sending payment.');return;}
  setRequests(data||[]);setLoadError('');setLoaded(true);
  window.dispatchEvent(new CustomEvent('creditsUpdated'));
 },[admin,user?.id]);
 useEffect(()=>{ if(!user?.id)return; void load(); const timer=window.setInterval(()=>void load(),30000); const onFocus=()=>void load(); window.addEventListener('focus',onFocus);return()=>{clearInterval(timer);window.removeEventListener('focus',onFocus);}; },[load,user?.id]);
 const submit=async()=>{
  if(busy)return;setBusy('submit');
  try{
   const {error}=await supabase.rpc('request_manual_credits',{p_id:requestId.current,p_credits:credits,p_reference:reference.trim()});
   if(error)throw error;
   toast.success('Request submitted. Your credits will be added after payment is verified.');setReference('');requestId.current=crypto.randomUUID();await load();
  }catch(error){toast.error(error instanceof Error?error.message:(error as {message?:string})?.message||'Submission could not be confirmed. Refresh your requests before retrying.');}finally{setBusy(null);}
 };
 const review=async(approve:boolean)=>{
  if(!reviewing||busy)return;setBusy(reviewing.id);
  try{
   const {data,error}=await supabase.rpc('review_manual_credits',{p_id:reviewing.id,p_approve:approve,p_verified_reference:verified.trim(),p_note:note.trim()});
   if(error)throw error;
   toast.success(`Request ${data}.`);setReviewing(null);await load();await refreshData();
  }catch(error){toast.error((error as {message?:string})?.message||'Approval could not be confirmed. Refresh before retrying.');}finally{setBusy(null);}
 };
 const pending=requests.some(r=>r.status==='pending');
 return <Card className="mb-6"><CardHeader><CardTitle>{admin?'Manual credit requests':'Request credits'}</CardTitle></CardHeader><CardContent className="space-y-5">
  {loadError&&<p role="alert" className="text-destructive">{loadError}</p>}
  {!admin&&<>
   <p>Pay with PayPal to <strong>@eztvclub</strong>. Credits cost <strong>$3 USD each</strong>. Include your reseller name in the payment note, then submit the PayPal transaction reference below.</p>
   <p className="text-sm text-muted-foreground">Credits are added after the administrator verifies payment. If you already paid, submit that reference—do not send another payment.</p>
   {pending?<p role="status">Your request is awaiting review. You can check its status below.</p>:<form onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-4">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{[5,10,20,50].map(n=><Button key={n} type="button" variant={credits===n?'default':'outline'} disabled={!!busy} onClick={()=>setCredits(n)}>{n} credits · ${n*3}</Button>)}</div>
    <div><Label htmlFor="paypal-reference">PayPal transaction reference</Label><Input id="paypal-reference" value={reference} onChange={e=>setReference(e.target.value)} minLength={3} maxLength={200} required disabled={!!busy} autoComplete="off" /></div>
    <Button type="submit" disabled={!!busy||!loaded||!!loadError||reference.trim().length<3}>{busy?'Submitting…':`Submit request for ${credits} credits ($${credits*3} USD)`}</Button>
   </form>}
  </>}
  {admin&&<p className="text-sm text-muted-foreground">Verify payment in the @eztvclub PayPal account before approval. Check the amount, currency, payer and transaction reference. Each verified payment can be credited once.</p>}
  {reviewing&&<div className="rounded border p-4 space-y-3">
   <p className="font-medium">Review {reviewing.credits} credits · ${(reviewing.credits*reviewing.unit_price).toFixed(2)} {reviewing.currency}</p>
   <p className="break-all">Submitted reference: {reviewing.payment_reference}</p>
   <div><Label htmlFor="verified-reference">Transaction reference verified in PayPal</Label><Input id="verified-reference" value={verified} onChange={e=>setVerified(e.target.value)} maxLength={200}/></div>
   <div><Label htmlFor="review-note">Review note (shown to reseller)</Label><Input id="review-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={500}/></div>
   <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I verified receipt of the correct USD amount in PayPal.</span></label>
   <div className="flex flex-wrap gap-2"><Button disabled={!!busy||!confirmed||verified.trim().length<3} onClick={()=>void review(true)}>Approve and add credits</Button><Button variant="destructive" disabled={!!busy||!note.trim()} onClick={()=>void review(false)}>Deny request</Button><Button variant="outline" disabled={!!busy} onClick={()=>setReviewing(null)}>Cancel</Button></div>
  </div>}
  <div className="space-y-3">{!loaded&&!loadError&&<p>Loading requests…</p>}{loaded&&requests.length===0&&<p className="text-muted-foreground">No credit requests yet.</p>}{requests.map(r=><div key={r.id} className="rounded border p-3 space-y-1">
   {admin&&<p className="font-medium">{resellers.find(p=>p.id===r.reseller_id)?.name||r.reseller_id}</p>}
   <p>{r.credits} credits · ${(r.credits*r.unit_price).toFixed(2)} {r.currency} · <strong className="capitalize">{r.status==='pending'?'Awaiting review':r.status}</strong></p>
   <p className="text-sm break-all">PayPal reference: {r.payment_reference}</p>
   <p className="text-xs text-muted-foreground break-all">Request {r.id} · {new Date(r.created_at).toLocaleString()}</p>
   {r.review_note&&<p className="text-sm">{r.review_note}</p>}
   {admin&&r.status==='pending'&&<Button variant="outline" disabled={!!busy} onClick={()=>{setReviewing(r);setVerified('');setNote('');setConfirmed(false);}}>Review payment</Button>}
  </div>)}</div>
 </CardContent></Card>;
}
