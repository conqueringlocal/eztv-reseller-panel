import {useEffect, useRef, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {DashboardLayout} from '@/components/layout/DashboardLayout';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Alert, AlertDescription} from '@/components/ui/alert';
import {toast} from 'sonner';
import {Download, RefreshCw, ArrowLeft, MessageSquare} from 'lucide-react';

const categories={technical:'Technical support',channel_issue:'Channel issue',channel_request:'Channel request',vod_request:'VOD request'};
type Category=keyof typeof categories;
type Config={enabled:boolean;support_name:string;admin:boolean;has_parent:boolean};
type Ticket={id:string;number:string;title:string;category:Category;status:'open'|'closed';updated_at:string;mine:boolean;can_handle:boolean;requester:string;can_escalate:boolean;escalated:boolean;escalation_id?:string;source_id?:string};
type Message={id:number;body:string;author:string;internal:boolean;created_at:string;attachments:{id:number;name:string;size:number}[]};
type Detail=Ticket&{messages:Message[]};
type FileData={name:string;type:string;data:string};
class HelpdeskError extends Error { constructor(message:string,public definite=false){super(message);} }
async function api<T>(action:string,input:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await supabase.functions.invoke('reseller-helpdesk',{body:{action,input}});
 if(error){let message='Support could not confirm the request. Retry with the same reference.';try{const body=await error.context?.json();if(body?.error)message=body.error;}catch{/* Keep safe fallback. */}throw new HelpdeskError(message,[400,401,403,413,429].includes(error.context?.status));}
 if(data?.error)throw new Error(data.error);return data as T;
}
export default function Helpdesk(){
 const {user}=useAuth();const query=useQueryClient();const [params,setParams]=useSearchParams();const selected=params.get('ticket');
 const [scope,setScope]=useState(user?.role==='admin'?'queue':'mine');const [offset,setOffset]=useState(0);const [creating,setCreating]=useState(false);
 const [title,setTitle]=useState('');const [category,setCategory]=useState<Category>('technical');const [body,setBody]=useState('');
 const [internal,setInternal]=useState(false);const [escalating,setEscalating]=useState(false);const [files,setFiles]=useState<FileData[]>([]);const [reading,setReading]=useState(false);
 const pending=useRef<{action:string;input:Record<string,unknown>}|null>(null);const [uncertain,setUncertain]=useState(false);
 const key=['helpdesk',user?.id];
 const config=useQuery({queryKey:[...key,'config'],queryFn:()=>api<Config>('config'),enabled:!!user});
 const list=useQuery({queryKey:[...key,'list',scope,offset],queryFn:()=>api<{tickets:Ticket[];more:boolean}>('list',{scope,offset}),enabled:config.data?.enabled===true&&!selected});
 const detail=useQuery({queryKey:[...key,'ticket',selected],queryFn:()=>api<Detail>('detail',{id:selected}),enabled:config.data?.enabled===true&&!!selected});
 useEffect(()=>{setBody('');setInternal(false);setEscalating(false);setFiles([]);pending.current=null;setUncertain(false);},[selected,user?.id]);
 const write=useMutation({mutationFn:({action,input}:{action:string;input:Record<string,unknown>})=>api<Detail>(action,input),onSuccess:(ticket)=>{
  pending.current=null;setUncertain(false);setCreating(false);setBody('');setTitle('');setFiles([]);setEscalating(false);setInternal(false);
  query.setQueryData([...key,'ticket',ticket.id],ticket);void query.invalidateQueries({queryKey:key});setParams({ticket:ticket.id});toast.success('Support ticket updated');
 },onError:(error:Error)=>{const definite=error instanceof HelpdeskError&&error.definite;if(definite)pending.current=null;setUncertain(!definite);toast.error(error.message);}});
 function submit(action:string){
  if(write.isPending||reading)return;
  if(pending.current){write.mutate(pending.current);return;}
  const input={id:selected,request_id:crypto.randomUUID(),title,category,body,internal,attachments:files};
  pending.current={action,input};write.mutate(pending.current);
 }
 async function pickFiles(chosen:FileList|null){
  if(!chosen)return;setReading(true);
  try{
   if(chosen.length>3)throw new Error('Choose up to three files.');
   const allowed=['image/jpeg','image/png','image/webp','application/pdf','text/plain'];
   const next=await Promise.all(Array.from(chosen).map(async file=>{
    if(file.size>1024*1024||!allowed.includes(file.type))throw new Error('Use JPG, PNG, WebP, PDF or text files up to 1 MB each.');
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    return {name:file.name,type:file.type,data:btoa(binary)};
   }));setFiles(next);
  }catch(error){toast.error((error as Error).message);}finally{setReading(false);}
 }
 async function download(message:Message,file:Message['attachments'][number]){
  try{const result=await api<{name:string;data:string;type:string}>('attachment',{id:selected,article_id:message.id,attachment_id:file.id});
   const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
   const anchor=document.createElement('a');anchor.href=url;anchor.download=result.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){toast.error((error as Error).message);}
 }
 const busy=write.isPending||reading;const ticket=detail.data;
 const error=config.error||list.error||detail.error;
 const composer=(mode:'create'|'reply')=><form className="space-y-4" onSubmit={event=>{event.preventDefault();submit(mode==='create'?'create':escalating?'escalate':'reply');}}>
  {mode==='create'&&<><div><Label htmlFor="ticket-title">Subject</Label><Input id="ticket-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} required disabled={busy||uncertain}/></div>
   <div><Label htmlFor="ticket-category">Request type</Label><select id="ticket-category" className="w-full rounded-md border p-2 bg-white" value={category} onChange={e=>setCategory(e.target.value as Category)} disabled={busy||uncertain}>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div></>}
  <div><Label htmlFor="ticket-body">{escalating?'Summary for your support provider':internal?'Private note':mode==='create'?'Details':'Reply'}</Label>
   <Textarea id="ticket-body" rows={5} value={body} onChange={e=>setBody(e.target.value)} maxLength={10000} required disabled={busy||uncertain}/></div>
  <p className="text-sm text-gray-600">Include the affected channel or title, device, error, and time where relevant. Keep passwords, playlist links, and payment details out of tickets.</p>
  {escalating&&<Alert><AlertDescription>Only this summary and the files you select go upstream. You remain responsible for updating your reseller.</AlertDescription></Alert>}
  {mode==='reply'&&ticket?.can_handle&&!escalating&&<label className="flex gap-2 items-center"><input type="checkbox" checked={internal} onChange={e=>setInternal(e.target.checked)} disabled={busy||uncertain}/>Private note — hidden from the requester</label>}
  <div><Label htmlFor="ticket-files">Attachments (up to 3, 1 MB each)</Label><Input key={selected+'-'+mode+'-'+files.length} id="ticket-files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" onChange={e=>void pickFiles(e.target.files)} disabled={busy||uncertain}/>{files.map(file=><p key={file.name} className="text-sm break-all">{file.name}</p>)}</div>
  <Button type="submit" disabled={busy||!body.trim()||(mode==='create'&&!title.trim())}>{busy?'Saving…':uncertain?'Retry same request':escalating?'Send escalation':mode==='create'?'Open ticket':internal?'Save private note':'Send reply'}</Button>
 </form>;
 return <DashboardLayout><div className="max-w-5xl mx-auto space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Support</h1><p className="text-gray-600">{user?.role==='admin'?'Direct reseller support and escalations.':`Your support provider: ${config.data?.support_name||'Loading…'}`}</p></div>
   <Button variant="outline" onClick={()=>void query.invalidateQueries({queryKey:key})}><RefreshCw className="w-4 h-4 mr-2"/>Refresh</Button></div>
  {error&&<Alert variant="destructive"><AlertDescription>{(error as Error).message}</AlertDescription></Alert>}
  {config.isLoading&&<p role="status">Loading support…</p>}
  {config.data&&!config.data.enabled&&<Card><CardHeader><CardTitle>Support is being prepared</CardTitle></CardHeader><CardContent>Continue using your existing support contact while we finish setup.</CardContent></Card>}
  {config.data?.enabled&&<>
   <p className="text-sm text-gray-600">{config.data.admin?'Your main queue contains direct reseller tickets and upstream escalations.':'Your own requests go to your support provider. Tickets from your immediate sub-resellers are your responsibility.'} Check this page for replies; email notifications are not enabled yet.</p>
   {uncertain&&<Alert><AlertDescription>This request could not be confirmed. Refresh to check its status, or retry the same request using the button below. Your reference is {String(pending.current?.input.request_id)}.</AlertDescription><Button className="mt-2" disabled={busy} onClick={()=>pending.current&&write.mutate(pending.current)}>Retry same request</Button></Alert>}
   {!selected&&!creating&&<><div className="flex flex-wrap gap-2" role="group" aria-label="Ticket lists">
    {(config.data.admin?[['queue','My support queue'],['oversight','All tickets']]:[['mine','My support tickets'],['queue','Tickets from my resellers']]).map(([value,label])=><Button key={value} variant={scope===value?'default':'outline'} onClick={()=>{setScope(value);setOffset(0);}}>{label}</Button>)}
    {!config.data.admin&&<Button onClick={()=>setCreating(true)}><MessageSquare className="mr-2 w-4 h-4"/>Open ticket</Button>}</div>
    {list.isLoading?<p role="status">Loading tickets…</p>:list.data?.tickets.length===0?<p className="p-8 text-center border rounded-lg bg-white">No tickets in this view.</p>:<div className="space-y-3">{list.data?.tickets.map(t=><button key={t.id} className="block text-left bg-white border rounded-lg p-4 w-full hover:border-brand-primary" onClick={()=>setParams({ticket:t.id})}><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold break-words">#{t.number} · {t.title}</span><span className="text-sm capitalize">{t.status}</span></div><p className="text-sm text-gray-600">{categories[t.category]} · {t.requester} · {new Date(t.updated_at).toLocaleString()}{t.escalated?' · Escalated':''}</p></button>)}</div>}
    <div className="flex gap-2">{offset>0&&<Button variant="outline" onClick={()=>setOffset(v=>Math.max(0,v-50))}>Previous</Button>}{list.data?.more&&<Button variant="outline" onClick={()=>setOffset(v=>v+50)}>Next</Button>}</div></>}
   {(selected||creating)&&<Button variant="outline" disabled={busy||uncertain} onClick={()=>{setParams({});setCreating(false);setBody('');setFiles([]);}}><ArrowLeft className="w-4 h-4 mr-2"/>Back to tickets</Button>}
   {creating&&!selected&&<Card><CardHeader><CardTitle>Open a support ticket</CardTitle></CardHeader><CardContent>{composer('create')}</CardContent></Card>}
   {selected&&detail.isLoading&&<p role="status">Loading conversation…</p>}
   {selected&&ticket&&<>
    <Card><CardHeader><CardTitle className="break-words">#{ticket.number} · {ticket.title}</CardTitle><p>{categories[ticket.category]} · {ticket.status}</p></CardHeader><CardContent className="flex flex-wrap gap-2">
     <Button variant="outline" disabled={busy||uncertain} onClick={()=>submit(ticket.status==='closed'?'reopen':'close')}>{ticket.status==='closed'?'Reopen ticket':'Close ticket'}</Button>
     {ticket.can_escalate&&<Button variant="outline" disabled={busy||uncertain} onClick={()=>{setEscalating(v=>!v);setInternal(false);setBody('');setFiles([]);}}>{escalating?'Cancel escalation':`Escalate to ${config.data.has_parent?'my support':'EZTV'}`}</Button>}
     {ticket.escalation_id&&<Button variant="outline" onClick={()=>setParams({ticket:ticket.escalation_id!})}>View upstream conversation</Button>}
     {ticket.source_id&&<Button variant="outline" onClick={()=>setParams({ticket:ticket.source_id!})}>View original ticket</Button>}
     {ticket.escalated&&!ticket.escalation_id&&<p className="text-sm">Your support provider has escalated this issue.</p>}
    </CardContent></Card>
    <div className="space-y-3">{ticket.messages.map(message=><Card key={message.id} className={message.internal?'border-amber-300 bg-amber-50':''}><CardContent className="pt-4"><p className="font-medium">{message.author}{message.internal?' · Private note':''}</p><p className="text-xs text-gray-500 mb-3">{new Date(message.created_at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{message.body}</p>{message.attachments.map(file=><Button key={file.id} variant="link" className="h-auto whitespace-normal break-all text-left px-0 mr-3" onClick={()=>void download(message,file)}><Download className="w-4 h-4 mr-1 shrink-0"/>{file.name}</Button>)}</CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>{escalating?'Escalate this issue':'Add to the conversation'}</CardTitle></CardHeader><CardContent>{composer('reply')}</CardContent></Card>
   </>}
  </>}
 </div></DashboardLayout>;
}
