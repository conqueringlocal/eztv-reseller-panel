import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.7';
const headers={'Access-Control-Allow-Origin':'https://reseller.eztvclub.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return reply({});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';if(!token)return reply({error:'Unauthorized'},401);
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply({error:'Unauthorized'},401);
  const role=await db.rpc('has_role',{_user_id:user.id,_role:'admin'});
  const authorized=!role.error&&role.data===true;
  if(!authorized)return reply({error:'Unauthorized'},401);
  const {data:customers,error}=await db.from('customers').select('id,reseller_id,username,password,mac_address,connection_list,expiration_date').eq('provider','trex');
  if(error)return reply({error:'Customer lookup failed'},503);
  const {data:profiles,error:pe}=await db.from('profiles').select('id,use_admin_api,api_key,panel_url');if(pe)return reply({error:'Profile lookup failed'},503);
  const results:Record<string,unknown>[]=[];
  for(const c of customers||[]){
   let lines=Array.isArray(c.connection_list)?[...c.connection_list]:[];
   if(!lines.some(l=>l.username===c.username || c.mac_address&&l.mac_address===c.mac_address))lines.unshift({connection_number:1,username:c.username,password:c.password,mac_address:c.mac_address});
   const p=profiles?.find(p=>p.id===c.reseller_id);const key=p?.use_admin_api?Deno.env.get('TREX_API_KEY'):p?.api_key;const panel=p?.use_admin_api?Deno.env.get('TREX_PANEL_URL'):p?.panel_url;
   for(const line of lines){
    const result:Record<string,unknown>={customer_id:c.id,connection_number:line.connection_number,local_expiry:line.expiration_date||c.expiration_date};
    try{
     if(!key||!panel)throw new Error('configuration');
     const url=new URL(panel);if(url.protocol!=='https:')throw new Error('configuration');url.pathname=url.pathname.replace(/\/(api\/api\.php|player_api\.php)\/?$/,'').replace(/\/$/,'')+'/api/api.php';url.hash='';
     const params:Record<string,string>={action:'device_info',type:line.mac_address?'mag':'m3u',api_key:key};
     if(line.mac_address)params.mac=line.mac_address;else{if(!line.username||!line.password)throw new Error('missing_credentials');params.username=line.username;params.password=line.password;}
     url.search=new URLSearchParams(params).toString();
     const response=await fetch(url.toString(),{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'IPTV-Management-System/1.0'}});
     if(!response.ok){result.outcome='lookup_failed';result.http_status=response.status;}
     else{
      const raw=await response.json();const body=Array.isArray(raw)?raw[0]:raw;
      // Return field names and non-sensitive status/date values only, never raw credentials or URLs.
      result.fields=body&&typeof body==='object'?Object.keys(body):[];
      const accepted=['expire','enabled','exp_date','expiration_date','expire_date','expiration','expiry_date','status','is_expired','is_trial'];
      const pick=(v:Record<string,unknown>)=>Object.fromEntries(accepted.filter(k=>typeof v?.[k]==='string'||typeof v?.[k]==='number'||typeof v?.[k]==='boolean').map(k=>[k,v[k]]));
      result.details=pick(body);result.user_info=pick(body?.user_info);result.data=pick(body?.data);result.outcome='response_received';
     }
    }catch{result.outcome='lookup_failed';}
    results.push(result);
   }
  }
  return reply({results});
 }catch{return reply({error:'Inspection unavailable'},503);}
});
