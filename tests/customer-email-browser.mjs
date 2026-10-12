// Actual React components with synthetic Auth/API. All external requests blocked.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const root=process.cwd(),id='44444444-4444-4444-8444-444444444444';
let enabled=true,calls=[],history=[],failSend=false;
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CustomerSetupEmail}from'./src/components/customers/CustomerSetupEmail';import{AddCustomerForm}from'./src/components/customers/AddCustomerForm';createRoot(document.getElementById('root')).render(location.search.includes('create')?<AddCustomerForm/>:<CustomerSetupEmail customerId='${id}'/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',define:{'import.meta.env.VITE_TREX_CREATION_PAUSED':'"false"'},alias:{'@':path.join(root,'src')},plugins:[{name:'synthetic-api',setup(b){b.onResolve({filter:/contexts\/AuthContext|contexts\/AppContext|integrations\/supabase\/client|hooks\/useIptvPackages/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('AuthContext')?`export const useAuth=()=>({user:{id:'22222222-2222-4222-8222-222222222222',role:'reseller'}});`:a.path.includes('AppContext')?`const customers=[];export const useApp=()=>({customers,addCustomer:async(customer)=>{await fetch('/fake',{method:'POST',body:JSON.stringify({action:'create',customer})});return true;}});`:a.path.includes('IptvPackages')?`export const useIptvPackages=()=>({packages:[{id:'123',name:'Synthetic package'}],isLoading:false,source:'api',refetch:async()=>{}});`:`export const supabase={functions:{invoke:async(_,o)=>({data:await(await fetch('/fake',{method:'POST',body:JSON.stringify(o.body)})).json(),error:null})},rpc:async()=>({data:1,error:null})};`}));}}]});
const css=readFileSync(path.join('dist/assets',readdirSync('dist/assets').find(x=>x.endsWith('.css'))));
const server=createServer(async(req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(req.url==='/fake'){
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);calls.push(body);res.setHeader('Content-Type','application/json');
  if(body.action==='config'){res.end(JSON.stringify({enabled}));return;}
  if(body.action==='preview'){res.end(JSON.stringify({enabled,recipient:'customer@example.invalid',replyTo:'reseller@example.invalid',subject:'Your EZTV account setup details',text:'Connection 1\nUsername: synthetic\nPassword: synthetic-only\nM3U playlist: https://stream.example.invalid/get.php?username=synthetic&password=synthetic',version:'synthetic-version',history}));return;}
  if(body.action==='send'){
   if(failSend){res.end(JSON.stringify({error:'Synthetic network uncertainty'}));return;}
   history=[{id:body.requestId,status:'queued',source:'manual',recipient:'customer@example.invalid',created_at:new Date().toISOString(),error_code:null}];res.end(JSON.stringify({id:body.requestId,status:'queued'}));return;
  }
  res.end('{}');return;
 }
 res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="max-width:800px;margin:auto;padding:16px"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  enabled=true;history=[];calls=[];failSend=false;
  await page.goto(base);await page.getByRole('button',{name:'Review and send email'}).click();await page.getByLabel('Message preview — includes passwords').waitFor();assert.match(await page.getByRole('textbox').inputValue(),/Password: synthetic-only/);
  failSend=true;await page.getByRole('button',{name:'Send setup email',exact:true}).click();await page.getByText('Synthetic network uncertainty').waitFor();const firstId=calls.findLast(x=>x.action==='send').requestId;
  failSend=false;await page.getByRole('button',{name:'Send setup email',exact:true}).click();await page.getByText('Queued',{exact:true}).waitFor();assert.equal(calls.findLast(x=>x.action==='send').requestId,firstId);assert.equal(await page.getByRole('button',{name:'Send setup email',exact:true}).isDisabled(),true);
  history[0].status='uncertain';await page.getByRole('button',{name:'Refresh preview and status'}).click();await page.getByText(/A previous delivery is uncertain/).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  enabled=false;await page.getByRole('button',{name:'Refresh preview and status'}).click();await page.getByText('Email sending is temporarily unavailable. You can still copy the credentials.').waitFor();assert.equal(await page.getByRole('button',{name:'Send setup email',exact:true}).isDisabled(),true);
  enabled=true;await page.goto(base+'/?create');const toggle=page.getByRole('switch',{name:'Email setup details to customer'});await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('data-state')==='checked');
  for(const send of [false,true]){
   if((await toggle.getAttribute('data-state')==='checked')!==send)await toggle.click();
   await page.getByRole('textbox',{name:'Name',exact:true}).fill('Synthetic Customer');await page.getByRole('textbox',{name:'Email',exact:true}).fill('customer@example.invalid');
   await page.getByRole('combobox').filter({has:page.getByText('Select a package',{exact:true})}).click();await page.getByRole('option',{name:'Synthetic package'}).click();
   await page.getByRole('button',{name:/Add M3U Customer/}).click();await page.waitForFunction(()=>document.querySelector('input')?.value==='');assert.equal(calls.findLast(x=>x.action==='create').customer.sendSetupEmail,send);
   // Remount to reset Radix Select's uncontrolled display between submissions.
   await page.goto(base+'/?create');await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('data-state')==='checked');
  }
  enabled=false;await page.goto(base+'/?create');await page.getByText(/Automatic email is currently unavailable/).waitFor();assert.equal(await toggle.isDisabled(),true);assert.equal(await toggle.getAttribute('data-state'),'unchecked');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log(`PASS ${viewport.width}px: preview, ambiguous-send identity, status/disabled state, automatic opt-out/on payload, sender unavailable, no overflow/errors`);await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
