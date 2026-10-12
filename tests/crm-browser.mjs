// Real admin settings and trial UI, with local Auth/API fixtures and no external requests.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync,readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || '/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const root=process.cwd();
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Settings from './src/pages/admin/AdminSettings';import{CreateTrialForm}from'./src/components/customers/CreateTrialForm';createRoot(document.getElementById('root')).render(location.search?<CreateTrialForm onSuccess={()=>{}}/>:<Settings/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.join(root,'src')},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/contexts\/AuthContext|contexts\/AppContext|integrations\/supabase\/client|layout\/DashboardLayout|admin\/SecurityAuditLogs|admin\/RenewalAuditTool/},a=>({path:a.path,namespace:'fixtures'}));
 b.onLoad({filter:/.*/,namespace:'fixtures'},a=>({loader:'tsx',resolveDir:root,contents:a.path.includes('DashboardLayout')?`export const DashboardLayout=({children})=><main>{children}</main>;`:a.path.includes('SecurityAuditLogs')?`export const SecurityAuditLogs=()=>null;`:a.path.includes('RenewalAuditTool')?`export const RenewalAuditTool=()=>null;`:a.path.includes('AuthContext')?`export const useAuth=()=>({user:{id:'reseller',provider:'trex'}});`:a.path.includes('AppContext')?`export const useAppContext=()=>({refreshData:async()=>{}});`:`const chain={select:()=>chain,in:async()=>({data:[],error:null}),eq:()=>chain,single:async()=>({data:null,error:null}),upsert:async()=>({error:null})};export const supabase={from:()=>chain,functions:{invoke:async()=>{throw Error('Unexpected operation')}}};` }));
}}]});
const css=readFileSync('dist/assets/'+readdirSync('dist/assets').find(f=>f.endsWith('.css')));
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(result.outputFiles[0].text);}else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}else res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url);await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  assert.deepEqual(await page.getByRole('tab').allTextContents(),['System Settings','Security Audit','Renewal Audit']);
  assert.ok(await page.getByText('Trex IPTV API Configuration',{exact:true}).isVisible());
  assert.doesNotMatch(await page.locator('body').innerText(),/highlevel|\bcrm\b/i);
  await page.goto(url+'?trial');await page.getByText('Copy login details from the customer dashboard to share with your customer',{exact:false}).waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(),/highlevel|\bcrm\b/i);assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Admin settings and dashboard trial instructions verified at desktop and mobile widths.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
