import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
const container=`eztv-paypal-test-${process.pid}`;
const a='11111111-1111-4111-8111-111111111111',r='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444',mid='55555555-5555-4555-8555-555555555555';
const q=x=>`'${String(x).replaceAll("'","''")}'`;
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const as=(uid,s)=>`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub=${q(uid)}; ${s}; COMMIT;`;
const concurrent=s=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',c=>c?reject(new Error(err)):resolve(out.trim()));p.stdin.end(s);});
const prepare=()=>sql(`SELECT prepare_paypal_credit_order('${id}','${r}',10,'sandbox'); UPDATE paypal_credit_orders SET paypal_order_id='ORDER12345' WHERE id='${id}'`);
const grant=(event='WH-CAPTURE')=>`SELECT fulfill_paypal_credit_order('${id}','sandbox','ORDER12345','CAPTURE12345',3000,149,'${event}')`;
const balance=()=>sql(`SELECT credits FROM profiles WHERE id='${r}'`);
let core, handler;
before(async()=>{
 execFileSync('docker',['run','-d','--name',container,'--network','none','--label','eztv.disposable-test=true','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{stdio:'pipe'});
 for(let i=0;i<60;i++){try{sql('SELECT 1');break;}catch{await new Promise(r=>setTimeout(r,200));}}
 sql(readFileSync('tests/stabilization-schema.sql','utf8'));
 for(const suffix of ['trex_provisioning_guard.sql','legacy_credit_security.sql','business_dashboard.sql','paypal_automatic_credits.sql','individual_reseller_pricing.sql','reseller_credit_minimums.sql']) {
  const file=readdirSync('supabase/migrations').find(f=>f.endsWith(suffix));sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
 }
 for(const [name,set] of [['paypal',v=>core=v],['handler',v=>handler=v]]){
  const result=await build({entryPoints:[`supabase/functions/_shared/paypal-credits/${name}.ts`],bundle:true,write:false,format:'esm',platform:'node'});
  set(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')));
 }
});
after(()=>execFileSync('docker',['rm','-f','-v',container],{stdio:'pipe'}));
beforeEach(()=>{
 sql(`TRUNCATE paypal_credit_events,paypal_credit_receipts,paypal_credit_orders,manual_credit_requests,credit_logs,business_entries,user_roles,profiles CASCADE;
 INSERT INTO profiles(id,name,email,role,credits) VALUES('${a}','Admin','admin@example.invalid','admin',100),('${r}','Reseller','r@example.invalid','reseller',100),('${b}','Other','b@example.invalid','reseller',100);
 INSERT INTO user_roles(user_id,role) VALUES('${a}','admin'),('${r}','reseller'),('${b}','reseller');
 UPDATE paypal_credit_settings SET enabled=true,environment='sandbox';`);
});
test('service-only commands and settings; own-order reads only',()=>{
 prepare();
 for(const signature of ['prepare_paypal_credit_order(uuid,uuid,integer,text)','fulfill_paypal_credit_order(uuid,text,text,text,integer,integer,text)','review_paypal_credit_event(text,text,text,text)']) for(const role of ['anon','authenticated']) assert.equal(sql(`SELECT has_function_privilege('${role}','${signature}','EXECUTE')`),'f');
 assert.equal(sql(as(r,'SELECT count(*) FROM paypal_credit_orders')),'1');assert.equal(sql(as(b,'SELECT count(*) FROM paypal_credit_orders')),'0');
 assert.throws(()=>sql(as(r,"UPDATE paypal_credit_orders SET status='credited'")));
 assert.throws(()=>sql(as(a,'UPDATE paypal_credit_settings SET enabled=true')));
});
test('server pricing, entitlement, environment and kill switch',()=>{
 for(const query of [`SELECT prepare_paypal_credit_order('${id}','${r}',11,'sandbox')`,`SELECT prepare_paypal_credit_order('${id}','${r}',10,'live')`]) assert.throws(()=>sql(query));
 sql(`UPDATE profiles SET credit_purchase_enabled=false WHERE id='${r}'`);assert.throws(prepare);
 sql(`UPDATE profiles SET credit_purchase_enabled=true; UPDATE paypal_credit_settings SET enabled=false`);assert.throws(prepare);assert.equal(balance(),'100');
});
test('request retries retain identity and reject changed actor or quantity',()=>{
 prepare();prepare();assert.equal(sql('SELECT count(*) FROM paypal_credit_orders'),'1');
 for(const [actor,credits] of [[b,10],[r,20]]) assert.throws(()=>sql(`SELECT prepare_paypal_credit_order('${id}','${actor}',${credits},'sandbox')`));
});
test('racing captures/webhooks grant once with sale and fee',async()=>{
 prepare();await Promise.all(Array.from({length:6},(_,i)=>concurrent(grant('WH-'+i))));
 assert.equal(balance(),'110');assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');assert.equal(sql("SELECT count(*) FROM business_entries WHERE kind='sale'"),'1');
 assert.equal(sql("SELECT amount FROM business_entries WHERE kind='payment_fee'"),'1.49');
});
test('database failure rolls back order, receipt, event, balance and finance; replay recovers',()=>{
 prepare();sql('ALTER TABLE credit_logs ADD CONSTRAINT paypal_failure CHECK(credits_used<>10)');
 try{assert.throws(()=>sql(grant()));assert.equal(balance(),'100');assert.equal(sql('SELECT count(*) FROM paypal_credit_receipts'),'0');assert.equal(sql('SELECT count(*) FROM paypal_credit_events'),'0');assert.equal(sql('SELECT status FROM paypal_credit_orders'),'created');}
 finally{sql('ALTER TABLE credit_logs DROP CONSTRAINT paypal_failure');}
 assert.equal(sql(grant()),'credited');assert.equal(balance(),'110');
});
test('wrong environment, capture or amount cannot change credits',()=>{
 prepare();assert.throws(()=>sql(grant().replace("'sandbox'","'live'")));assert.throws(()=>sql(grant().replace('3000','2999')));sql(grant());assert.throws(()=>sql(grant().replace('CAPTURE12345','CAPTURE67890')));assert.equal(balance(),'110');
});
function manual(){sql(as(r,`SELECT request_manual_credits('${mid}',10,'submitted-reference')`));}
function approve(){return sql(as(a,`SELECT review_manual_credits('${mid}',true,'CAPTURE12345','Verified')`));}
test('manual approval first prevents an automatic second grant',()=>{
 manual();approve();prepare();assert.equal(sql(grant()),'review_required');assert.equal(balance(),'110');assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');
});
test('automatic grant first rolls back manual approval completely',()=>{
 prepare();sql(grant());manual();assert.throws(approve);assert.equal(balance(),'110');assert.equal(sql('SELECT status FROM manual_credit_requests'),'pending');
});
test('refund before capture blocks grant; review event replays deduplicate',()=>{
 prepare();const review=`SELECT review_paypal_credit_event('WH-REFUND','PAYMENT.CAPTURE.REFUNDED','CAPTURE12345','ORDER12345')`;
 assert.equal(sql(review),'review_required');assert.equal(sql(review),'duplicate');assert.equal(sql(grant()),'review_required');assert.equal(balance(),'100');
});
test('refund after grant preserves history and blocks later duplicate capture',()=>{
 prepare();sql(grant());sql("SELECT review_paypal_credit_event('WH-REFUND','PAYMENT.CAPTURE.REFUNDED','CAPTURE12345',NULL)");sql(grant());assert.equal(balance(),'110');assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');assert.equal(sql('SELECT status FROM paypal_credit_orders'),'review_required');
});
test('orphan event fails for retry instead of being acknowledged as processed',()=>{
 assert.throws(()=>sql("SELECT review_paypal_credit_event('WH-REFUND','PAYMENT.CAPTURE.REFUNDED','CAPTURE12345',NULL)"));assert.equal(sql('SELECT count(*) FROM paypal_credit_events'),'0');
});
const order={id,reseller_id:r,environment:'sandbox',credits:10,amount_cents:3000,paypal_order_id:'ORDER12345',status:'created'};
const payload=()=>({id:'ORDER12345',status:'COMPLETED',purchase_units:[{custom_id:id,payee:{merchant_id:'MERCHANT1'},amount:{currency_code:'USD',value:'30.00'},payments:{captures:[{id:'CAPTURE12345',status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:'30.00'},seller_receivable_breakdown:{paypal_fee:{currency_code:'USD',value:'1.49'}}}]}}]});
test('provider receipt validates merchant, local order, amount, currency and final capture',()=>{
 assert.deepEqual(core.receipt(payload(),order,'MERCHANT1'),{captureId:'CAPTURE12345',feeCents:149});
 const mutations=[p=>p.purchase_units[0].payee.merchant_id='OTHER',p=>p.purchase_units[0].custom_id=mid,p=>p.purchase_units[0].amount.value='0.30',p=>p.purchase_units[0].amount.currency_code='EUR',p=>p.purchase_units[0].payments.captures[0].final_capture=false];
 for(const mutate of mutations){const p=payload();mutate(p);assert.throws(()=>core.receipt(p,order,'MERCHANT1'));}
 const pending=payload();pending.purchase_units[0].payments.captures[0].status='PENDING';assert.equal(core.receipt(pending,order,'MERCHANT1'),null);
});
test('strict money parsing and safe checkout URLs',()=>{
 for(const value of ['30','30.001','1e3','-3.00','3.00oops',null]) assert.throws(()=>core.cents(value));
 assert.equal(core.cents('30.00'),3000);
 for(const url of ['https://evil.invalid','http://www.paypal.com','https://www.paypal.com.evil.invalid','https://www.paypal.com@evil.invalid']) assert.throws(()=>core.approveUrl(url,'live'));
});
test('PayPal calls reuse stable create/capture keys and preserve raw webhook content',async()=>{
 const requests=[];const fake=async(url,opts)=>{requests.push([url,opts]);return Response.json(url.endsWith('/token')?{access_token:'synthetic'}:url.includes('verify-webhook')?{verification_status:'SUCCESS'}:{id:'ORDER12345',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER12345'}]});};
 const p=core.createPayPal({environment:'sandbox',clientId:'test',secret:'test',webhookId:'test',merchantId:'MERCHANT1',appUrl:'https://example.invalid'},fake);
 await p.create(order);await p.create(order);await p.capture(order);await p.capture(order);
 const api=requests.filter(([u])=>!u.endsWith('/token'));assert.equal(api[0][1].headers['PayPal-Request-Id'],api[1][1].headers['PayPal-Request-Id']);assert.equal(api[2][1].headers['PayPal-Request-Id'],api[3][1].headers['PayPal-Request-Id']);
 const raw='{ "id": "WH-123", "event_type": "SYNTHETIC" }';
 const headers=new Headers({'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api-m.sandbox.paypal.com/v1/notifications/certs/test','paypal-transmission-id':'test','paypal-transmission-sig':'test','paypal-transmission-time':'test'});
 await p.verify(raw,headers);assert.ok(requests.at(-1)[1].body.includes(raw));
 await assert.rejects(()=>p.verify(raw,new Headers()));
});
test('API rejects unauthenticated callers and disabled webhook does not acknowledge events',async()=>{
 const h=handler.createHandler({},async()=>null,()=>undefined);
 assert.equal((await h(new Request('https://example.invalid',{method:'POST',body:'{}'}))).status,401);
 const hook=handler.createHandler({},async()=>null,()=>undefined,true);
 assert.equal((await hook(new Request('https://example.invalid',{method:'POST',body:'{}'}))).status,503);
});
test('only admin resolves review; late capture can never grant after resolution',()=>{
 prepare();sql("SELECT review_paypal_credit_event('WH-REFUND','PAYMENT.CAPTURE.REFUNDED','CAPTURE12345','ORDER12345')");
 const resolve=`SELECT resolve_paypal_credit_review('${id}','Refund confirmed and no credits issued')`;
 assert.throws(()=>sql(as(r,resolve)));assert.equal(sql(as(a,resolve)),'reviewed');assert.equal(sql(grant()),'reviewed');assert.equal(balance(),'100');
 assert.equal(sql(`SELECT reviewed_by FROM paypal_credit_orders WHERE id='${id}'`),a);
});
const runtimeConfig={EZTV_PAYPAL_APP_URL:'https://sandbox.example.invalid',EZTV_PAYPAL_ENV:'sandbox',EZTV_PAYPAL_CLIENT_ID:'synthetic',EZTV_PAYPAL_CLIENT_SECRET:'synthetic',EZTV_PAYPAL_WEBHOOK_ID:'synthetic',EZTV_PAYPAL_MERCHANT_ID:'MERCHANT1',EZTV_PAYPAL_ENABLED:'true'};
function databaseAdapter(failRpc=false){return {
 from(table){assert.equal(table,'paypal_credit_orders');const conditions=[];return {select(){return this},eq(k,v){conditions.push(`${k}=${q(v)}`);return this},async maybeSingle(){const data=sql(`SELECT row_to_json(o) FROM paypal_credit_orders o WHERE ${conditions.join(' AND ')}`);return {data:data?JSON.parse(data):null,error:null}}};},
 async rpc(name,args){if(failRpc)return {data:null,error:{message:'synthetic DB outage'}};try{return {data:sql(`SELECT ${name}(${Object.entries(args).map(([k,v])=>`${k} => ${v===null?'NULL':typeof v==='number'?v:q(v)}`).join(',')})`),error:null};}catch{return {data:null,error:{message:'database failure'}};}}
};}
async function fakePaypal(fn){const original=globalThis.fetch;globalThis.fetch=async(url)=>Response.json(url.endsWith('/token')?{access_token:'synthetic'}:url.includes('verify-webhook-signature')?{verification_status:'SUCCESS'}:payload());try{await fn();}finally{globalThis.fetch=original;}}
const signedHeaders={'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api.sandbox.paypal.com/v1/notifications/certs/test','paypal-transmission-id':'test','paypal-transmission-sig':'test','paypal-transmission-time':'test'};
test('real capture handler enforces order ownership and fulfills through actual SQL',async()=>{
 prepare();await fakePaypal(async()=>{
 const make=(actor)=>handler.createHandler(databaseAdapter(),async()=>actor,key=>runtimeConfig[key]);
 const request=()=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action:'capture',paypalOrderId:'ORDER12345'})});
 assert.equal((await make(b)(request())).status,404);assert.equal(balance(),'100');
 const success=await make(r)(request());assert.equal(success.status,200);assert.equal((await success.json()).status,'credited');assert.equal(balance(),'110');
 });
});
test('webhook database failure returns retryable status; replay really grants once',async()=>{
 prepare();await fakePaypal(async()=>{
 const request=()=>new Request('https://example.invalid',{method:'POST',headers:signedHeaders,body:JSON.stringify({id:'WH-REAL-HANDLER',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'CAPTURE12345',supplementary_data:{related_ids:{order_id:'ORDER12345'}}}})});
 const make=(fail)=>handler.createHandler(databaseAdapter(fail),async()=>null,key=>runtimeConfig[key],true);
 assert.equal((await make(true)(request())).status,503);assert.equal(balance(),'100');assert.equal(sql('SELECT count(*) FROM paypal_credit_events'),'0');
 assert.equal((await make(false)(request())).status,200);assert.equal((await make(false)(request())).status,200);assert.equal(balance(),'110');assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');
 });
});

