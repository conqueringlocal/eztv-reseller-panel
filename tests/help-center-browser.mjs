import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import('/root/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const report=JSON.parse(readFileSync('/opt/eztv-support-pilot/local/dashboard/knowledge-test-result.json'));
const ids=report.ids;const key=readFileSync('/opt/eztv-support-pilot/local/dashboard/signing-key','utf8').trim();
const parents={reseller:null,admin:null};
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import HelpCenter from './src/pages/HelpCenter';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BrowserRouter><HelpCenter/></BrowserRouter></QueryClientProvider>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',alias:{'@':path.join(process.cwd(),'src')},plugins:[{name:'test-identity',setup(b){
 b.onResolve({filter:/contexts\/AuthContext|integrations\/supabase\/client|components\/layout\/DashboardLayout/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'tsx',resolveDir:process.cwd(),contents:a.path.includes('DashboardLayout')?`import {SupportBanner} from './src/components/layout/SupportBanner';export const DashboardLayout=({children})=><main className='p-4'><SupportBanner/>{children}</main>;`:a.path.includes('AuthContext')?`const viewer=new URLSearchParams(location.search).get('viewer')||'reseller';const ids=${JSON.stringify(ids)};export const useAuth=()=>({user:{id:ids[viewer],role:viewer==='admin'?'admin':'reseller'}});`:`const viewer=new URLSearchParams(location.search).get('viewer')||'reseller';export const supabase={functions:{invoke:async(_name,{body})=>{const r=await fetch('/api',{method:'POST',body:JSON.stringify({...body,viewer})});const data=await r.json();return r.ok?{data,error:null}:{data:null,error:{context:{status:r.status,json:async()=>data}}};}}};`}));
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
  await page.goto(base+'/?viewer=admin');await page.getByRole('button',{name:'New article',exact:true}).click();
  const title='PILOT browser guide '+width+' '+Date.now();
  await page.getByLabel('Title',{exact:true}).fill(title);await page.getByLabel('Article content').fill('Step 1: Open settings.\nStep 2: Check your details.\n<script>alert("bad")</script>');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.waitForURL(url=>url.searchParams.has('article'));
  const id=new URL(page.url()).searchParams.get('article');assert.ok(id);
  const registry='/opt/eztv-support-pilot/local/dashboard/knowledge-fixtures.json';writeFileSync(registry,JSON.stringify([...JSON.parse(readFileSync(registry)),id]));
  await page.getByRole('button',{name:'Edit article',exact:true}).waitFor();
  await page.goto(base+'/?viewer=reseller&article='+id);await page.getByText('This article or category is not available to your account').waitFor();assert.equal(await page.getByText(title,{exact:true}).count(),0);
  await page.goto(base+'/?viewer=admin&article='+id);await page.getByRole('button',{name:'Edit article',exact:true}).click();await page.getByRole('button',{name:'Publish article',exact:true}).click();await page.getByRole('button',{name:'Edit article',exact:true}).waitFor();
  await page.goto(base+'/?viewer=reseller');assert.equal(await page.getByText('Private admin guides',{exact:true}).count(),0);await page.getByLabel('Search guides').fill(title);await page.getByRole('button',{name:'Search',exact:true}).click();await page.getByRole('button',{name:new RegExp(title)}).click();await page.getByText(title,{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Edit article'}).count(),0);assert.ok(await page.getByText('Step 1: Open settings.',{exact:false}).count());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto(base+'/?viewer=admin&article='+id);await page.getByRole('button',{name:'Edit article',exact:true}).click();await page.getByRole('button',{name:'Archive article',exact:true}).click();await page.getByRole('button',{name:'Edit article',exact:true}).waitFor();
  await page.goto(base+'/?viewer=reseller&article='+id);await page.getByText('This article or category is not available to your account').waitFor();
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px: draft, publish, search, safe text, reseller read-only, archive and direct-link privacy`);await ctx.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
