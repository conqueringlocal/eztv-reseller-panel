import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
const container=`eztv-email-test-${process.pid}`;
const a='11111111-1111-4111-8111-111111111111',r='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333',c='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555',other='66666666-6666-4666-8666-666666666666';
const q=x=>x===null?'NULL':`'${String(x).replaceAll("'","''")}'`;
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const concurrent=s=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',c=>c?reject(new Error(err)):resolve(out.trim()));p.stdin.end(s);});
const migration=suffix=>readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(f=>f.endsWith(suffix)),'utf8');
const data=(actor=r)=>JSON.parse(sql(`SELECT customer_setup_email_data('${c}','${actor}')`));
const request=(job=id,actor=r,version=data().version)=>`SELECT request_customer_setup_email('${c}','${actor}','${job}',${q(version)})`;
function intent(flag=true,state='completed',customer=c,age='0 hours',requestId=id){sql(`INSERT INTO trex_provisioning_requests(id,reseller_id,fingerprint,request_data,charge_credits,state,response,created_at) VALUES('${requestId}','${r}','test','${JSON.stringify({email:'customer@example.invalid',...(flag===undefined?{}:{sendSetupEmail:flag})})}',true,'${state}','${JSON.stringify({customerId:customer})}',now()-interval '${age}')`);}
let message,handler;
before(async()=>{
 execFileSync('docker',['run','-d','--name',container,'--network','none','--label','eztv.disposable-test=true','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{stdio:'pipe'});
 for(let i=0;i<60;i++){try{sql('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,200));}}
 sql(readFileSync('tests/stabilization-schema.sql','utf8'));
 sql(migration('trex_provisioning_guard.sql'));
 sql(migration('legacy_connection_renewals.sql').split('CREATE OR REPLACE FUNCTION public.finish_trex_paid_operation')[0]+'COMMIT;');
 sql(`CREATE TABLE reseller_sales_pages(reseller_id uuid PRIMARY KEY,contact_email text);
 CREATE SCHEMA vault; CREATE TABLE vault.secrets(name text,decrypted_secret text); CREATE VIEW vault.decrypted_secrets AS SELECT * FROM vault.secrets;
 CREATE FUNCTION vault.create_secret(text,text,text) RETURNS void LANGUAGE sql AS $$ INSERT INTO vault.secrets VALUES($2,$1) $$;
 CREATE SCHEMA net; CREATE TABLE net.calls(id bigint GENERATED ALWAYS AS IDENTITY,body jsonb);
 CREATE FUNCTION net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO net.calls(body) VALUES($3) RETURNING id $$;
 CREATE SCHEMA cron; CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;`);
 sql(migration('customer_setup_emails.sql'));
 for(const [name,set] of [['message',v=>message=v],['handler',v=>handler=v]]){
  const result=await build({entryPoints:[`supabase/functions/_shared/customer-email/${name}.ts`],bundle:true,write:false,format:'esm',platform:'node'});set(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
 }
});
after(()=>execFileSync('docker',['rm','-f','-v',container],{stdio:'pipe'}));
beforeEach(()=>{
 sql(`TRUNCATE profiles,user_roles,customers,trex_provisioning_requests,customer_email_jobs,reseller_sales_pages,net.calls CASCADE;
 INSERT INTO profiles(id,name,email,role,credits) VALUES('${a}','Admin','admin@example.invalid','admin',100),('${r}','Reseller','r@example.invalid','reseller',100),('${b}','Other','b@example.invalid','reseller',100);
 INSERT INTO user_roles(user_id,role) VALUES('${a}','admin'),('${r}','reseller'),('${b}','reseller');
 INSERT INTO customers(id,reseller_id,name,email,device_type,plan_duration,start_date,expiration_date,username,password,m3u_url,customer_group)
 VALUES('${c}','${r}','Synthetic <customer>','customer@example.invalid','TV',1,current_date,current_date+30,'current+user','synthetic&password','https://stream.example.invalid/get.php?username=OLD&password=OLD&type=m3u_plus','test');
 UPDATE customer_email_settings SET enabled=true,last_batch_at=NULL;`);
});
test('all queue tables and service commands inaccessible to browser roles',()=>{
 for(const role of ['anon','authenticated']){
  for(const signature of ['customer_setup_email_data(uuid,uuid)','request_customer_setup_email(uuid,uuid,uuid,text)','collect_customer_setup_emails()','claim_customer_setup_emails()','finish_customer_setup_email(uuid,uuid,text,text)','authorize_customer_email_worker(text)','enqueue_customer_email_worker()']) assert.equal(sql(`SELECT has_function_privilege('${role}','${signature}','EXECUTE')`),'f');
  for(const table of ['customer_email_jobs','customer_email_settings']) assert.equal(sql(`SELECT has_table_privilege('${role}','${table}','SELECT')`),'f');
 }
 assert.throws(()=>data(b));assert.equal(data(a).customer_id,c);
});
test('canonical active lines and reseller reply address, no stale legacy credentials',()=>{
 sql(`UPDATE customers SET connection_list='[{"connection_number":1,"username":"actual","password":"actualpass","m3u_url":"https://stream.example.invalid/get.php","expiration_date":"2099-01-01","status":"active"},{"connection_number":2,"username":"expired","password":"no","expiration_date":"2000-01-01","status":"expired"}]'; INSERT INTO reseller_sales_pages VALUES('${r}','support@example.invalid')`);
 assert.equal(data().lines.length,1);assert.equal(data().lines[0].username,'actual');assert.equal(data().reply_to,'support@example.invalid');
});
test('only explicitly opted-in fully completed requests are collected; no historical backfill',()=>{
 for(const flag of [false,null]){intent(flag);sql('SELECT collect_customer_setup_emails()');assert.equal(sql('SELECT count(*) FROM customer_email_jobs'),'0');sql('DELETE FROM trex_provisioning_requests');}
 for(const state of ['processing','review_required','resolved']){intent(true,state);sql('SELECT collect_customer_setup_emails()');assert.equal(sql('SELECT count(*) FROM customer_email_jobs'),'0');sql('DELETE FROM trex_provisioning_requests');}
 intent();sql('SELECT collect_customer_setup_emails(); SELECT collect_customer_setup_emails()');assert.equal(sql('SELECT count(*) FROM customer_email_jobs'),'1');
});
test('old and deleted-customer intents are tombstoned rather than emailed or rescanned',()=>{
 intent(true,'completed',c,'25 hours');intent(true,'completed',other,'0 hours',other);sql('SELECT collect_customer_setup_emails()');assert.equal(sql("SELECT count(*) FROM customer_email_jobs WHERE status='cancelled'"),'2');assert.equal(sql('SELECT collect_customer_setup_emails()'),'0');
});
test('racing automatic collectors and manual requests produce one queued delivery',async()=>{
 intent();await Promise.all(Array.from({length:5},()=>concurrent('SELECT collect_customer_setup_emails()')));assert.equal(sql('SELECT count(*) FROM customer_email_jobs'),'1');sql(request(other));assert.equal(sql("SELECT count(*) FROM customer_email_jobs WHERE status='queued'"),'1');
});
test('racing manual sends serialize and reuse one request; stale previews cannot queue',async()=>{
 const version=data().version;await Promise.all(Array.from({length:5},()=>concurrent(request(id,r,version))));assert.equal(sql('SELECT count(*) FROM customer_email_jobs'),'1');
 assert.throws(()=>sql(request(id,b,version)));sql('DELETE FROM customer_email_jobs');sql("UPDATE customers SET password='changed'");assert.throws(()=>sql(request(id,r,version)));
});
test('snapshot recipient or credentials changes fail before SMTP; credits and accounts unchanged',async()=>{
 for(const field of ['email','password']){
  sql('DELETE FROM customer_email_jobs; UPDATE customer_email_settings SET last_batch_at=NULL');sql(request());sql(`UPDATE customers SET ${field}='changed@example.invalid'`);
  const mail=fakeMail();const response=await handler.createEmailHandler(adapter(),async()=>r,mail)(work());assert.equal(response.status,200);assert.equal(mail.messages.length,0);assert.equal(sql('SELECT status FROM customer_email_jobs'),'failed');
 }
 assert.equal(sql(`SELECT credits FROM profiles WHERE id='${r}'`),'100');assert.equal(sql('SELECT count(*) FROM customers'),'1');assert.equal(sql('SELECT count(*) FROM credit_logs'),'0');
});
test('manual request cooldown, disabled switch and partial provisioning block sends',()=>{
 sql('UPDATE customer_email_settings SET enabled=false');assert.throws(()=>sql(request()));sql('UPDATE customer_email_settings SET enabled=true');sql(request());sql("UPDATE customer_email_jobs SET status='failed'");assert.throws(()=>sql(request(other)));
 intent(true,'review_required');assert.throws(()=>data());
});
test('worker claims once, limits throughput, and never retries interrupted sends',()=>{
 sql(request());assert.equal(sql('SELECT count(*) FROM claim_customer_setup_emails()'),'1');assert.equal(sql('SELECT count(*) FROM claim_customer_setup_emails()'),'0');
 sql("UPDATE customer_email_jobs SET started_at=now()-interval '6 minutes'; UPDATE customer_email_settings SET last_batch_at=NULL");assert.equal(sql('SELECT count(*) FROM claim_customer_setup_emails()'),'0');assert.equal(sql('SELECT status FROM customer_email_jobs'),'uncertain');
});
test('idle/disabled scheduler invokes no Edge Function; token validation is fail-closed',()=>{
 sql('SELECT enqueue_customer_email_worker()');assert.equal(sql('SELECT count(*) FROM net.calls'),'0');assert.equal(sql("SELECT authorize_customer_email_worker('forged')"),'f');sql(request());sql('UPDATE customer_email_settings SET enabled=false; SELECT enqueue_customer_email_worker()');assert.equal(sql('SELECT count(*) FROM net.calls'),'0');sql('UPDATE customer_email_settings SET enabled=true; SELECT enqueue_customer_email_worker()');assert.equal(sql('SELECT count(*) FROM net.calls'),'1');
});
test('HTML escaping, current URL passwords and header injection protection',()=>{
 const d=data();const m=message.setupMessage(d);assert.match(m.html,/&lt;customer&gt;/);assert.ok(!m.html.includes('<customer>'));assert.ok(!m.text.includes('password=OLD'));assert.match(m.text,/username=current%2Buser/);assert.equal(m.from.address,'noreply@eztvclub.com');
 for(const field of ['recipient','reply_to'])assert.throws(()=>message.setupMessage({...d,[field]:'x@example.invalid\r\nBcc: evil@example.invalid'}));
 assert.throws(()=>message.setupMessage({...d,lines:[{...d.lines[0],m3u_url:'file:///etc/passwd'}]}));
});
function adapter(){return {
 async rpc(name,args={}){try{const expression=`${name}(${Object.entries(args).map(([k,v])=>`${k}=>${q(v)}`).join(',')})`;const out=sql(name==='claim_customer_setup_emails'?`SELECT coalesce(jsonb_agg(j),'[]') FROM ${expression} j`:`SELECT to_jsonb(${expression})`);return {data:out?JSON.parse(out):null,error:null};}catch{return {data:null,error:{message:'DB rejected'}};}},
 from(table){const conditions=[];let fields='*',limit=10,order='';const query={select(s){fields=s;return this},eq(k,v){conditions.push(`${k}=${q(v)}`);return this},order(k){order=` ORDER BY ${k} DESC`;return this},limit(n){limit=n;return this},async single(){return {data:JSON.parse(sql(`SELECT row_to_json(t) FROM (SELECT ${fields} FROM ${table} WHERE ${conditions.join(' AND ')}) t`)),error:null}},then(done){return Promise.resolve({data:JSON.parse(sql(`SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT ${fields} FROM ${table} WHERE ${conditions.join(' AND ')} ${order} LIMIT ${limit}) t`)),error:null}).then(done)}};return query;}
};}
const token=()=>sql("SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='customer_setup_email_worker'");
const work=(action='work',t=token())=>new Request('https://example.invalid',{method:'POST',headers:{'X-Customer-Email-Token':t},body:JSON.stringify({action})});
const userReq=body=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)});
function fakeMail(fail=false){const messages=[];return {configured:true,messages,verify:async()=>{},send:async m=>{messages.push(m);if(fail)throw new Error('provider-secret-should-not-leak');}};}
test('real handler and SQL deliver once through queue and safely repeat worker invocation',async()=>{
 intent();const mail=fakeMail();const h=handler.createEmailHandler(adapter(),async()=>r,mail);assert.equal((await h(work())).status,200);assert.equal((await h(work())).status,200);assert.equal(mail.messages.length,1);assert.equal(sql('SELECT status FROM customer_email_jobs'),'sent');assert.match(mail.messages[0].messageId,/@eztvclub.com>/);
});
test('SMTP error after attempted send is uncertain and cannot trigger automatic retry',async()=>{
 intent();const mail=fakeMail(true);const h=handler.createEmailHandler(adapter(),async()=>r,mail);const response=await h(work());assert.equal(response.status,200);assert.ok(!(await response.text()).includes('provider-secret'));sql('UPDATE customer_email_settings SET last_batch_at=NULL');await h(work());assert.equal(mail.messages.length,1);assert.equal(sql('SELECT status FROM customer_email_jobs'),'uncertain');
});
test('unauthenticated, forged worker, other reseller and user worker-action requests cannot send',async()=>{
 const mail=fakeMail();const h=handler.createEmailHandler(adapter(),async()=>b,mail);
 assert.equal((await h(new Request('https://example.invalid',{method:'POST',body:'{}'}))).status,401);assert.equal((await h(work('work','forged'))).status,401);assert.equal((await h(userReq({action:'preview',customerId:c}))).status,503);assert.equal((await h(userReq({action:'work'}))).status,400);assert.equal(mail.messages.length,0);
});
test('health verifies SMTP without sending and is limited to admin/worker',async()=>{
 let verified=0;const mail={...fakeMail(),verify:async()=>{verified++}};const reseller=handler.createEmailHandler(adapter(),async()=>r,mail);
 assert.equal((await reseller(userReq({action:'health'}))).status,403);assert.deepEqual(await(await reseller(work('health'))).json(),{configured:true,smtp_verified:true});const admin=handler.createEmailHandler(adapter(),async()=>a,mail);assert.equal((await admin(userReq({action:'health'}))).status,200);assert.equal(verified,2);assert.equal(mail.messages.length,0);
});
