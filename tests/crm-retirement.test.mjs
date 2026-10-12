import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { transform } from 'esbuild';

const retired = ['webhook','create-highlevel-contact','update-highlevel-contact','update-highlevel-contact-credentials','get-highlevel-fields-and-tags','import-customers-to-highlevel','send-highlevel-message','sync-customer-to-crm','reseller-credit-monitor','auto-post-sports-update'];
async function loadHandler(name, client, fetchImpl) {
 let handler;
 const context=vm.createContext({ Request, Response, URL, URLSearchParams, AbortSignal, console:{log(){},warn(){},error(){}},
  fetch:fetchImpl ?? (()=>{throw new Error('Network calls forbidden');}),
  Deno:{serve:fn=>handler=fn,env:{get:key=>key==='TREX_PANEL_URL'?'https://provider.invalid':'fixture'}} });
 const cache=new Map();
 async function load(path) {
  if(cache.has(path))return cache.get(path);
  const code=(await transform(readFileSync(path,'utf8'),{loader:'ts',format:'esm'})).code;
  const mod=new vm.SourceTextModule(code,{context});cache.set(path,mod);
  await mod.link(async specifier=>{
   if(specifier.includes('http/server'))return new vm.SyntheticModule(['serve'],function(){this.setExport('serve',fn=>handler=fn);},{context});
   if(specifier.includes('@supabase/supabase-js'))return new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>{assert.ok(client,'Database access forbidden');return client;});},{context});
   const resolved=new URL(specifier,new URL(path,`file://${process.cwd()}/`));
   return load(resolved.pathname);
  });return mod;
 }
 const mod=await load(`supabase/functions/${name}/index.ts`);await mod.evaluate();return handler;
}
for(const name of retired)test(`${name} rejects stale CRM traffic without side effects`,async()=>{
 const handler=await loadHandler(name);
 for(const method of ['GET','POST','PUT','DELETE']){
  const response=await handler(new Request('https://fixture.invalid',{method,...(method==='GET'?{}:{body:'not even JSON'})}));
  assert.equal(response.status,410);assert.equal((await response.json()).code,'INTEGRATION_RETIRED');
 }
 assert.equal((await handler(new Request('https://fixture.invalid',{method:'OPTIONS'}))).status,204);
});
for(const name of ['create-trial-user','create-trex-trial-user'])test(`${name} saves provider credentials without CRM calls`,async()=>{
 let inserted;let trialCount;let calls=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'reseller'}},error:null})},rpc:async()=>({data:false,error:null}),from(table){
  assert.ok(['profiles','system_settings','daily_trial_limits','customers'].includes(table));
  const filters={};let row;
  const chain={select(){return chain;},eq(k,v){filters[k]=v;return chain;},gte(){return chain;},lt(){return chain;},
   insert(data){row=data;inserted=data;return chain;},upsert(data){trialCount=data.trial_count;return Promise.resolve({error:null});},
   async single(){return {error:null,data:table==='profiles'?{provider:'trex',name:'Reseller'}:table==='system_settings'?{value:filters.id==='trex_trial_daily_limit'?'10':'132'}:table==='daily_trial_limits'?{trial_count:0}:row?{id:'trial-id',...row}:null};}};
  return chain;
 }};
 const handler=await loadHandler(name,client,async url=>{calls++;assert.equal(new URL(url).hostname,'provider.invalid');return new Response(JSON.stringify({username:'trial-user',password:'trial-pass'}));});
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({resellerId:'reseller',customerData:{name:'Test Customer',email:'test@example.invalid',highlevelContactId:'stale-contact'}})}));
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.success,true);
 assert.equal(calls,1);assert.equal(inserted.username,'trial-user');assert.equal(inserted.password,'trial-pass');assert.equal(inserted.is_trial,true);assert.equal(trialCount,1);assert.equal(inserted.highlevel_contact_id,undefined);
 assert.equal(body.customer.username,'trial-user');assert.ok(body.customer.m3uUrl.includes('trial-user'));
});

