import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return reply({});
 if(req.method!=='POST') return reply({error:'Method not allowed'},405);
 const client=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 try {
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
  const {data:{user},error}=await client.auth.getUser(token);
  if(error||!user) return reply({error:'Sign in required'},401);
  const input=await req.json();
  if(typeof input.name!=='string'||!input.name.trim()||typeof input.email!=='string'||typeof input.password!=='string'||input.password.length<8||!Number.isInteger(input.credits??0)||(input.credits??0)<0) return reply({error:'Provide a name, email, password of at least 8 characters and a whole credit amount'},400);
  const {data:isAdmin,error:roleError}=await client.rpc('has_role',{_user_id:user.id,_role:'admin'});
  if(roleError) return reply({error:'Unable to verify permissions'},503);
  if(!isAdmin && (input.parent_reseller_id && input.parent_reseller_id!==user.id || (input.credits??0)<100)) return reply({error:'You may create only your own child reseller, with at least 100 credits'},403);
  const {data:created,error:createError}=await client.auth.admin.createUser({email:input.email.trim(),password:input.password,email_confirm:true,user_metadata:{name:input.name.trim()}});
  if(createError||!created.user) return reply({error:'Account could not be created. Check the email and password; an account may already exist.'},400);
  const {error:initError}=await client.rpc('initialize_reseller',{p_actor:user.id,p_new:created.user.id,p_data:{credits:input.credits??0,parent_reseller_id:isAdmin?input.parent_reseller_id||null:user.id,credit_price_per_unit:input.credit_price_per_unit??3}});
  if(initError) {
   // A database/network error can be ambiguous: never delete an account that may have committed.
   return reply({success:false,needsReview:true,requestId:created.user.id,error:'The account was created but its allocation needs administrator review. Do not create it again.'},409);
  }
  return reply({success:true,user:{id:created.user.id},creditsAllocated:input.credits??0,providerInherited:'trex'});
 }catch{return reply({error:'Account creation could not be confirmed. Check the account list before retrying.'},503);}
});
