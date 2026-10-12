// Internal worker authentication is separate from the dashboard's user JWT path.
// The worker gets addresses only after current ownership is verified by the DB.
export async function notificationRoute(req:Request,db:any):Promise<Response> {
 const fail=()=>Response.json({error:'Unauthorized'},{status:401});
 try {
  const raw=await req.text();if(raw.length>2048)return fail();
  const body=JSON.parse(raw);
  if(body.purpose!=='support-notification-route'||!Number.isInteger(body.issued_at)||Math.abs(Date.now()/1000-body.issued_at)>30)return fail();
  const signature=req.headers.get('x-eztv-notification-signature')||'';
  if(!/^[a-f0-9]{64}$/.test(signature))return fail();
  const secret=await db.rpc('reseller_helpdesk_notification_key');
  if(secret.error||!secret.data)return fail();
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret.data),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(signature.match(/../g)!,s=>parseInt(s,16));
  if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(raw)))return fail();
  const result=await db.rpc('reseller_helpdesk_recipients',{p_creator:body.creator_id,p_handler:body.handler_id,p_audience:body.audience});
  if(result.error)return Response.json({error:'Routing unavailable'},{status:503});
  return Response.json({recipients:result.data},{headers:{'Cache-Control':'no-store'}});
 } catch {return fail();}
}
