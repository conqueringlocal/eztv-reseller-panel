import {SetupData, setupMessage, sender} from './message.ts';
type Mailer = {configured:boolean; verify:()=>Promise<void>; send:(message:ReturnType<typeof setupMessage>&{messageId:string})=>Promise<void>};
type Job = {id:string;customer_id:string;reseller_id:string;recipient:string;content_version:string|null;claim_id:string};
// Database client is injected to exercise the real authorization and queue logic in tests.
// deno-lint-ignore no-explicit-any
export function createEmailHandler(db:any, authenticate:(jwt:string)=>Promise<string|null>, mail:Mailer) {
 const headers={'Access-Control-Allow-Origin':'https://reseller.eztvclub.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
 const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 // deno-lint-ignore no-explicit-any
 const checked=(r:any)=>{if(r.error)throw new Error('database_unavailable');return r.data;};
 async function payload(customer:string,actor:string):Promise<SetupData>{return checked(await db.rpc('customer_setup_email_data',{p_customer:customer,p_actor:actor}));}
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  try {
   const workerToken=req.headers.get('X-Customer-Email-Token');
   let user:string|null=null;
   if(workerToken){
    const allowed=checked(await db.rpc('authorize_customer_email_worker',{p_token:workerToken}));
    if(!allowed)return json({error:'Unauthorized'},401);
   }else{
    const token=/^Bearer (.+)$/.exec(req.headers.get('Authorization')||'')?.[1];
    user=token?await authenticate(token):null;
    if(!user)return json({error:'Sign in required'},401);
   }
   const raw=await req.text();if(raw.length>16384)return json({error:'Request too large'},413);
   const body=JSON.parse(raw||'{}');
   if(body.action==='health'){
    if(!workerToken){
     const admin=checked(await db.rpc('has_role',{_user_id:user,_role:'admin'}));
     if(!admin)return json({error:'Administrator required'},403);
    }
    if(!mail.configured)return json({configured:false,smtp_verified:false});
    try{await mail.verify();return json({configured:true,smtp_verified:true});}
    catch{return json({configured:true,smtp_verified:false});}
   }
   if(workerToken){
    if(body.action!=='work')return json({error:'Invalid worker action'},400);
    if(!mail.configured)return json({error:'Email sender is not configured'},503);
    checked(await db.rpc('collect_customer_setup_emails'));
    const jobs:Job[]=checked(await db.rpc('claim_customer_setup_emails'))||[];
    const outcomes=[];
    for(const job of jobs){
     let status='failed',error:string|null=null, attempted=false;
     try{
      const data=await payload(job.customer_id,job.reseller_id);
      if(data.reseller_id!==job.reseller_id || data.recipient.toLowerCase()!==job.recipient.toLowerCase())throw new Error('recipient_changed');
      if(job.content_version && data.version!==job.content_version)throw new Error('details_changed');
      const message=setupMessage(data);
      attempted=true;
      await mail.send({...message,messageId:`<customer-setup-${job.id}@eztvclub.com>`});
      status='sent';
     }catch(e){
      // SMTP acceptance + a lost response cannot be made exactly-once. Never
      // automatically resend an ambiguous attempt or an interrupted worker.
      status=attempted?'uncertain':'failed';
      const code=e instanceof Error?e.message:'';
      error=['recipient_changed','details_changed','credentials_need_review','setup_url_invalid','invalid_recipient','no_current_connections'].includes(code)?code:attempted?'smtp_outcome_unconfirmed':'setup_details_unavailable';
     }
     const saved=checked(await db.rpc('finish_customer_setup_email',{p_id:job.id,p_claim:job.claim_id,p_status:status,p_error:error}));
     if(!saved)throw new Error('outcome_not_saved');
     outcomes.push({id:job.id,status});
    }
    return json({outcomes});
   }
   if(body.action==='config'){
    const setting=checked(await db.from('customer_email_settings').select('enabled').eq('id',true).single());
    return json({enabled:mail.configured&&setting.enabled,sender});
   }
   if(!uuid(body.customerId))return json({error:'Choose a customer'},400);
   const data=await payload(body.customerId,user!);
   if(body.action==='preview'){
    const message=setupMessage(data);
    const history=checked(await db.from('customer_email_jobs').select('id,status,source,recipient,created_at,finished_at,error_code').eq('customer_id',body.customerId).order('created_at',{ascending:false}).limit(10));
    const setting=checked(await db.from('customer_email_settings').select('enabled').eq('id',true).single());
    return json({recipient:data.recipient,replyTo:data.reply_to,subject:message.subject,text:message.text,version:data.version,enabled:mail.configured&&setting.enabled,history});
   }
   if(body.action==='send'){
    if(!mail.configured)return json({error:'Email sending is temporarily unavailable'},503);
    if(!uuid(body.requestId)||typeof body.version!=='string')return json({error:'Reload the preview before sending'},400);
    const result=await db.rpc('request_customer_setup_email',{p_customer:body.customerId,p_actor:user,p_id:body.requestId,p_version:body.version});
    if(result.error){
     const allowed=['Details changed; reload preview','Please wait one minute before sending again','Hourly email limit reached','Email sending is temporarily unavailable'];
     return json({error:allowed.includes(result.error.message)?result.error.message:'Email request could not be confirmed. Check the delivery history before sending again.'},409);
    }
    return json(result.data);
   }
   return json({error:'Unknown action'},400);
  }catch{return json({error:'Customer or email details are unavailable. Refresh to check the delivery history. Account creation is unaffected.'},503);}
 };
}
