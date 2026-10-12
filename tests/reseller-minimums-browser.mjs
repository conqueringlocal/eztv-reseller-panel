import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const root=process.cwd();let balance=20,calls=[];
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AddSubResellerDialog}from'./src/components/resellers/AddSubResellerDialog';import{CreditRequestDialog}from'./src/components/credits/CreditRequestDialog';createRoot(document.getElementById('root')).render(location.search.includes('request')?<CreditRequestDialog open onOpenChange={()=>{}} parentResellerId='parent' creditPricePerUnit={3}/>:<AddSubResellerDialog open onOpenChange={()=>{}}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.join(root,'src')},plugins:[{name:'synthetic-api',setup(b){b.onResolve({filter:/contexts\/AuthContext|integrations\/supabase\/client/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('AuthContext')?`const user={id:'22222222-2222-4222-8222-222222222222',role:'reseller'};export const useAuth=()=>({user});`:`const call=async(body)=>({data:await(await fetch('/fake',{method:'POST',body:JSON.stringify(body)})).json(),error:null});export const supabase={functions:{invoke:(name,o)=>call({action:name,...o.body})},rpc:(name,args)=>call({action:name,...args}),from:()=>({select(){return this},eq(){return this},async single(){return {data:await(await fetch('/balance')).json(),error:null}}})};`}));}}]});
const css=readFileSync(path.join('dist/assets',readdirSync('dist/assets').find(x=>x.endsWith('.css'))));
const server=createServer(async(req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(req.url==='/balance'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({credits:balance}));return;}
 if(req.url==='/fake'){let raw='';for await(const part of req)raw+=part;calls.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');res.end('{"success":true}');return;}
 res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1280,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  balance=20;calls=[];await page.goto(base);const credits=page.getByLabel('Credits to Allocate',{exact:false});await credits.waitFor();assert.equal(await credits.inputValue(),'20');assert.equal(await credits.getAttribute('min'),'20');
  await page.getByLabel('Name',{exact:true}).fill('Synthetic child');await page.getByLabel('Email',{exact:true}).fill('child@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
  await credits.fill('19');assert.equal(await page.getByRole('button',{name:'Create Sub-Reseller'}).isDisabled(),true);assert.equal(calls.length,0);await credits.fill('20');await page.getByRole('button',{name:'Create Sub-Reseller'}).click();await page.waitForTimeout(150);assert.equal(calls.at(-1).credits,20);assert.equal(calls.at(-1).action,'create-reseller');
  balance=19;await page.goto(base);await page.getByText('You need at least 20 credits to create a sub-reseller.').waitFor();assert.equal(await page.getByRole('button',{name:'Create Sub-Reseller'}).isDisabled(),true);
  await page.goto(base+'/?request');const request=page.getByLabel('Number of Credits');await request.waitFor();assert.equal(await request.getAttribute('min'),'10');await request.fill('9');assert.equal(await page.getByRole('button',{name:'Submit Request'}).isDisabled(),true);await request.fill('10');await page.getByRole('button',{name:'Submit Request'}).click();await page.waitForTimeout(150);assert.equal(calls.at(-1).p_credits,10);assert.equal(calls.at(-1).action,'request_parent_credits');
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log(`PASS ${viewport.width}px: sub-reseller default/minimum 20, low balance blocked, parent credit minimum 10, valid payloads`);await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
