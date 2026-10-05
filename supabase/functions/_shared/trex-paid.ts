import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import { parseCreationResponse } from './trex-response.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const review = 'This operation needs review. Do not submit it again. Contact support with the request reference.';
const providerFetch = (url: URL) => fetch(url.toString(), { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
export function paidHandler(kind: 'renew' | 'single' | 'add') {
 return async (req: Request) => {
  if (req.method === 'OPTIONS') return reply({});
  if (req.method !== 'POST') return reply({ success: false, error: 'Method not allowed' }, 405);
  let requestId: string | undefined;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const client = createClient(Deno.env.get('SUPABASE_URL') || '', service);
  try {
   const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
   if (!token) return reply({ error: 'Sign in required' }, 401);
   const internal = !!service && token === service;
   const { data: { user }, error: authError } = internal ? { data: { user: null }, error: null } : await client.auth.getUser(token);
   if (!internal && (authError || !user)) return reply({ error: 'Invalid session' }, 401);
   const input = await req.json();
   const customerId = input.customerId || input.customer_id;
   const months = input.planDuration ?? input.plan_duration;
   if (typeof customerId !== 'string' || !Number.isInteger(months) || ![1,3,6,12].includes(months) || (kind === 'single' && (!Number.isInteger(input.connectionNumber) || input.connectionNumber < 1))) return reply({ success: false, error: 'Invalid customer, duration or connection' }, 400);
   const { data: customer, error: customerError } = await client.from('customers').select('reseller_id,provider,package_id').eq('id',customerId).single();
   if (customerError || !customer) return reply({ error: 'Customer not found' },404);
   const { data: isAdmin, error: roleError } = internal ? { data: false, error: null } : await client.rpc('has_role',{_user_id:user!.id,_role:'admin'});
   if (roleError || (!internal && !isAdmin && customer.reseller_id !== user!.id) || (internal && input.resellerId && customer.reseller_id !== input.resellerId)) return reply({ error: 'Not authorized' },403);
   const { data: profile, error: profileError } = await client.from('profiles').select('use_admin_api,api_key,panel_url').eq('id',customer.reseller_id).single();
   const key = profile?.use_admin_api ? Deno.env.get('TREX_API_KEY') : profile?.api_key;
   const panel = profile?.use_admin_api ? Deno.env.get('TREX_PANEL_URL') : profile?.panel_url;
   if (profileError || !key || !panel || customer.provider !== 'trex') return reply({ success:false,error:'Provider configuration requires administrator review. No request was sent.' },503);
   const endpoint = new URL(panel);
   if (endpoint.protocol !== 'https:') throw new Error('configuration');
   endpoint.pathname=endpoint.pathname.replace(/\/(api\/api\.php|player_api\.php)\/?$/,'').replace(/\/$/,'')+'/api/api.php'; endpoint.search=''; endpoint.hash='';
   let pack = customer.package_id;
   if(kind==='add' && !/^\d+$/.test(String(pack||''))) {
    const {data} = await client.from('system_settings').select('value').eq('id','trex_default_package_id').single(); pack=data?.value;
    if(!/^\d+$/.test(String(pack||''))) return reply({success:false,error:'A valid Trex package is required. Contact support.'},400);
   }
   const { data: claim, error: claimError } = await client.rpc('claim_trex_paid_operation',{p_customer:customerId,p_actor:user?.id || null,p_internal:internal,p_kind:kind,p_months:months,p_connection:kind==='single'?input.connectionNumber:null,p_client_key:typeof input.operationKey==='string'&&/^[0-9a-f-]{36}$/i.test(input.operationKey)?input.operationKey:null});
   if(claimError || !claim) {
    const allowed = ['An earlier renewal needs review; contact support','A creation attempt needs review; contact support','Connection limit reached or existing connections require review','Connection details require review','Duplicate connection details require review'];
    const code = ['Connection details require review','Duplicate connection details require review','Connection not found','Invalid connection list'].includes(claimError?.message) ? 'connection_details_invalid' : allowed.includes(claimError?.message) ? 'not_started' : 'reservation_unconfirmed';
    console.log(JSON.stringify({event:'trex_paid_not_started',customerId,kind,connectionNumber:input.connectionNumber,code}));
    return reply({success:false,code,error:allowed.includes(claimError?.message)?claimError.message:'The operation could not be started. Contact support.'},409);
   }
   requestId=claim.requestId;
   if(!claim.claimed) {
    if(claim.state==='completed' && claim.response) return reply({...claim.response,alreadyProcessed:true});
    const error=claim.state==='insufficient_credits'?`Insufficient credits: ${claim.required} required, ${claim.available} available.`:claim.state==='recently_completed'?'These connections were already changed within the last 24 hours. Contact support if another change is needed.':review;
    return reply({success:false,error,requestId,needsReview:claim.state!=='insufficient_credits',code:claim.state},409);
   }
   const receipts: Record<string,unknown>[]=[];
   for(const line of claim.lines) {
    const url=new URL(endpoint);
    const params:Record<string,string>={action:kind==='add'?'new':'renew',type:line.mac_address?'mag':'m3u',sub:String(months),api_key:key};
    if(kind==='add') { params.pack=String(pack); params.note=`EZTV ${requestId} | Reseller ${claim.resellerId} ${claim.resellerName||''} | Customer ${claim.customerName} | Line ${claim.connectionNumber}`; }
    else if(line.mac_address) params.mac=line.mac_address;
    else { params.username=line.username; params.password=line.password; }
    url.search=new URLSearchParams(params).toString();
    const response=await providerFetch(url);
    if(!response.ok) throw new Error('provider_outcome_unknown');
    const raw=await response.json();
    let receipt:Record<string,unknown>={...line,confirmed:true,status:'active'};
    if(kind==='add') { const parsed=parseCreationResponse(raw); receipt={...receipt,username:parsed.username,password:parsed.password,m3u_url:parsed.m3uUrl,accountRef:parsed.accountRef,device_type:claim.deviceType}; }
    else { const body=Array.isArray(raw)&&raw.length===1?raw[0]:raw; if(!body || ![true,'true','success'].includes(body.status) && body.success!==true) throw new Error('provider_outcome_unknown'); }
    // Persist paid success BEFORE any read-only expiry lookup or next paid call.
    receipts.push(receipt);
    let saved=await client.from('trex_paid_operations').update({receipts,updated_at:new Date().toISOString()}).eq('id',requestId).eq('state','processing').select('id').single();
    if(saved.error || !saved.data) throw new Error('receipt_storage_failed');
    // Trex device_info uses `expire`; it works independently of playback-domain access rules.
    const check=new URL(endpoint);
    const lookup:Record<string,string>={action:'device_info',type:line.mac_address?'mag':'m3u',api_key:key};
    if(line.mac_address) lookup.mac=line.mac_address;
    else {lookup.username=String(receipt.username);lookup.password=String(receipt.password);}
    check.search=new URLSearchParams(lookup).toString();
    const info=await providerFetch(check); if(!info.ok) throw new Error('expiry_unverified');
    const rawInfo=await info.json();const details=Array.isArray(rawInfo)&&rawInfo.length===1?rawInfo[0]:rawInfo;
    if(!details || ![true,'true','success'].includes(details.status))throw new Error('expiry_unverified');
    const expiry=details.expire??details.exp_date??details.expiration_date;
    const date=typeof expiry==='number'||/^\d+$/.test(String(expiry))?new Date(Number(expiry)*1000):new Date(String(expiry).replace(' ','T'));
    if(!Number.isFinite(date.getTime()) || date.getTime()<Date.now()) throw new Error('expiry_unverified');
    receipt.expiration_date=date.toISOString().slice(0,10);
    saved=await client.from('trex_paid_operations').update({receipts,updated_at:new Date().toISOString()}).eq('id',requestId).eq('state','processing').select('id').single();
    if(saved.error || !saved.data) throw new Error('receipt_storage_failed');
   }
   const {data:result,error:finishError}=await client.rpc('finish_trex_paid_operation',{p_id:requestId});
   if(finishError || !result) throw new Error('finalization_pending');
   console.log(JSON.stringify({event:'trex_paid_completed',requestId,kind}));
   return reply(result);
  } catch {
   if(requestId) {
    await client.from('trex_paid_operations').update({state:'review_required',updated_at:new Date().toISOString()}).eq('id',requestId).eq('state','processing');
    return reply({success:false,needsReview:true,requestId,error:review},409);
   }
   return reply({success:false,error:'Operation unavailable. No provider request was sent.'},503);
  }
 };
}
