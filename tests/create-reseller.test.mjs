import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
const parent='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333';
const result=await build({entryPoints:['supabase/functions/create-reseller/index.ts'],bundle:true,write:false,format:'iife',platform:'node',plugins:[{name:'synthetic-supabase',setup(b){b.onResolve({filter:/^https:/},()=>({path:'client',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=()=>globalThis.fixtureClient',loader:'js'}));}}]});
function setup(admin=false){let handler,created=0;const allocations=[];
 const fixtureClient={auth:{getUser:async()=>({data:{user:{id:parent}},error:null}),admin:{createUser:async()=>{created++;return {data:{user:{id:child}},error:null}}}},rpc:async(name,args)=>{if(name==='has_role')return {data:admin,error:null};assert.equal(name,'initialize_reseller');allocations.push(args);return {data:null,error:null}}};
 vm.runInNewContext(result.outputFiles[0].text,{fixtureClient,Response,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 return {allocations,get created(){return created},invoke:async(credits,extra={})=>handler(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify({name:'Synthetic child',email:'child@example.invalid',password:'synthetic-only',credits,...extra})}))};
}
test('reseller can start a child with 20; 19 and fractional amounts fail before Auth creation',async()=>{
 const app=setup();for(const amount of [0,19,19.5])assert.equal((await app.invoke(amount)).status,400);assert.equal(app.created,0);
 assert.equal((await app.invoke(20)).status,200);assert.equal(app.created,1);assert.equal(app.allocations[0].p_data.credits,20);assert.equal(app.allocations[0].p_data.parent_reseller_id,parent);
});
test('a forged parent cannot be used even with enough credits',async()=>{
 const app=setup();assert.equal((await app.invoke(20,{parent_reseller_id:child})).status,403);assert.equal(app.created,0);
});
test('admin child follows 20 minimum; admin top-level account can start with zero',async()=>{
 const app=setup(true);assert.equal((await app.invoke(19,{parent_reseller_id:parent})).status,400);assert.equal(app.created,0);
 assert.equal((await app.invoke(20,{parent_reseller_id:parent})).status,200);assert.equal((await app.invoke(0)).status,200);assert.equal(app.created,2);
});
