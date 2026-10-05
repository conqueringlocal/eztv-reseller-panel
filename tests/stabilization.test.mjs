import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';
const container=`eztv-stabilization-${process.pid}`;
const admin='11111111-1111-4111-8111-111111111111',reseller='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',customer='44444444-4444-4444-8444-444444444444',request='55555555-5555-4555-8555-555555555555';
const q=x=>`'${String(x).replaceAll("'","''")}'`;const j=x=>`${q(JSON.stringify(x))}::jsonb`;
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const as=(id,s)=>`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${q(id)}; ${s}; COMMIT;`;
const runAs=(id,s)=>sql(as(id,s));
const migrationNames=['20261002160000_trex_provisioning_guard.sql',...readdirSync('supabase/migrations').filter(x=>/_legacy_credit_security.sql$|_trex_paid_operations.sql$|_legacy_sso_expiry.sql$|_provider_reconciliation_checks.sql$|_business_dashboard.sql$|_legacy_connection_renewals.sql$|_trex_renumbering_guard.sql$/.test(x))];
before(async()=>{
 execFileSync('docker',['run','-d','--name',container,'--network','none','--label','eztv.disposable-test=true','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{stdio:'pipe'});
 for(let i=0;i<60;i++){try{sql('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,200));}}
 sql(readFileSync('tests/stabilization-schema.sql','utf8'));
 for(const name of migrationNames)sql(readFileSync(`supabase/migrations/${name}`,'utf8'));
 sql(`CREATE TABLE auth.users(id uuid, email text,raw_user_meta_data jsonb); CREATE TRIGGER signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
 ALTER TABLE profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY profile_read ON profiles FOR SELECT TO authenticated USING(id=auth.uid() OR is_admin()); CREATE POLICY profile_update ON profiles FOR UPDATE TO authenticated USING(id=auth.uid() OR is_admin()) WITH CHECK(id=auth.uid() OR is_admin());`);
});
after(()=>execFileSync('docker',['rm','-f','-v',container],{stdio:'pipe'}));
beforeEach(()=>{
 sql(`TRUNCATE manual_credit_requests,credit_adjustments,trex_paid_operations,trex_provisioning_requests,credit_logs,credit_requests,renewal_transactions,customers,user_roles,profiles CASCADE;
 INSERT INTO profiles(id,name,email,role,credits) VALUES(${q(admin)},'Admin','admin@example.invalid','admin',100),(${q(reseller)},'Reseller','reseller@example.invalid','reseller',100),(${q(other)},'Other','other@example.invalid','reseller',100);
 INSERT INTO user_roles(user_id,role) VALUES(${q(admin)},'admin'),(${q(reseller)},'reseller'),(${q(other)},'reseller');
 INSERT INTO customers(id,reseller_id,name,email,username,password,device_type,package_id,plan_duration,start_date,expiration_date,status,provider,customer_group,connection_list,total_connections,max_connections)
 VALUES(${q(customer)},${q(reseller)},'Fixture','customer@example.invalid','fixture1','fixturepass','Smart TV','27228',1,current_date,current_date+30,'active','trex','fixture-group','[]',1,1);`);
});
const claim=(kind='renew',months=1,connection=null,actor=reseller,internal=false)=>JSON.parse(sql(`SELECT claim_trex_paid_operation(${q(customer)},${q(actor)},${internal},${q(kind)},${months},${connection??'NULL'})`));
const balance=(id=reseller)=>Number(sql(`SELECT credits FROM profiles WHERE id=${q(id)}`));
const requestCredits=(id=request,actor=reseller,ref='PAYPAL-FIXTURE')=>runAs(actor,`SELECT request_manual_credits(${q(id)},10,${q(ref)})`);
const approve=(id=request,ref='VERIFIED-FIXTURE')=>runAs(admin,`SELECT review_manual_credits(${q(id)},true,${q(ref)},'Verified in sandbox')`);
const concurrent=s=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',c=>c?reject(new Error(err)):resolve(out.trim()));p.stdin.end(s);});
test('browser cannot self-promote, create profiles, mint credits or write ledger',()=>{
 for(const query of [`UPDATE profiles SET credits=999 WHERE id=${q(reseller)}`,`UPDATE profiles SET role='admin' WHERE id=${q(reseller)}`,`UPDATE profiles SET parent_reseller_id=${q(admin)} WHERE id=${q(reseller)}`,`INSERT INTO profiles(id) VALUES(gen_random_uuid())`,`INSERT INTO credit_logs(reseller_id,action,credits_used) VALUES(${q(reseller)},'addition',100)`])assert.throws(()=>runAs(reseller,query));
 runAs(reseller,`UPDATE profiles SET name='Updated contact' WHERE id=${q(reseller)}`);assert.equal(balance(),100);
 assert.throws(()=>runAs(admin,`UPDATE profiles SET credits=999 WHERE id=${q(reseller)}`));
});
test('signup ignores forged admin metadata and starts with zero credits',()=>{
 sql(`INSERT INTO auth.users VALUES(${q(request)},'signup@example.invalid','{"role":"admin","credits":1000}')`);
 assert.equal(sql(`SELECT role||':'||credits FROM profiles WHERE id=${q(request)}`),'reseller:0');assert.equal(sql(`SELECT has_role(${q(request)},'admin')`),'f');
});
test('unauthenticated callers cannot use money or paid operation commands',()=>{
 for(const f of ['request_manual_credits(uuid,integer,text)','review_manual_credits(uuid,boolean,text,text)','claim_trex_paid_operation(uuid,uuid,boolean,text,integer,integer,uuid)','finish_trex_paid_operation(uuid)'])assert.equal(sql(`SELECT has_function_privilege('anon',${q(f)},'EXECUTE')`),'f');
 assert.equal(sql("SELECT has_table_privilege('authenticated','trex_paid_operations','SELECT')"),'f');
});
test('manual credit approval validates actor and grants once under concurrency',async()=>{
 requestCredits();assert.throws(()=>runAs(other,`SELECT review_manual_credits(${q(request)},true,'XREF','')`));
 const results=await Promise.all(Array.from({length:5},()=>concurrent(as(admin,`SELECT review_manual_credits(${q(request)},true,'VERIFIED-FIXTURE','')`))));assert.ok(results.every(x=>x==='approved'));assert.equal(balance(),110);assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');
});
test('same verified payment cannot fund two requests and rollback is atomic',()=>{
 requestCredits();approve();requestCredits(customer,other,'DIFFERENT-SUBMITTED-REF');assert.throws(()=>approve(customer));assert.equal(balance(other),100);assert.equal(sql(`SELECT status FROM manual_credit_requests WHERE id=${q(customer)}`),'pending');
});
test('request ownership, server pricing, pending limits and persistent reference',()=>{
 requestCredits();requestCredits();assert.equal(sql('SELECT count(*) FROM manual_credit_requests'),'1');assert.equal(sql('SELECT unit_price FROM manual_credit_requests'),'3.00');assert.throws(()=>requestCredits(customer));assert.throws(()=>requestCredits(request,other));
 assert.equal(runAs(other,'SELECT count(*) FROM manual_credit_requests'),'0');assert.equal(runAs(admin,'SELECT count(*) FROM manual_credit_requests'),'1');
});
test('failed log insert rolls back approval and balance',()=>{
 requestCredits();sql("ALTER TABLE credit_logs ADD CONSTRAINT fixture_fail CHECK(credits_used<>10)");try{assert.throws(()=>approve());assert.equal(balance(),100);assert.equal(sql('SELECT status FROM manual_credit_requests'),'pending');}finally{sql('ALTER TABLE credit_logs DROP CONSTRAINT fixture_fail');}
});
test('admin adjustments are atomic, positive/negative and idempotent',()=>{
 const command=`SELECT adjust_reseller_credits(${q(request)},${q(reseller)},5,'Fixture')`;
 assert.throws(()=>runAs(reseller,command));runAs(admin,command);runAs(admin,command);assert.equal(balance(),105);assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');assert.throws(()=>runAs(admin,`SELECT adjust_reseller_credits(${q(customer)},${q(reseller)},-106,'Fixture')`));
});
test('parent approvals verify relationship and transfer only once',()=>{
 sql(`UPDATE profiles SET parent_reseller_id=${q(reseller)} WHERE id=${q(other)}`);const id=runAs(other,"SELECT request_parent_credits(10,'Fixture')");runAs(reseller,`SELECT review_parent_credits(${q(id)},true)`);runAs(reseller,`SELECT review_parent_credits(${q(id)},true)`);assert.equal(balance(),90);assert.equal(balance(other),110);assert.equal(sql('SELECT count(*) FROM credit_logs'),'2');
});
test('reseller creation cannot mint top-level credits',()=>{
 sql(`UPDATE profiles SET credits=0 WHERE id=${q(other)}`);sql(`SELECT initialize_reseller(${q(reseller)},${q(other)},'{"credits":100}')`);assert.equal(balance(),0);assert.equal(balance(other),100);assert.equal(sql(`SELECT parent_reseller_id FROM profiles WHERE id=${q(other)}`),reseller);assert.throws(()=>sql(`SELECT initialize_reseller(${q(reseller)},${q(other)},'{"credits":100}')`));
});
test('paid operations authenticate ownership and reject unsupported duration',()=>{
 assert.throws(()=>claim('renew',1,null,other));assert.throws(()=>claim('renew',2));assert.equal(balance(),100);
});
test('concurrent claims reserve once and all subsequent retries hold',async()=>{
 const results=await Promise.all(Array.from({length:5},()=>concurrent(`SELECT claim_trex_paid_operation(${q(customer)},${q(reseller)},false,'renew',1,NULL)`)));assert.equal(results.map(JSON.parse).filter(x=>x.claimed).length,1);assert.equal(balance(),99);assert.equal(claim().claimed,false);
});
test('canonical list counts secondary-only legacy lists and quote matches reservation',()=>{
 sql(`UPDATE customers SET connection_list='[{"connection_number":2,"username":"fixture2","password":"pass"},{"connection_number":3,"username":"fixture3","password":"pass"}]',total_connections=3,max_connections=3 WHERE id=${q(customer)}`);
 assert.equal(runAs(reseller,`SELECT credits_required FROM calculate_renewal_credits_required(${q(customer)},3)`),'9');const result=claim('renew',3);assert.equal(result.lines.length,3);assert.equal(balance(),91);
});
const stalePrimaryLines=[
 {connection_number:1,username:'listed-primary',password:'listed-pass',expiration_date:'2026-01-15'},
 {connection_number:2,username:'listed-second',password:'second-pass',expiration_date:'2026-10-06'},
 {connection_number:3,username:'listed-third',password:'third-pass',expiration_date:'2026-10-08'},
];
function stalePrimary(){sql(`UPDATE customers SET connection_list=${j(stalePrimaryLines)},total_connections=3,max_connections=3 WHERE id=${q(customer)}`);}
test('explicit primary in saved list supersedes stale top-level credentials for quotes and renewals',()=>{
 stalePrimary();assert.equal(runAs(reseller,`SELECT credits_required FROM calculate_renewal_credits_required(${q(customer)},1)`),'3');
 const c=claim();assert.deepEqual(c.lines.map(l=>l.username),stalePrimaryLines.map(l=>l.username));assert.equal(balance(),97);
});
test('single renewals of connections 2 and 3 complete independently with correct dates and one debit each',async()=>{
 stalePrimary();const a=await app();
 for(const connectionNumber of [2,3]){
  const r=await a.invoke('single',{connectionNumber});assert.equal(r.body.success,true);assert.equal(r.body.newExpirationDate,'2027-02-01');
 }
 const paid=a.calls.filter(u=>u.searchParams.get('action')==='renew');assert.deepEqual(paid.map(u=>u.searchParams.get('username')),['listed-second','listed-third']);
 assert.equal(balance(),98);const lines=JSON.parse(sql('SELECT connection_list FROM customers'));
 assert.equal(lines.length,3);assert.equal(lines[0].expiration_date,'2026-01-15');assert.equal(lines[1].expiration_date,'2027-02-01');assert.equal(lines[2].expiration_date,'2027-02-01');
 assert.equal(sql('SELECT expiration_date FROM customers'),'2026-01-15');
 await a.invoke('single',{connectionNumber:2});assert.equal(a.calls.filter(u=>u.searchParams.get('action')==='renew').length,2);assert.equal(balance(),98);
});
test('adding a connection to a saved list does not resurrect a stale primary',async()=>{
 stalePrimary();const a=await app();const r=await a.invoke('add');assert.equal(r.body.success,true);assert.equal(r.body.connection_number,4);assert.equal(r.body.newExpirationDate,'2027-02-01');
 const lines=JSON.parse(sql('SELECT connection_list FROM customers'));assert.equal(lines.length,4);assert.equal(lines[0].username,'listed-primary');assert.equal(balance(),99);
});
test('genuine duplicate numbers, missing credentials, and invalid line numbers still fail before debit',()=>{
 for(const lines of [[...stalePrimaryLines,stalePrimaryLines[0]],[{connection_number:1,username:'broken'}],[{connection_number:null,username:'broken',password:'pass'}]]){
  sql(`UPDATE customers SET connection_list=${j(lines)} WHERE id=${q(customer)}`);assert.throws(()=>claim());assert.equal(balance(),100);
 }
 assert.equal(sql('SELECT count(*) FROM trex_paid_operations'),'0');
});
test('insufficient multi-connection credits do not claim or spend',()=>{
 sql(`UPDATE profiles SET credits=2 WHERE id=${q(reseller)};UPDATE customers SET connection_list='[{"connection_number":2,"username":"fixture2","password":"pass"},{"connection_number":3,"username":"fixture3","password":"pass"}]' WHERE id=${q(customer)}`);assert.equal(claim().state,'insufficient_credits');assert.equal(balance(),2);assert.equal(sql('SELECT count(*) FROM trex_paid_operations'),'0');
});
test('new creation and renewals cannot race against each other',()=>{
 const c=claim();const result=JSON.parse(sql(`SELECT claim_trex_provisioning(${q(reseller)},'{"name":"Fixture","email":"new@example.invalid","connections":1,"planDuration":1}',true)`));assert.equal(result.claimed,false);assert.equal(result.requestId,c.requestId);
});
test('finalization checks receipts and commits once',()=>{
 const c=claim();assert.throws(()=>sql(`SELECT finish_trex_paid_operation(${q(c.requestId)})`));const receipt={...c.lines[0],confirmed:true,expiration_date:'2027-02-01'};sql(`UPDATE trex_paid_operations SET receipts=${j([receipt])} WHERE id=${q(c.requestId)}`);sql(`SELECT finish_trex_paid_operation(${q(c.requestId)})`);sql(`SELECT finish_trex_paid_operation(${q(c.requestId)})`);assert.equal(balance(),99);assert.equal(sql('SELECT expiration_date FROM customers'),'2027-02-01');assert.equal(claim().state,'recently_completed');
});
test('uncertain provider outcome never expires or retries',()=>{
 const c=claim();sql(`UPDATE trex_paid_operations SET state='review_required',created_at=now()-interval '2 days' WHERE id=${q(c.requestId)}`);assert.equal(claim().state,'review_required');assert.equal(balance(),99);
});
test('historical pending renewal blocks a new provider attempt',()=>{
 sql(`INSERT INTO renewal_transactions(customer_id,reseller_id,plan_duration,credits_required,transaction_key,status) VALUES(${q(customer)},${q(reseller)},1,1,'fixture','pending')`);assert.throws(()=>claim());assert.equal(balance(),100);
});
// Actual shared handler with mocked network and SQL-backed ledger. Never contacts a provider.
async function app(options={}){
 const calls=[];const client={auth:{getUser:async()=>({data:{user:options.invalid?null:{id:reseller}},error:null})},rpc:async(name,args)=>{
  try{
   if(name==='has_role')return {data:false,error:null};
   if(name==='claim_trex_paid_operation' && options.claimError)return {data:null,error:{message:options.claimError}};
   const data=name==='claim_trex_paid_operation'?claim(args.p_kind,args.p_months,args.p_connection,args.p_actor||reseller,args.p_internal):JSON.parse(sql(`SELECT finish_trex_paid_operation(${q(args.p_id)})`));return {data,error:null};
  }catch{return {data:null,error:{message:'database check failed'}};}
 },from(table){let updates,filters={};const chain={select(){return chain},eq(k,v){filters[k]=v;return chain},update(v){updates=v;return chain},async single(){
  if(table==='customers')return {data:{reseller_id:reseller,provider:'trex',package_id:'27228'},error:null};
  if(table==='profiles')return {data:{use_admin_api:true},error:null};
  if(options.storageFailure)return {data:null,error:{message:'storage failed'}};
  sql(`UPDATE trex_paid_operations SET receipts=${j(updates.receipts)} WHERE id=${q(filters.id)}`);return {data:{id:filters.id},error:null};
 },then(resolve){if(updates?.state)sql(`UPDATE trex_paid_operations SET state=${q(updates.state)} WHERE id=${q(filters.id)} AND state='processing'`);return Promise.resolve({error:null}).then(resolve);}};return chain;}};
 const context=vm.createContext({Response,URL,URLSearchParams,AbortSignal,Date,console:{log(){}},Deno:{env:{get:k=>({SUPABASE_URL:'https://database.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',TREX_API_KEY:'fixture-key',TREX_PANEL_URL:'https://provider.invalid/api/api.php'})[k]}},fetch:async(url)=>{
  const u=new URL(url);calls.push(u);if(u.searchParams.get('action')==='device_info')return Response.json([{status:'true',expire:'2027-02-01 00:00:00'}]);
  if(options.timeout)throw new Error('timeout');if(options.provider)return options.provider(u);
  if(u.searchParams.get('action')==='new')return Response.json([{status:'true',user_id:'fixture-id',url:'http:///get.php?username=added%2Buser&password=plus+password'}]);
  return Response.json([{status:'true'}]);
 }});
 const code=await transform(readFileSync('supabase/functions/_shared/trex-paid.ts','utf8'),{loader:'ts',format:'esm'});const mod=new vm.SourceTextModule(code.code,{context});
 await mod.link(async spec=>{
  if(spec.includes('supabase-js'))return new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',()=>client)},{context});
  const parsed=await transform(readFileSync('supabase/functions/_shared/trex-response.ts','utf8'),{loader:'ts',format:'esm'});const child=new vm.SourceTextModule(parsed.code,{context});await child.link(()=>{});await child.evaluate();return child;
 });await mod.evaluate();
 return {calls,invoke:async(kind='renew',input={})=>{const response=await mod.namespace.paidHandler(kind)(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture-user'},body:JSON.stringify({customerId:customer,planDuration:1,...input})}));return {status:response.status,body:await response.json()};}};
}
test('forged serviceCall flag does not bypass session authentication',async()=>{const a=await app({invalid:true});assert.equal((await a.invoke('renew',{serviceCall:true,resellerId:reseller})).status,401);assert.equal(a.calls.length,0);});
test('preflight errors say no operation started and make no provider calls or deductions',async()=>{
 for(const message of ['Connection details require review','An earlier renewal needs review; contact support','unexpected database problem']){
  const a=await app({claimError:message});const r=await a.invoke('single',{connectionNumber:2});assert.equal(r.status,409);
  assert.equal(r.body.code,message==='Connection details require review'?'connection_details_invalid':message==='unexpected database problem'?'reservation_unconfirmed':'not_started');assert.equal(a.calls.length,0);assert.equal(balance(),100);
  assert.ok(!JSON.stringify(r.body).includes('unexpected database problem'));
 }
});
test('URL/array add response saves credentials and appends without creating another customer',async()=>{const a=await app();const r=await a.invoke('add');assert.equal(r.body.success,true);assert.equal(sql('SELECT count(*) FROM customers'),'1');const lines=JSON.parse(sql('SELECT connection_list FROM customers'));assert.equal(lines.length,2);assert.equal(lines[1].username,'added+user');assert.equal(lines[1].password,'plus+password');assert.equal(balance(),99);});
test('renewal array response and provider-confirmed expiry finalize safely',async()=>{const a=await app();const r=await a.invoke();assert.equal(r.body.success,true);assert.equal(balance(),99);assert.equal(a.calls.filter(u=>u.searchParams.get('action')==='renew').length,1);await a.invoke();assert.equal(a.calls.filter(u=>u.searchParams.get('action')==='renew').length,1);});
test('timeout and receipt failure stop retries and keep the claim for review',async()=>{for(const options of [{timeout:true},{storageFailure:true}]){sql('TRUNCATE trex_paid_operations,credit_logs');sql(`UPDATE profiles SET credits=100 WHERE id=${q(reseller)}`);const a=await app(options);assert.equal((await a.invoke()).body.needsReview,true);await a.invoke();assert.equal(a.calls.filter(u=>u.searchParams.get('action')==='renew').length,1);assert.equal(balance(),99);}});
test('persistent client reference replays a completed operation after the safety window',()=>{
 const command=`SELECT claim_trex_paid_operation(${q(customer)},${q(reseller)},false,'renew',1,NULL,${q(request)})`;
 const c=JSON.parse(sql(command));sql(`UPDATE trex_paid_operations SET receipts=${j([{...c.lines[0],confirmed:true,expiration_date:'2027-02-01'}])} WHERE id=${q(c.requestId)}`);sql(`SELECT finish_trex_paid_operation(${q(c.requestId)})`);sql(`UPDATE trex_paid_operations SET created_at=now()-interval '2 days' WHERE id=${q(c.requestId)}`);
 const replay=JSON.parse(sql(command));assert.equal(replay.claimed,false);assert.equal(replay.state,'completed');assert.equal(replay.response.success,true);assert.equal(balance(),99);
});
test('valid reseller cannot use serviceCall or skipCredits fields to avoid debit',async()=>{const a=await app();const r=await a.invoke('renew',{serviceCall:true,skipCredits:true});assert.equal(r.body.success,true);assert.equal(balance(),99);});


test('renumbering renewed lines preserves history and blocks repeat single/group charges until safety window ends',async()=>{
 stalePrimary();const a=await app();
 for(const connectionNumber of [2,3])assert.equal((await a.invoke('single',{connectionNumber})).body.success,true);
 const before=sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM trex_paid_operations o');
 sql(`UPDATE customers SET connection_list=(SELECT jsonb_agg(l||jsonb_build_object('connection_number',(l->>'connection_number')::integer-1) ORDER BY (l->>'connection_number')::integer) FROM jsonb_array_elements(connection_list) l WHERE (l->>'connection_number')::integer IN (2,3)),total_connections=2,max_connections=2 WHERE id=${q(customer)}`);
 for(const n of [1,2])assert.equal(claim('single',1,n).state,'recently_completed');
 assert.equal(claim('renew').state,'recently_completed');assert.equal(balance(),98);
 assert.equal(sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM trex_paid_operations o'),before);
 assert.equal(runAs(reseller,`SELECT credits_required||':'||accounts_count FROM calculate_renewal_credits_required(${q(customer)},1)`),'2:2');
 sql("UPDATE trex_paid_operations SET created_at=now()-interval '25 hours'");
 const next=claim('renew');assert.equal(next.claimed,true);assert.deepEqual(next.lines.map(l=>l.connection_number),[1,2]);assert.deepEqual(next.lines.map(l=>l.username),['listed-second','listed-third']);assert.equal(balance(),96);
});
test('renumbering a MAG connection preserves the recent-renewal guard',()=>{
 sql(`UPDATE customers SET username=null,password=null,mac_address=null,connection_list='[{"connection_number":1,"mac_address":"AA:BB:CC:DD:EE:01"},{"connection_number":2,"mac_address":"AA:BB:CC:DD:EE:02"}]' WHERE id=${q(customer)}`);
 const c=claim('single',1,2);sql(`UPDATE trex_paid_operations SET receipts=${j([{...c.lines[0],confirmed:true,expiration_date:'2027-02-01'}])} WHERE id=${q(c.requestId)}`);sql(`SELECT finish_trex_paid_operation(${q(c.requestId)})`);
 sql(`UPDATE customers SET connection_list='[{"connection_number":1,"mac_address":"aa:bb:cc:dd:ee:02","expiration_date":"2027-02-01"}]' WHERE id=${q(customer)}`);
 assert.equal(claim('single',1,1).state,'recently_completed');assert.equal(balance(),99);
});
