import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const report=JSON.parse(readFileSync('/opt/eztv-support-pilot/local/dashboard/hierarchy-test-result.json'));
const ids=report.synthetic_ids;const key=readFileSync('/opt/eztv-support-pilot/local/dashboard/signing-key','utf8').trim();
const parents={parent:null,child:'parent',sibling:'parent',other:null,grandchild:'child',admin:null};
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Helpdesk from './src/pages/Helpdesk';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BrowserRouter><Helpdesk/></BrowserRouter></QueryClientProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.join(process.cwd(),'src')},plugins:[{name:'test-identity',setup(b){
 b.onResolve({filter:/contexts\/AuthContext|integrations\/supabase\/client|components\/layout\/DashboardLayout/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:a.path.includes('DashboardLayout')?`export const DashboardLayout=({children})=><main className='p-4'>{children}</main>;`:a.path.includes('AuthContext')?`const viewer=new URLSearchParams(location.search).get('viewer')||'child';const ids=${JSON.stringify(ids)};export const useAuth=()=>({user:{id:ids[viewer],role:viewer==='admin'?'admin':'reseller'}});`:`const viewer=new URLSearchParams(location.search).get('viewer')||'child';export const supabase={functions:{invoke:async(_name,{body})=>{const r=await fetch('/api',{method:'POST',body:JSON.stringify({...body,viewer})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:{context:{status:r.status,json:async()=>data}}};}}};`}));
}}]});
const css=readFileSync(path.join('dist/assets',readdirSync('dist/assets').find(f=>f.endsWith('.css'))));
const server=createServer(async(req,res)=>{
 try{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text);return;}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(req.url==='/api'){
  let raw='';for await(const p of req)raw+=p;const b=JSON.parse(raw),v=b.viewer;
  res.setHeader('Content-Type','application/json');
  if(b.action==='config'){res.end(JSON.stringify({enabled:true,admin:v==='admin',support_name:v==='child'?'PILOT parent':'EZTV Support',has_parent:!!parents[v]}));return;}
  const context={actor:{id:ids[v],name:'PILOT '+v,admin:v==='admin',parent_id:ids[parents[v]]||null},children:Object.keys(parents).filter(n=>parents[n]===v).map(n=>ids[n])};
  const body=JSON.stringify({issued_at:Math.floor(Date.now()/1000),context,action:b.action,input:b.input});
  const r=await fetch('http://127.0.0.1:8093/api/eztv_support',{method:'POST',headers:{'Content-Type':'application/json','X-EZTV-Signature':createHmac('sha256',key).update(body).digest('hex')},body});res.statusCode=r.status;res.end(await r.text());return;
 }
 res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
 }catch{res.statusCode=500;res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true});
try{
 for(const width of [1280,390]){
  const ctx=await browser.newContext({viewport:{width,height:1000}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base+'/?viewer=child');await page.getByRole('button',{name:'Open ticket',exact:true}).click();
  const title='PILOT browser channel '+width+' '+Date.now();await page.getByLabel('Subject',{exact:true}).fill(title);await page.getByLabel('Request type').selectOption('channel_issue');await page.getByLabel('Details',{exact:true}).fill('Channel freezes at 8 PM Eastern; synthetic test.');
  await page.getByRole('button',{name:'Open ticket',exact:true}).click();await page.getByText(title,{exact:false}).first().waitFor();const ticket=new URL(page.url()).searchParams.get('ticket');assert.ok(ticket);
  await page.goto(base+'/?viewer=parent&ticket='+ticket);await page.getByLabel('Private note — hidden from the requester').check();await page.getByLabel('Private note',{exact:true}).fill('PRIVATE PARENT INVESTIGATION');await page.getByRole('button',{name:'Save private note'}).click();await page.getByText('PRIVATE PARENT INVESTIGATION',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Escalate to EZTV',exact:true}).click();await page.getByLabel('Summary for your support provider').fill('Selected upstream summary');await page.getByRole('button',{name:'Send escalation'}).click();await page.waitForURL(url=>url.searchParams.get('ticket')!==ticket);await page.getByText('Selected upstream summary',{exact:true}).waitFor();const escalation=new URL(page.url()).searchParams.get('ticket');assert.notEqual(escalation,ticket);
  await page.goto(base+'/?viewer=admin&ticket='+escalation);await page.getByLabel('Reply',{exact:true}).fill('EZTV investigation update');await page.getByRole('button',{name:'Send reply',exact:true}).click();await page.getByText('EZTV investigation update',{exact:true}).waitFor();assert.equal(await page.getByText('PRIVATE PARENT INVESTIGATION',{exact:true}).count(),0);
  await page.goto(base+'/?viewer=child&ticket='+ticket);await page.getByText('Your support provider has escalated this issue.').waitFor();assert.equal(await page.getByText('PRIVATE PARENT INVESTIGATION',{exact:true}).count(),0);assert.equal(await page.getByText('EZTV investigation update',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'View upstream conversation'}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log(`PASS ${width}px: create channel ticket, parent private note, upstream escalation, admin response, requester privacy, no overflow`);await ctx.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
