import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { transform } from 'esbuild';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
const container = `eztv-business-${process.pid}`;
const admin='11111111-1111-4111-8111-111111111111', reseller='22222222-2222-4222-8222-222222222222', other='33333333-3333-4333-8333-333333333333', customer='44444444-4444-4444-8444-444444444444', id='55555555-5555-4555-8555-555555555555', second='66666666-6666-4666-8666-666666666666';
const q = x => x === null ? 'NULL' : `'${String(x).replaceAll("'", "''")}'`;
const sql = input => execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const as = (who, query) => `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${q(who)}; ${query}; COMMIT;`;
const run = (query, who=admin) => sql(as(who, query));
const report = () => JSON.parse(run('SELECT get_business_dashboard(current_date)'));
const entries = (kind, amount=10, credits=0, key=id, sale=null, ref='FIXTURE', who=admin) => run(`SELECT record_business_entry(${q(key)},${q(kind)},current_date,${amount},${credits},${q(reseller)},${q(ref)},'test',${q(sale)})`,who);
const renewals = who => JSON.parse(run('SELECT get_renewal_worklist()',who));
const concurrent = query => new Promise((resolve,reject) => { const p=spawn('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1']); let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));p.stdin.end(query); });
before(async()=>{
 execFileSync('docker',['run','-d','--name',container,'--network','none','--label','eztv.disposable-test=true','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{stdio:'pipe'});
 for(let i=0;i<60;i++){try{sql('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,200));}}
 sql(readFileSync('tests/stabilization-schema.sql','utf8'));
 const files=['20261002160000_trex_provisioning_guard.sql',...readdirSync('supabase/migrations').filter(x=>/_legacy_credit_security.sql$|_trex_paid_operations.sql$|_legacy_sso_expiry.sql$|_provider_reconciliation_checks.sql$|_business_dashboard.sql$/.test(x))];
 for(const file of files)sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
});
after(()=>execFileSync('docker',['rm','-f','-v',container],{stdio:'pipe'}));
beforeEach(()=>{
 sql(`TRUNCATE business_entries,provider_balance_checks,provider_reconciliation_checks,manual_credit_requests,credit_adjustments,trex_paid_operations,trex_provisioning_requests,credit_logs,credit_requests,renewal_transactions,customers,user_roles,profiles CASCADE;
 INSERT INTO profiles(id,name,email,role,credits) VALUES(${q(admin)},'Owner','a@example.invalid','admin',0),(${q(reseller)},'Reseller','r@example.invalid','reseller',20),(${q(other)},'Other','o@example.invalid','reseller',15);
 INSERT INTO user_roles(user_id,role) VALUES(${q(admin)},'admin'),(${q(reseller)},'reseller'),(${q(other)},'reseller');
 INSERT INTO customers(id,reseller_id,name,email,username,password,device_type,package_id,plan_duration,start_date,expiration_date,customer_group,connection_list)
 VALUES(${q(customer)},${q(reseller)},'Customer','c@example.invalid','fixture','secret','m3u','1',1,current_date,current_date+3,'group','[]');`);
});
test('anonymous cannot execute APIs, resellers cannot read or write owner finances',()=>{
 for(const name of ['get_business_dashboard(date)','get_renewal_worklist()','record_business_entry(uuid,text,date,numeric,integer,uuid,text,text,uuid)','record_provider_balance(uuid,numeric,timestamp with time zone,text)','void_business_entry(uuid,text)']) assert.equal(sql(`SELECT has_function_privilege('anon',${q(name)},'execute')`),'f');
 assert.throws(()=>run('SELECT get_business_dashboard(current_date)',reseller));
 assert.throws(()=>entries('expense',10,0,id,null,'FIXTURE',reseller));
 entries('expense');assert.equal(run('SELECT count(*) FROM business_entries',reseller),'0');
 assert.equal(sql("SELECT has_table_privilege('authenticated','business_entries','INSERT')"),'f');
 assert.throws(()=>run(`SELECT record_provider_balance(${q(id)},60,now(),'test')`,reseller));
});
test('verified approval captures sale atomically once without duplicate credits or revenue',()=>{
 run(`SELECT request_manual_credits(${q(id)},10,'PAYPAL-ONE')`,reseller);
 run(`SELECT review_manual_credits(${q(id)},true,'PAYPAL-ONE','')`);
 run(`SELECT review_manual_credits(${q(id)},true,'PAYPAL-ONE','')`);
 const data=report();assert.equal(data.summary.sales,30);assert.equal(data.summary.credits_sold,10);assert.equal(data.summary.missing_fees,1);
 assert.equal(sql(`SELECT credits FROM profiles WHERE id=${q(reseller)}`),'30');assert.equal(data.entries.length,1);
 assert.throws(()=>entries('sale',30,10,second,null,'paypal-one'));
 assert.throws(()=>run(`SELECT void_business_entry(${q(id)},'no evidence')`));
});
test('parallel retries record a transaction once and reject changed payloads',async()=>{
 const query=as(admin,`SELECT record_business_entry(${q(id)},'expense',current_date,10,0,${q(reseller)},'FIXTURE','test',NULL)`);
 await Promise.all(Array.from({length:4},()=>concurrent(query)));
 assert.equal(report().summary.expenses,10);assert.throws(()=>entries('expense',11));assert.equal(sql(`SELECT credits FROM profiles WHERE id=${q(reseller)}`),'20');
});
test('fees must be explicitly recorded, linked once, and may be zero',()=>{
 entries('sale',30,10);entries('payment_fee',0,0,second,id,'PAYPAL-FEE');assert.equal(report().summary.missing_fees,0);
 assert.throws(()=>entries('payment_fee',1,0,customer,id,'OTHER-FEE'));
 assert.throws(()=>entries('payment_fee',1,0,customer,null,'UNLINKED'));
});
test('refunds cannot exceed the sale even with concurrent attempts',async()=>{
 entries('sale',30,10);
 const results=await Promise.allSettled([second,customer].map(key=>concurrent(as(admin,`SELECT record_business_entry(${q(key)},'refund',current_date,20,0,${q(reseller)},${q(key)},'test',${q(id)})`))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(report().summary.refunds,20);
});
test('purchase cash and estimated fulfillment remain separate; actual purchase establishes planning cost',()=>{
 entries('provider_purchase',120,60);entries('sale',30,10,second,null,'SALE');
 const data=report();assert.equal(data.summary.provider_purchases,120);assert.equal(data.summary.fulfillment_estimate,20);assert.equal(data.unit_cost,2);assert.equal(data.planning_batch_cost,120);
});
test('legacy credit adjustments never become assumed cash revenue',()=>{
 sql(`INSERT INTO credit_logs(reseller_id,action,credits_used,revenue_amount) VALUES(${q(reseller)},'addition',100,0),(${q(reseller)},'addition',10,30)`);
 const data=report();assert.equal(data.summary.sales,0);assert.equal(data.legacy_unpriced_additions,1);
});
test('void keeps audit evidence, excludes totals, and does not change credits',()=>{
 entries('expense',10);run(`SELECT void_business_entry(${q(id)},'Correction required')`);const data=report();assert.equal(data.summary.expenses,0);assert.equal(data.entries.length,1);assert.equal(data.entries[0].void_reason,'Correction required');
});
test('unknown provider balance stays unknown; recorded balance is fresh until activity',()=>{
 assert.equal(report().provider_balance,null);assert.equal(report().outstanding_credits,35);
 run(`SELECT record_provider_balance(${q(id)},60,now(),'checked in Trex')`);assert.equal(report().balance_needs_check,false);
 sql(`SELECT claim_trex_paid_operation(${q(customer)},${q(reseller)},false,'renew',1,NULL)`);
 assert.equal(report().balance_needs_check,true);assert.equal(report().held_credits,1);assert.equal(report().outstanding_credits,34);
});
test('stale and future balance timestamps cannot look current',()=>{
 run(`SELECT record_provider_balance(${q(id)},60,now()-interval '2 days','old check')`);assert.equal(report().balance_needs_check,true);
 assert.throws(()=>run(`SELECT record_provider_balance(${q(second)},60,now()+interval '1 hour','future')`));
});
test('renewal worklist enforces ownership and never returns provider credentials',()=>{
 assert.equal(renewals(reseller).length,1);assert.equal(renewals(other).length,0);
 const row=renewals(admin)[0];assert.equal(row.connections,1);assert.equal(row.days_until,3);
 const payload=JSON.stringify(row);assert.ok(!payload.includes('secret'));assert.ok(!payload.includes('fixture'));assert.ok(!payload.includes('password'));
});
test('grouped multi-connection quotes match guarded renewal and distinct expiry dates',()=>{
 sql(`UPDATE customers SET connection_list='[{"connection_number":2,"username":"second","password":"pass","expiration_date":"2099-01-01"}]' WHERE id=${q(customer)}`);
 const row=renewals(reseller)[0];assert.equal(row.connections,2);assert.equal(row.last_expiry,'2099-01-01');
 assert.equal(Number(run(`SELECT credits_required FROM calculate_renewal_credits_required(${q(customer)},1)`,reseller)),row.connections);
});
test('ambiguous and unverified provider records withhold quotes',()=>{
 sql(`INSERT INTO provider_reconciliation_checks(customer_id,connection_number,outcome) VALUES(${q(customer)},1,'unverified')`);
 assert.equal(renewals(reseller)[0].connections,null);
 sql(`DELETE FROM provider_reconciliation_checks; UPDATE customers SET connection_list='[{"connection_number":1,"username":"second","password":"pass"}]' WHERE id=${q(customer)}`);
 assert.equal(renewals(reseller)[0].connections,null);
});
test('trial, deactivated and cancelled subscriptions are excluded',()=>{
 for(const field of ["is_trial=true","is_trial=false,is_deactivated=true","is_deactivated=false,status='cancelled'"]){sql(`UPDATE customers SET ${field}`);assert.equal(renewals(reseller).length,0);}
});
test('historical pending renewal holds and recently completed operations are visible',()=>{
 sql(`INSERT INTO renewal_transactions(customer_id,reseller_id,plan_duration,credits_required,transaction_key) VALUES(${q(customer)},${q(reseller)},1,1,'historical')`);
 assert.equal(renewals(reseller)[0].review_reason,'An earlier renewal needs review');
});

test('cash flow and contribution do not deduct provider purchases twice',async()=>{
 const transformed=await transform(readFileSync('src/lib/business.ts','utf8'),{loader:'ts',format:'esm'});
 const {businessTotals,providerCoverage}=await import('data:text/javascript;base64,'+Buffer.from(transformed.code).toString('base64'));
 const data={summary:{sales:180,fees:6,refunds:0,expenses:10,provider_purchases:100,fulfillment_estimate:100,loss_estimate:0,owner_time:20},provider_balance:null,outstanding_credits:46,planning_batch_credits:60,planning_batch_cost:100};
 assert.deepEqual(businessTotals(data),{netCash:64,contribution:74,operatingEstimate:44});
 assert.equal(providerCoverage(data).restockCash,null);
 data.provider_balance={credits:30};assert.deepEqual(providerCoverage(data),{uncovered:16,batches:1,restockCash:100});
});
test('balance can be checked after a purchase on the same day',()=>{
 entries('provider_purchase',100,60);run(`SELECT record_provider_balance(${q(second)},60,now(),'checked after purchase')`);assert.equal(report().balance_needs_check,false);
});
test('inactive group member does not hide an active group or yield a purchase quote',()=>{
 sql(`UPDATE customers SET is_deactivated=true; INSERT INTO customers(id,reseller_id,name,email,username,password,device_type,plan_duration,start_date,expiration_date,customer_group) VALUES(${q(second)},${q(reseller)},'Active member','fixture@example.invalid','second','secret','m3u',1,current_date,current_date+4,'group')`);
 const list=renewals(reseller);assert.equal(list.length,1);assert.equal(list[0].connections,null);assert.ok(list[0].review_reason);
});