const container=`eztv-crm-retirement-${process.pid}`;
const sql=text=>execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
before(()=>{
 execFileSync('docker',['run','--rm','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{stdio:'pipe'});
 for(let i=0;i<60;i++){try{sql('SELECT 1');break;}catch{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}}
});
after(()=>execFileSync('docker',['rm','-f','-v',container],{stdio:'pipe'}));
test('migration clears only CRM secrets, removes only its cron job, and blocks reactivation',()=>{
 sql(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE reseller_highlevel_settings(is_active boolean,location_api_key text,private_integration_token text);
 CREATE TABLE admin_highlevel_settings(is_active boolean,private_integration_token text);
 CREATE VIEW reseller_highlevel_status AS SELECT is_active FROM reseller_highlevel_settings;
 CREATE FUNCTION get_highlevel_status(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';
 CREATE TABLE system_settings(id text,value text);
 CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigint,jobname text);
 CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS 'DELETE FROM cron.job WHERE jobid=$1 RETURNING true';
 INSERT INTO cron.job VALUES(1,'reseller-credit-monitor'),(2,'trex-balance-sync');
 INSERT INTO reseller_highlevel_settings VALUES(true,'old-key','old-token');
 INSERT INTO admin_highlevel_settings VALUES(true,'old-token');
 INSERT INTO system_settings VALUES('highlevel_agency_api_key','old-key'),('trex_api_key','provider-key');
 GRANT ALL ON reseller_highlevel_settings,admin_highlevel_settings,reseller_highlevel_status TO authenticated;`);
 sql(readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(f=>f.endsWith('_retire_highlevel_integration.sql')),'utf8'));
 assert.equal(sql('SELECT jobname FROM cron.job'),'trex-balance-sync');
 assert.equal(sql("SELECT is_active OR location_api_key<>'' OR private_integration_token<>'' FROM reseller_highlevel_settings"),'f');
 assert.equal(sql("SELECT is_active OR private_integration_token<>'' FROM admin_highlevel_settings"),'f');
 assert.equal(sql('SELECT id FROM system_settings'),'trex_api_key');
 assert.throws(()=>sql('UPDATE reseller_highlevel_settings SET is_active=true'));
 assert.throws(()=>sql("UPDATE admin_highlevel_settings SET private_integration_token='new-token'"));
 assert.throws(()=>sql("INSERT INTO system_settings VALUES('highlevel_agency_api_key','new')"));
 for(const role of ['anon','authenticated']){
  assert.equal(sql(`SELECT has_table_privilege('${role}','reseller_highlevel_settings','SELECT')`),'f');
  assert.equal(sql(`SELECT has_function_privilege('${role}','get_highlevel_status(uuid)','EXECUTE')`),'f');
 }
});

test('domain backfill updates saved connection URLs without fetching CRM settings or sending network requests',async()=>{
 const writes=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},rpc:async()=>({data:true,error:null}),from(table){
  assert.ok(['profiles','customers'].includes(table));let payload;
  const chain={select(){return chain;},eq(){return payload?(writes.push(payload),Promise.resolve({error:null})):chain;},
   async single(){return {data:{id:'reseller',m3u_domain_override:'stream.example.invalid'},error:null};},
   async range(from){return {data:from?[]:[{id:'customer',m3u_url:'https://old.invalid/get.php?username=primary',connection_list:[{m3u_url:'https://old.invalid/get.php?username=primary'},{m3u_url:'https://old.invalid/get.php?username=second'}]}],error:null};},
   update(row){payload=row;return chain;}};return chain;
 }};
 const handler=await loadHandler('backfill-m3u-domains',client);
 const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify({reseller_id:'reseller'})}));
 assert.equal(response.status,200);assert.equal((await response.json()).customersUpdated,1);assert.equal(writes.length,1);
 assert.match(writes[0].m3u_url,/stream.example.invalid.*username=primary/);
 assert.match(writes[0].connection_list[1].m3u_url,/stream.example.invalid.*username=second/);
});

test('runtime source contains no CRM network destinations or CRM invocations',()=>{
 function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
 for(const file of [...files('src'),...files('supabase/functions')].filter(f=>/\.(ts|tsx)$/.test(f))){
  const source=readFileSync(file,'utf8');
  assert.doesNotMatch(source,/https?:\/\/[^'"\s]*(?:gohighlevel|leadconnector)/i,file);
  assert.doesNotMatch(source,/\.invoke\(['"](?:[^'"]*highlevel[^'"]*|sync-customer-to-crm|auto-post-sports-update|reseller-credit-monitor)['"]/i,file);
 }
});