const setPrice=(who,price)=>sql(as(a,`SELECT set_reseller_credit_price('${who}',${price===null?'NULL':price})`));
const priced=(rate,actor=r,key=id)=>sql(`SELECT (prepare_paypal_credit_order_priced('${key}','${actor}',10,'sandbox',${rate})).amount_cents`);
test('individual prices are private, admin-controlled, audited, and resettable',()=>{
 setPrice(r,225);setPrice(b,175);
 assert.equal(JSON.parse(sql(as(r,'SELECT get_my_credit_pricing()'))).unit_price_cents,225);
 assert.equal(JSON.parse(sql(as(b,'SELECT get_my_credit_pricing()'))).unit_price_cents,175);
 assert.equal(sql(as(r,'SELECT count(*) FROM reseller_credit_pricing')),'1');
 assert.equal(sql(as(r,'SELECT count(*) FROM reseller_credit_price_history')),'0');
 assert.throws(()=>sql(as(r,`SELECT set_reseller_credit_price('${r}',1)`)));
 assert.throws(()=>sql(as(r,`UPDATE reseller_credit_pricing SET unit_price_cents=1`)));
 assert.throws(()=>sql("SET ROLE anon; SELECT get_my_credit_pricing()"));
 for(const price of [0,-1,42949673]) assert.throws(()=>setPrice(r,price));
 setPrice(r,null);assert.equal(JSON.parse(sql(as(r,'SELECT get_my_credit_pricing()'))).unit_price_cents,300);
 assert.equal(sql('SELECT count(*) FROM reseller_credit_price_history'),'3');
});
test('new purchases snapshot custom rates; stale and legacy quotes cannot underpay',()=>{
 setPrice(r,225);setPrice(b,175);assert.equal(priced(225),'2250');
 assert.equal(priced(175,b,mid),'1750');
});
test('rate edits preserve existing order price, credits and financial records on capture',()=>{
 setPrice(r,225);priced(225);setPrice(r,175);
 assert.equal(priced(225),'2250');
 assert.throws(()=>priced(175));
 assert.throws(()=>priced(225,r,mid));assert.throws(prepare);
 sql(`UPDATE paypal_credit_orders SET paypal_order_id='ORDER12345' WHERE id='${id}'`);
 assert.equal(sql(grant().replace('3000','2250')),'credited');assert.equal(balance(),'110');
 assert.equal(sql("SELECT amount FROM business_entries WHERE kind='sale'"),'22.50');
 assert.equal(sql('SELECT revenue_amount FROM credit_logs'),'22.50');
 assert.equal(sql(grant().replace('3000','2250')),'credited');assert.equal(balance(),'110');
});
test('manual requests use the same custom rate and preserve approved revenue after a rate edit',()=>{
 setPrice(r,225);
 assert.throws(manual);
 sql(as(r,`SELECT request_manual_credits_priced('${mid}',10,'submitted-reference',225)`));
 assert.equal(sql('SELECT unit_price FROM manual_credit_requests'),'2.25');
 setPrice(r,175);approve();assert.equal(balance(),'110');
 assert.equal(sql('SELECT revenue_amount FROM credit_logs'),'22.50');
});
test('stale quotes create no orders; concurrent price edit and purchase stay consistent',async()=>{
 setPrice(r,225);assert.throws(()=>priced(300));assert.equal(sql('SELECT count(*) FROM paypal_credit_orders'),'0');
 const change=concurrent(as(a,`SELECT set_reseller_credit_price('${r}',175)`));
 const purchase=concurrent(`SELECT (prepare_paypal_credit_order_priced('${id}','${r}',10,'sandbox',225)).amount_cents`);
 const results=await Promise.allSettled([change,purchase]);assert.equal(results[0].status,'fulfilled');
 if(results[1].status==='fulfilled') assert.equal(results[1].value,'2250');
 else assert.equal(sql('SELECT count(*) FROM paypal_credit_orders'),'0');
});
test('real create handler sends only authenticated reseller and server snapshot to PayPal',async()=>{
 const original=globalThis.fetch, calls=[];let args;
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return Response.json(url.endsWith('/token')?{access_token:'synthetic'}:{id:'ORDER12345',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER12345'}]});};
 try{
  const db={rpc:async(name,input)=>{assert.equal(name,'prepare_paypal_credit_order_priced');args=input;return {data:{...order,paypal_order_id:null,amount_cents:2250,unit_price_cents:225},error:null}},from:()=>({update(){return this},eq(){return this},or(){return this},select:async()=>({data:[{id,paypal_order_id:'ORDER12345'}],error:null})})};
  const h=handler.createHandler(db,async()=>r,key=>runtimeConfig[key]);
  const response=await h(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action:'create',requestId:id,credits:10,expectedUnitPriceCents:225,amountCents:1,resellerId:b})}));
  assert.equal(response.status,200);assert.equal(args.p_actor,r);assert.equal(args.p_expected_unit_price_cents,225);
  assert.equal(JSON.parse(calls.find(([url])=>url.endsWith('/v2/checkout/orders'))[1].body).purchase_units[0].amount.value,'22.50');
 }finally{globalThis.fetch=original;}
});
test('stale price handler returns a reviewable conflict without calling PayPal',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected PayPal call');};
 try{
  const h=handler.createHandler({rpc:async()=>({data:null,error:{message:'price_changed'}})},async()=>r,key=>runtimeConfig[key]);
  const response=await h(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action:'create',requestId:id,credits:10,expectedUnitPriceCents:225})}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,'price_changed');assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});

