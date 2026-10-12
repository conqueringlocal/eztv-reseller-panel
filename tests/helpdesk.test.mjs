import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const name=`eztv-helpdesk-test-${process.pid}`;
const ids={admin:'10000000-0000-4000-8000-000000000001',parent:'10000000-0000-4000-8000-000000000002',child:'10000000-0000-4000-8000-000000000003',other:'10000000-0000-4000-8000-000000000004',sid:'10000000-0000-4000-8000-000000000005'};
const sql=s=>execFileSync('docker',['exec','-i',name,'psql','-h','127.0.0.1','-U','postgres','-XqAt','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const context=()=>JSON.parse(sql(`select reseller_helpdesk_context('${ids.parent}','${ids.sid}')`));
let handler;
before(async()=>{
 execFileSync('docker',['run','-d','--name',name,'--network','none','--label','eztv.disposable-test=true','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{stdio:'pipe'});
 for(let i=0;i<50;i++){try{sql('select 1');break;}catch{await new Promise(r=>setTimeout(r,200));}}
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
 create table profiles(id uuid primary key,name text,role text,parent_reseller_id uuid);
 create table user_roles(user_id uuid,role text);
 create table admin_reseller_sessions(auth_session_id uuid,reseller_id uuid,status text,expires_at timestamptz);
 create table vault.secrets(id uuid primary key,decrypted_secret text);
 create view vault.decrypted_secrets as select * from vault.secrets;
 create function has_role(uuid,text) returns boolean language sql set search_path=public as $$select exists(select 1 from user_roles where user_id=$1 and role=$2)$$;
 insert into profiles values('${ids.admin}','Admin','admin',null),('${ids.parent}','Parent','reseller',null),('${ids.child}','Child','reseller','${ids.parent}'),('${ids.other}','Other','reseller',null);
 insert into auth.users(id) select id from profiles;insert into user_roles select id,role from profiles;
 insert into auth.sessions values('${ids.sid}','${ids.parent}',null);`);
 sql(readFileSync('supabase/migrations/20261012041130_reseller_helpdesk_context.sql','utf8'));
 const result=await build({entryPoints:['supabase/functions/reseller-helpdesk/handler.ts'],bundle:true,format:'esm',platform:'node',write:false});
 handler=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).helpdeskHandler;
});
after(()=>execFileSync('docker',['rm','-fv',name],{stdio:'pipe'}));
test('config and routing RPC are service-only',()=>{
 for(const role of ['anon','authenticated']){
  assert.equal(sql(`select has_function_privilege('${role}','reseller_helpdesk_context(uuid,uuid)','execute')`),'f');
  assert.equal(sql(`select has_table_privilege('${role}','reseller_helpdesk_settings','select')`),'f');
 }
 assert.equal(sql("select has_function_privilege('service_role','reseller_helpdesk_context(uuid,uuid)','execute')"),'t');
});
test('current profile hierarchy includes direct children only',()=>{const c=context();assert.equal(c.actor.admin,false);assert.equal(c.actor.parent_id,null);assert.deepEqual(c.children,[ids.child]);assert.equal(c.enabled,false);});
test('deleted, banned and expired sessions are denied',()=>{
 for(const change of [`update auth.users set banned_until=now()+interval '1 hour' where id='${ids.parent}'`,`update auth.users set deleted_at=now() where id='${ids.parent}'`,`update auth.sessions set not_after=now()-interval '1 second'`]){
  sql('begin;'+change+';commit;');assert.throws(context);sql('update auth.users set banned_until=null,deleted_at=null;update auth.sessions set not_after=null;');
 }
 assert.throws(()=>sql(`select reseller_helpdesk_context('${ids.other}','${ids.sid}')`));
});
test('ended impersonation sessions cannot use cached tokens',()=>{
 sql(`insert into admin_reseller_sessions values('${ids.sid}','${ids.parent}','ended',now()+interval '1 hour')`);assert.throws(context);sql('truncate admin_reseller_sessions');
});
test('reparenting removes old access immediately and cycles fail closed',()=>{
 sql(`update profiles set parent_reseller_id='${ids.other}' where id='${ids.child}'`);assert.deepEqual(context().children,[]);
 sql(`update profiles set parent_reseller_id='${ids.parent}' where id='${ids.child}';update profiles set parent_reseller_id='${ids.child}' where id='${ids.parent}'`);assert.throws(context);
 sql(`update profiles set parent_reseller_id='${ids.admin}' where id='${ids.parent}'`);assert.equal(context().actor.parent_id,null);
 sql(`update profiles set parent_reseller_id=null where id='${ids.parent}'`);
});
const token=claims=>'x.'+Buffer.from(JSON.stringify({session_id:ids.sid,...claims})).toString('base64url')+'.x';
function db(overrides={}){return {auth:{getUser:async()=>({data:{user:{id:ids.parent}},error:null})},rpc:async()=>({data:{enabled:true,key:'test-key',endpoint:'https://srv1781264.hstgr.cloud/eztv-support/v1',actor:{id:ids.parent,admin:false,parent_id:null},children:[ids.child],support_name:'EZTV Support'}}),...overrides};}
const req=(body,claims={})=>new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer '+token(claims)},body:JSON.stringify(body)});
test('unauthenticated and invalid-session callers never reach bridge',async()=>{
 let called=false;const fetcher=async()=>{called=true;return Response.json({});};
 assert.equal((await handler(db(),fetcher)(new Request('https://test.invalid',{method:'POST'}))).status,401);
 assert.equal((await handler(db(),fetcher)(req({action:'list'},{session_id:null}))).status,401);assert.equal(called,false);
});
test('server context overrides caller role, hierarchy and identity',async()=>{
 let sent,signature;const fetcher=async(_url,options)=>{sent=JSON.parse(options.body);signature=options.headers['X-EZTV-Signature'];return Response.json({tickets:[]});};
 const response=await handler(db(),fetcher)(req({action:'list',context:{actor:{id:ids.admin,admin:true}},input:{scope:'mine'}}));
 assert.equal(response.status,200);assert.equal(sent.context.actor.id,ids.parent);assert.equal(sent.context.actor.admin,false);assert.deepEqual(sent.context.children,[ids.child]);assert.match(signature,/^[a-f0-9]{64}$/);
});
test('config never discloses signing key or internal endpoint',async()=>{
 const body=await (await handler(db())(req({action:'config'}))).json();assert.equal(body.key,undefined);assert.equal(body.endpoint,undefined);assert.equal(body.enabled,true);
});
test('revoked hierarchy, disabled settings and bridge failures fail closed',async()=>{
 let touched=false;const f=async()=>{touched=true;throw new Error('offline');};
 assert.equal((await handler(db({rpc:async()=>({error:{message:'revoked'}})}),f)(req({action:'list'}))).status,403);assert.equal(touched,false);
 const paused=db();const get=paused.rpc;paused.rpc=async()=>{const r=await get();r.data.enabled=false;return r;};assert.equal((await handler(paused,f)(req({action:'list'}))).status,503);assert.equal(touched,false);
 assert.equal((await handler(db(),f)(req({action:'create',input:{request_id:ids.sid}}))).status,503);
});
