// Real React payment component; mocked Auth/API only. No external requests allowed.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync,readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const root=process.cwd(), id='44444444-4444-4444-8444-444444444444';
let admin=false, enabled=true, mode='created', calls=[];
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PayPalCredits}from'./src/components/credits/PayPalCredits';createRoot(document.getElementById('root')).render(<PayPalCredits admin={new URLSearchParams(location.search).has('admin')}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.join(root,'src')},plugins:[{name:'synthetic-auth-and-api',setup(b){b.onResolve({filter:/contexts\/AuthContext|integrations\/supabase\/client/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('AuthContext')?`export const useAuth=()=>({user:{id:'22222222-2222-4222-8222-222222222222'}});`:`const call=async(body)=>({data:await(await fetch('/fake-fn',{method:'POST',body:JSON.stringify(body)})).json(),error:null}); export const supabase={functions:{invoke:(_,opts)=>call(opts.body)},rpc:(name,body)=>call({action:name,...body}),from:()=>({select(){return this},order(){return this},limit(){return this},eq(){return this},then(done){return fetch('/fake-history').then(r=>r.json()).then(data=>done({data,error:null}))}})};`}));}}]});
const css=readFileSync(path.join('dist/assets',readdirSync('dist/assets').find(x=>x.endsWith('.css'))));
const server=createServer(async(req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(req.url==='/fake-history'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(enabled||admin?[{id,reseller_id:'22222222-2222-4222-8222-222222222222',credits:10,amount_cents:3000,status:mode,paypal_order_id:'ORDER12345',capture_id:null,review_reason:mode==='review_required'?'PAYMENT.CAPTURE.REFUNDED':null,created_at:new Date().toISOString()}]:[]));return;}
 if(req.url==='/fake-fn'){let text='';for await(const c of req)text+=c;const data=JSON.parse(text);calls.push(data);res.setHeader('Content-Type','application/json');if(data.action==='config')res.end(JSON.stringify({enabled,environment:'live'}));else if(data.action==='create')res.end(JSON.stringify({approve_url:'https://www.paypal.com/checkoutnow?token=ORDER12345'}));else{mode=data.action==='resolve_paypal_credit_review'?'reviewed':'credited';res.end(JSON.stringify({status:mode}));}return;}
 res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="max-width:800px;margin:auto;padding:16px"></div><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.request().url().startsWith('https://www.paypal.com/checkoutnow')?route.fulfill({body:'Synthetic PayPal destination'}):route.abort());
  enabled=false;mode='created';admin=false;await page.goto(base);await page.waitForTimeout(200);assert.equal(await page.getByRole('button',{name:/Pay.*with PayPal/}).count(),0);
  enabled=true;await page.goto(base);await page.getByRole('button',{name:'Pay $30.00 with PayPal'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Pay $30.00 with PayPal'}).click();await page.waitForURL('https://www.paypal.com/**');assert.equal(calls.findLast(x=>x.action==='create').credits,10);
  mode='created';await page.goto(base+'/?paypal=return&token=ORDER12345');await page.getByText('Payment confirmed—your credits have been added.').waitFor();assert.equal(new URL(page.url()).search,'');assert.equal(calls.findLast(x=>x.action==='capture').paypalOrderId,'ORDER12345');
  admin=true;mode='review_required';await page.goto(base+'/?admin=1');const note=page.getByLabel('Verified payment/refund and credit adjustment outcome');await note.fill('Refund verified; credit adjustment logged separately.');await page.getByRole('button',{name:'Mark review resolved'}).click();await page.getByText('Review resolved. This action does not change money or credits.').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await context.close();console.log(`PASS: ${viewport.width}px disabled checkout, purchase redirect, return/capture, administrator review and overflow checks`);
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