// Reproduce the live PostgREST update/representation query: logical filters are
// applied again to pgrst_source, so filter columns must be in RETURNING.
function linkQuery(fields,localId,providerId){
 assert.match(fields,/^[a-z_,]+$/);
 return `WITH pgrst_source AS (
  UPDATE paypal_credit_orders SET paypal_order_id=${q(providerId)}
  WHERE id=${q(localId)} AND (paypal_order_id IS NULL OR paypal_order_id=${q(providerId)})
  RETURNING ${fields}
 ) SELECT coalesce(jsonb_agg(t),'[]') FROM (
  SELECT ${fields} FROM pgrst_source AS paypal_credit_orders
  WHERE paypal_order_id IS NULL OR paypal_order_id=${q(providerId)}
 ) t`;
}
function checkoutAdapter(){return {
 async rpc(name,args){try{return {data:JSON.parse(sql(`SELECT to_jsonb(${name}(${Object.entries(args).map(([k,v])=>`${k}=>${q(v)}`).join(',')}))`)),error:null};}catch{return {data:null,error:{message:'DB rejected'}};}},
 from(table){assert.equal(table,'paypal_credit_orders');let update,localId;return {
  update(v){update=v;return this},eq(key,value){assert.equal(key,'id');localId=value;return this},
  or(filter){assert.equal(filter,`paypal_order_id.is.null,paypal_order_id.eq.${update.paypal_order_id}`);return this},
  async select(fields){try{return {data:JSON.parse(sql(linkQuery(fields,localId,update.paypal_order_id))),error:null};}catch{return {data:null,error:{message:'database query failed'}};}}
 };
 }
};}
test('PostgREST checkout query reproduces the old missing-column failure without storing a link',()=>{
 sql(`SELECT prepare_paypal_credit_order('${id}','${r}',10,'sandbox')`);
 assert.throws(()=>sql(linkQuery('id',id,'ORDER12345')),/paypal_order_id/);
 assert.equal(sql('SELECT coalesce(paypal_order_id,\'unlinked\') FROM paypal_credit_orders'),'unlinked');
});
test('real checkout handler persists its PayPal link through the PostgREST-shaped query before redirecting',async()=>{
 const original=globalThis.fetch;let creates=0;
 globalThis.fetch=async(url)=>{
  if(url.endsWith('/token'))return Response.json({access_token:'synthetic'});
  assert.ok(url.endsWith('/v2/checkout/orders'));creates++;
  return Response.json({id:'ORDER12345',status:'CREATED',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER12345'}]});
 };
 try{
  const h=handler.createHandler(checkoutAdapter(),async()=>r,key=>runtimeConfig[key]);
  const response=await h(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action:'create',requestId:id,credits:10,expectedUnitPriceCents:300})}));
  assert.equal(response.status,200);assert.match((await response.json()).approve_url,/ORDER12345/);assert.equal(sql('SELECT paypal_order_id FROM paypal_credit_orders'),'ORDER12345');assert.equal(creates,1);assert.equal(balance(),'100');assert.equal(sql('SELECT count(*) FROM credit_logs'),'0');
 }finally{globalThis.fetch=original;}
});
test('a competing different PayPal link is preserved and cannot return an approval URL',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  if(url.endsWith('/token'))return Response.json({access_token:'synthetic'});
  assert.ok(url.endsWith('/v2/checkout/orders'));
  sql(`UPDATE paypal_credit_orders SET paypal_order_id='OTHER12345' WHERE id='${id}'`);
  return Response.json({id:'ORDER12345',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER12345'}]});
 };
 try{
  const h=handler.createHandler(checkoutAdapter(),async()=>r,key=>runtimeConfig[key]);
  const response=await h(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action:'create',requestId:id,credits:10,expectedUnitPriceCents:300})}));
  assert.equal(response.status,503);assert.equal((await response.json()).error,'order_storage_unconfirmed');assert.equal(sql('SELECT paypal_order_id FROM paypal_credit_orders'),'OTHER12345');assert.equal(balance(),'100');
 }finally{globalThis.fetch=original;}
});

