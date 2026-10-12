// Supabase verifies identity and current hierarchy on every request. Zammad holds
// conversations; neither its credentials nor the signing key reach the browser.
// deno-lint-ignore no-explicit-any
export function helpdeskHandler(db:any, fetcher:typeof fetch=fetch) {
 const headers={'Access-Control-Allow-Origin':'https://reseller.eztvclub.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!token)return reply({error:'Sign in required'},401);
   const verified=await db.auth.getUser(token);
   if(verified.error||!verified.data?.user||verified.data.user.is_anonymous)return reply({error:'Sign in required'},401);
   // Decode only the token that getUser just verified. No user_metadata roles.
   const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   const sid=claims.session_id;
   if(typeof sid!=='string'||!/^[0-9a-f-]{36}$/i.test(sid))return reply({error:'Sign in again'},401);
   const raw=await req.text();if(raw.length>5*1024*1024)return reply({error:'Request too large'},413);
   let body;try{body=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
   if(!body||!['config','attention','list','detail','create','reply','close','reopen','escalate','attachment'].includes(body.action))return reply({error:'Invalid request'},400);
   const result=await db.rpc('reseller_helpdesk_context',{p_actor:verified.data.user.id,p_session:sid});
   if(result.error||!result.data)return reply({error:'Support access is unavailable. Sign in again or contact your support provider.'},403);
   const context=result.data;
   if(context.actor.admin&&verified.data.user.factors?.some((f:{status:string})=>f.status==='verified')&&claims.aal!=='aal2')return reply({error:'Complete your administrator MFA sign-in first'},403);
   if(body.action==='config')return reply({enabled:context.enabled,support_name:context.support_name,admin:context.actor.admin,has_parent:!!context.actor.parent_id});
   if(!context.enabled)return reply({error:'Dashboard support is being prepared. Please use your existing support contact.'},503);
   if(context.endpoint!=='https://srv1781264.hstgr.cloud/eztv-support/v1')throw new Error('invalid_endpoint');
   const input=body.input??{};
   if(typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
   const payload=JSON.stringify({issued_at:Math.floor(Date.now()/1000),context:{actor:context.actor,children:context.children},action:body.action,input});
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(context.key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))),b=>b.toString(16).padStart(2,'0')).join('');
   const response=await fetcher(context.endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-EZTV-Signature':signature},body:payload,signal:AbortSignal.timeout(20000),redirect:'error'});
   const data=await response.json();
   if(![200,400,401,403,413,429,503].includes(response.status))throw new Error('upstream_failure');
   return reply(data,response.status);
  }catch{return reply({error:'Support could not confirm this request. Keep the same request reference when retrying.'},503);}
 };
}
