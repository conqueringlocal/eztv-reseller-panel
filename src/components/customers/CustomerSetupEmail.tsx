import { useRef, useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Delivery = {id:string;status:string;source:string;recipient:string;created_at:string;error_code:string|null};
type Preview = {recipient:string;replyTo:string;subject:string;text:string;version:string;enabled:boolean;history:Delivery[]};
const statusLabel:Record<string,string>={queued:'Queued',sending:'Sending',sent:'Accepted by Mailbux',failed:'Not sent — review required',uncertain:'Delivery uncertain — check before resending',cancelled:'Not sent'};
const reason:Record<string,string>={recipient_changed:'The customer’s email address changed.',details_changed:'The setup details changed. Reload the preview.',setup_details_unavailable:'Check the customer’s current connections and email address.',smtp_outcome_unconfirmed:'Check the mailbox or ask the customer before resending.',worker_interrupted:'The send was interrupted. Check before resending.',request_expired:'This email request expired after 24 hours.',existing_delivery:'Another delivery request already covers this account.'};
export function CustomerSetupEmail({customerId}:{customerId:string}) {
 const [preview,setPreview]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const lock=useRef(false);
 const request=useRef<string|null>(null);
 async function call(body:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke('customer-setup-email',{body:{...body,customerId}});
  if(error){
   let detail='Email request could not be confirmed. Refresh the delivery history before sending again.';
   try{const result=await error.context?.clone().json();if(typeof result?.error==='string')detail=result.error;}catch{/* Keep safe fallback. */}
   throw new Error(detail);
  }
  if(data?.error)throw new Error(data.error);
  return data;
 }
 async function load(){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{setPreview(await call({action:'preview'}));}
  catch(e){setMessage(e instanceof Error?e.message:'Preview unavailable');}
  finally{lock.current=false;setBusy(false);}
 }
 async function send(){
  if(!preview||lock.current)return;lock.current=true;setBusy(true);setMessage('');
  request.current??=crypto.randomUUID();
  try{
   const result=await call({action:'send',version:preview.version,requestId:request.current});
   request.current=null;
   setMessage(result.replayed?'An email request already exists. Check its status below.':'Email queued. Delivery usually starts within a minute; larger batches may take longer.');
   setPreview(await call({action:'preview'}));
  }catch(e){setMessage(e instanceof Error?e.message:'Email request unconfirmed');}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="space-y-3 rounded-lg border p-4" aria-label="Customer setup email">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h3 className="font-medium">Email setup details</h3><p className="text-sm text-muted-foreground">From EZTV · noreply@eztvclub.com</p></div>
   <Button type="button" variant="outline" onClick={load} disabled={busy}>
    {busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Mail className="mr-2 h-4 w-4"/>}
    {preview?'Refresh preview and status':'Review and send email'}
   </Button>
  </div>
  {preview&&<>
   <p className="break-all text-sm"><strong>To:</strong> {preview.recipient}<br/><strong>Replies go to:</strong> {preview.replyTo}</p>
   <label className="block text-sm font-medium" htmlFor={`setup-email-${customerId}`}>Message preview — includes passwords</label>
   <textarea id={`setup-email-${customerId}`} readOnly value={preview.text} rows={9} className="w-full rounded-md border bg-muted/30 p-3 text-sm"/>
   {!preview.enabled&&<p className="text-sm text-amber-700">Email sending is temporarily unavailable. You can still copy the credentials.</p>}
   {preview.history.some(h=>h.status==='uncertain')&&<p className="text-sm text-amber-700">A previous delivery is uncertain. Check with the customer before sending another email.</p>}
   <Button type="button" onClick={send} disabled={busy||!preview.enabled||preview.history.some(h=>['queued','sending'].includes(h.status))}>Send setup email</Button>
   <p className="text-xs text-muted-foreground">This sends the current active connections to the saved customer email. It does not create or renew accounts. Mailbux acceptance does not guarantee inbox delivery.</p>
   {!!preview.history.length&&<ul className="space-y-2 text-sm" aria-label="Email delivery history">{preview.history.map(h=><li key={h.id} className="rounded border p-2"><strong>{statusLabel[h.status]||h.status}</strong><span className="block break-all text-muted-foreground">{h.recipient} · {new Date(h.created_at).toLocaleString()} · {h.source==='automatic'?'Automatic':'Manual'}</span>{h.error_code&&<span>{reason[h.error_code]||'Check the setup details before requesting another email.'}</span>}</li>)}</ul>}
  </>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