test('new automatic and manual purchases reject 5 credits and accept 10 at the saved reseller price',()=>{
 setPrice(r,225);
 assert.throws(()=>sql(`SELECT prepare_paypal_credit_order_priced('${id}','${r}',5,'sandbox',225)`));
 assert.throws(()=>sql(as(r,`SELECT request_manual_credits_priced('${mid}',5,'minimum-fixture',225)`)));
 assert.throws(()=>sql(`SELECT prepare_paypal_credit_order('${id}','${r}',5,'sandbox')`));
 assert.throws(()=>sql(as(r,`SELECT request_manual_credits('${mid}',5,'minimum-fixture')`)));
 assert.equal(sql('SELECT count(*) FROM paypal_credit_orders'),'0');assert.equal(sql('SELECT count(*) FROM manual_credit_requests'),'0');
 assert.equal(priced(225),'2250');
 sql(as(r,`SELECT request_manual_credits_priced('${mid}',10,'minimum-fixture',225)`));
 assert.equal(sql('SELECT credits FROM manual_credit_requests'),'10');assert.equal(balance(),'100');
});
test('an existing five-credit payment can still settle once without rewriting its price',()=>{
 sql(`INSERT INTO paypal_credit_orders(id,reseller_id,credits,amount_cents,environment,paypal_order_id) VALUES('${id}','${r}',5,1500,'sandbox','ORDER12345')`);
 const settle=grant().replace('3000','1500');sql(settle);sql(settle);assert.equal(balance(),'105');assert.equal(sql('SELECT count(*) FROM credit_logs'),'1');
});
test('sub-reseller starts at 20; below minimum or insufficient parent balance leaves no transfer',()=>{
 sql(`UPDATE profiles SET credits=0 WHERE id='${b}'`);
 const init=amount=>`SELECT initialize_reseller('${r}','${b}','{"credits":${amount}}')`;
 for(const amount of [0,19])assert.throws(()=>sql(init(amount)));
 assert.equal(balance(),'100');assert.equal(sql('SELECT count(*) FROM credit_logs'),'0');
 sql(`UPDATE profiles SET credits=19 WHERE id='${r}'`);assert.throws(()=>sql(init(20)));assert.equal(balance(),'19');
 sql(`UPDATE profiles SET credits=20 WHERE id='${r}'`);sql(init(20));assert.equal(balance(),'0');assert.equal(sql(`SELECT credits FROM profiles WHERE id='${b}'`),'20');assert.equal(sql(`SELECT parent_reseller_id FROM profiles WHERE id='${b}'`),r);assert.equal(sql('SELECT count(*) FROM credit_logs'),'2');
 assert.throws(()=>sql(init(20)));assert.equal(sql('SELECT count(*) FROM credit_logs'),'2');
});
test('admin-created child also needs 20 while a top-level reseller may start unfunded',()=>{
 sql(`UPDATE profiles SET credits=0 WHERE id='${b}'`);
 assert.throws(()=>sql(`SELECT initialize_reseller('${a}','${b}','{"credits":19,"parent_reseller_id":"${r}"}')`));
 sql(`SELECT initialize_reseller('${a}','${b}','{"credits":0}')`);assert.equal(sql(`SELECT credits FROM profiles WHERE id='${b}'`),'0');assert.equal(balance(),'100');
});
test('parent credit requests require 10; approval still transfers exactly once',()=>{
 sql('TRUNCATE credit_requests');sql(`UPDATE profiles SET parent_reseller_id='${r}' WHERE id='${b}'`);
 for(const amount of [1,9])assert.throws(()=>sql(as(b,`SELECT request_parent_credits(${amount},'minimum-fixture')`)));
 const requestId=sql(as(b,"SELECT request_parent_credits(10,'minimum-fixture')"));
 sql(as(r,`SELECT review_parent_credits('${requestId}',true)`));sql(as(r,`SELECT review_parent_credits('${requestId}',true)`));assert.equal(balance(),'90');assert.equal(sql(`SELECT credits FROM profiles WHERE id='${b}'`),'110');
});
test('checkout below 10 is rejected before database or PayPal access',async()=>{
 let calls=0;const h=handler.createHandler({rpc(){calls++;throw Error('unexpected')}},async()=>r,key=>runtimeConfig[key]);
 const response=await h(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({action:'create',requestId:id,credits:5,expectedUnitPriceCents:300})}));
 assert.equal(response.status,400);assert.equal((await response.json()).error,'minimum_credit_purchase');assert.equal(calls,0);
});
