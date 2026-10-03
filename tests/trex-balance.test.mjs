import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
const code=await transform(readFileSync('supabase/functions/sync-trex-balance/handler.ts','utf8'),{loader:'ts',format:'esm'});
const {parseTrexBalance,createBalanceHandler}=await import('data:text/javascript;base64,'+Buffer.from(code.code).toString('base64'));
test('Trex documented array and object balances parse, including zero and decimals',()=>{
 for(const value of ['0',0,'44','44.50'])assert.equal(parseTrexBalance([{status:'true',enabled:'1',credits:value,username:'not-returned'}]),Number(value));
 assert.equal(parseTrexBalance({status:true,enabled:1,credits:60}),60);
});
test('missing, failed, disabled or malformed responses never become zero',()=>{
 for(const value of [null,false,'',' ','NaN','1e2',-1,'1,000',{},[],1000001,'1.234'])assert.throws(()=>parseTrexBalance([{status:'true',enabled:'1',credits:value}]));
 for(const value of [{status:'false',enabled:'1',credits:0},{status:'true',enabled:'0',credits:60},[],[{status:'true',enabled:'1',credits:30},{status:'true',enabled:'1',credits:30}],null,'html'])assert.throws(()=>parseTrexBalance(value));
});
function fixture(options={}){
 const calls=[],finishes=[];let userCalls=0;
 const db={auth:{getUser:async()=>{userCalls++;return options.badUser?{error:'bad',data:{user:null}}:{error:null,data:{user:{id:'owner'}}};}},rpc:async(name,args)=>{
  if(name==='has_role')return{data:!options.reseller,error:null};
  if(name==='authorize_trex_balance_sync')return{data:args.p_token==='fixture-scheduler',error:null};
  if(name==='claim_trex_balance_sync')return{data:options.cached?{claimed:false,last_error:options.cachedError?'provider_unavailable':null}:{claimed:true,claim_id:'fixture-claim',checked_at:'2026-10-03T00:00:00Z'},error:null};
  if(name==='finish_trex_balance_sync'){finishes.push(args);return{data:!options.storageFailure,error:null};}
  throw new Error('Unexpected RPC');
 }};
 const env=n=>n==='TREX_API_KEY'?'private-fixture-key':n==='TREX_PANEL_URL'?'https://activationpanel.net/api/api.php':undefined;
 const fetcher=async(url,init)=>{calls.push({url:new URL(url),init});if(options.timeout)throw new Error('timeout with private-fixture-key');return new Response(options.invalid?'not json':JSON.stringify(options.failed?[{status:'false'}]:[{status:'true',enabled:'1',credits:42,username:'private-name'}]),{status:options.httpError?503:200});};
 const handler=createBalanceHandler(db,env,fetcher);
 return{calls,finishes,get userCalls(){return userCalls;},invoke:async(headers={Authorization:'Bearer fixture-admin'},method='POST')=>{const response=await handler(new Request('https://app.invalid',{method,headers,body:method==='POST'?JSON.stringify({action:'new',credits:999}):undefined}));return{status:response.status,body:await response.json()};}};
}
test('anonymous, invalid users and resellers cannot read or call the provider',async()=>{
 for(const options of [{badUser:true},{reseller:true}]){const f=fixture(options);assert.equal((await f.invoke()).status,401);assert.equal(f.calls.length,0);}
 const f=fixture();assert.equal((await f.invoke({})).status,401);assert.equal((await f.invoke({'X-Trex-Balance-Token':'wrong'})).status,401);assert.equal(f.calls.length,0);
});
test('owner query makes only the documented read-only call and returns no credentials',async()=>{
 const f=fixture();const r=await f.invoke();assert.equal(r.status,200);assert.equal(r.body.credits,42);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url.searchParams.get('action'),'reseller_info');assert.deepEqual([...f.calls[0].url.searchParams.keys()],['action','api_key']);assert.equal(f.calls[0].init.redirect,'error');
 assert.equal(f.finishes[0].p_credits,42);assert.equal(f.finishes[0].p_error,null);assert.ok(!JSON.stringify(r.body).includes('private'));
});
test('scheduled calls require the vault-backed verifier and do not trust anonymous JWTs',async()=>{
 const f=fixture();assert.equal((await f.invoke({'X-Trex-Balance-Token':'fixture-scheduler'})).status,200);assert.equal(f.userCalls,0);assert.equal(f.calls.length,1);
});
test('timeout, provider errors and invalid JSON preserve the previous balance',async()=>{
 for(const options of [{timeout:true},{httpError:true},{invalid:true},{failed:true}]){const f=fixture(options);const r=await f.invoke();assert.equal(r.status,503);assert.equal(f.finishes[0].p_credits,null);assert.ok(f.finishes[0].p_error);assert.ok(!JSON.stringify(r.body).includes('private-fixture-key'));}
});
test('cached sync does not request Trex again and failures stay visible',async()=>{
 const f=fixture({cached:true});assert.equal((await f.invoke()).body.cached,true);assert.equal(f.calls.length,0);
 const bad=fixture({cached:true,cachedError:true});assert.equal((await bad.invoke()).body.success,false);assert.equal(bad.calls.length,0);
});
test('storage failure does not report a successful refresh',async()=>{const f=fixture({storageFailure:true});assert.equal((await f.invoke()).status,503);});
test('GET is rejected and OPTIONS does not call the provider',async()=>{const f=fixture();assert.equal((await f.invoke({},'GET')).status,405);assert.equal((await f.invoke({},'OPTIONS')).status,200);assert.equal(f.calls.length,0);});
