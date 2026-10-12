#!/usr/bin/env python3
"""HTTP integration tests with synthetic reseller identities, no provider/mail calls."""
import base64,concurrent.futures,hashlib,hmac,json,time,uuid,urllib.request,urllib.error
from pathlib import Path
key=(Path('/opt/eztv-support-pilot/local/dashboard/signing-key')).read_bytes().strip()
root='http://127.0.0.1:8093/api/eztv_support'
ids={n:str(uuid.uuid4()) for n in ['admin','parent','child','sibling','other','grandchild']}
registry=Path('/opt/eztv-support-pilot/local/dashboard/fixture-ids.json')
registered=json.loads(registry.read_text()) if registry.exists() else []
registry.write_text(json.dumps(sorted(set(registered+list(ids.values())))));registry.chmod(0o600)
parents={'admin':None,'parent':None,'child':'parent','sibling':'parent','other':None,'grandchild':'child'}
checks=[]
def context(who):
 return {'actor':{'id':ids[who],'name':'PILOT '+who,'admin':who=='admin','parent_id':ids.get(parents[who])},'children':[ids[n] for n,p in parents.items() if p==who]}
def call(who,action,data=None,ctx=None,age=0,bad_signature=False):
 body=json.dumps({'issued_at':int(time.time())-age,'context':ctx or context(who),'action':action,'input':data or {}}).encode()
 signature=hmac.new(key,body,hashlib.sha256).hexdigest()
 req=urllib.request.Request(root,data=body,headers={'Content-Type':'application/json','X-EZTV-Signature':'bad' if bad_signature else signature})
 try:r=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e:r=e
 return r.status,json.loads(r.read())
def ok(who,action,data=None,**kwargs):
 status,value=call(who,action,data,**kwargs)
 assert status==200,(who,action,status,value)
 return value
def check(name,condition):
 assert condition,name
 checks.append(name);print('PASS',name,flush=True)
def mutation(**data):return {'request_id':str(uuid.uuid4()),**data}
def create(who,**data):return ok(who,'create',mutation(title='PILOT hierarchy '+who,category='technical',body='Synthetic support issue',**data))
check('Unsigned caller rejected',call('parent','list',bad_signature=True)[0]==401)
check('Stale signed context rejected',call('parent','list',age=60)[0]==401)
p=create('parent');c=create('child');g=create('grandchild');o=create('other')
check('Direct reseller routes to EZTV',p['id'] in [t['id'] for t in ok('admin','list',{'scope':'queue'})['tickets']])
check('Sub-reseller routes only to immediate parent',c['id'] in [t['id'] for t in ok('parent','list',{'scope':'queue'})['tickets']])
check('Sub-reseller ticket absent from ordinary EZTV queue',c['id'] not in [t['id'] for t in ok('admin','list',{'scope':'queue'})['tickets']])
check('Third-level reseller routes to its own parent',g['id'] in [t['id'] for t in ok('child','list',{'scope':'queue'})['tickets']])
for who,ticket in [('sibling',c),('other',c),('parent',g),('child',o)]:
 check(who+' denied unrelated ticket',call(who,'detail',{'id':ticket['id']})[0]==403)
check('Forged handler fields cannot reroute creation',call('child','create',mutation(title='PILOT forged routing',category='technical',body='test',handler_id=ids['other'],creator_id=ids['other']))[0]==200)
check('Other branch queue remains empty',ok('other','list',{'scope':'queue'})['tickets']==[])
attachment={'name':'evidence.txt','type':'text/plain','data':base64.b64encode(b'PRIVATE NOTE').decode()}
note=ok('parent','reply',mutation(id=c['id'],body='PILOT private parent note',internal=True,attachments=[attachment]))
private=next(m for m in note['messages'] if m['body']=='PILOT private parent note')
check('Private note absent for ticket requester',not any(m['id']==private['id'] for m in ok('child','detail',{'id':c['id']})['messages']))
file_input={'id':c['id'],'article_id':private['id'],'attachment_id':private['attachments'][0]['id']}
check('Private attachment denied to requester',call('child','attachment',file_input)[0]==403)
check('Private attachment available to assigned handler',ok('parent','attachment',file_input)['data']==attachment['data'])
check('Requester cannot write staff-only notes',call('child','reply',mutation(id=c['id'],body='bad',internal=True))[0]==403)
public_req=mutation(id=c['id'],body='PILOT public answer')
first=ok('parent','reply',public_req);second=ok('parent','reply',public_req)
check('Retrying reply returns same article once',sum(m['body']=='PILOT public answer' for m in second['messages'])==1 and len(first['messages'])==len(second['messages']))
check('Changed payload with reused request rejected',call('parent','reply',{**public_req,'body':'different'})[0]==400)
esc_req=mutation(id=c['id'],body='Selected escalation summary only')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _:ok('parent','escalate',esc_req),range(2)))
e=results[0]
check('Racing escalations create one upstream ticket',results[0]['id']==results[1]['id'])
check('Escalation reaches EZTV',e['id'] in [t['id'] for t in ok('admin','list',{'scope':'queue'})['tickets']])
check('Sub-reseller cannot view private upstream conversation',call('child','detail',{'id':e['id']})[0]==403)
check('Escalation contains only selected summary',len(e['messages'])==1 and e['messages'][0]['body']=='Selected escalation summary only')
check('Requester sees escalation status without private link','escalation_id' not in ok('child','detail',{'id':c['id']}) and ok('child','detail',{'id':c['id']})['escalated'])
check('Requester cannot escalate past its parent',call('child','escalate',mutation(id=c['id'],body='bypass'))[0]==403)
check('Other reseller cannot close ticket',call('other','close',mutation(id=c['id']))[0]==403)
check('Handler closes ticket',ok('parent','close',mutation(id=c['id']))['status']=='closed')
check('Requester reply reopens ticket',ok('child','reply',mutation(id=c['id'],body='Follow-up'))['status']=='open')
parents['child']='other'
check('Reparenting immediately revokes old handler access',call('parent','detail',{'id':c['id']})[0]==403)
check('Saved request replay cannot restore revoked access',call('parent','reply',public_req)[0]==403)
check('Old ticket is not silently disclosed to new handler',call('other','detail',{'id':c['id']})[0]==403)
check('Requester retains own history',ok('child','detail',{'id':c['id']})['id']==c['id'])
new=create('child')
check('New tickets follow updated parent',new['id'] in [t['id'] for t in ok('other','list',{'scope':'queue'})['tickets']])
check('Non-admin cannot browse global oversight',call('parent','list',{'scope':'oversight'})[0]==403)
check('Executable attachments rejected',call('child','reply',mutation(id=new['id'],body='file',attachments=[{'name':'bad.html','type':'text/html','data':'eA=='}]))[0]==400)
report={'tested_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'passed':checks,'synthetic_ids':ids,'tickets':{'parent':p['id'],'child':c['id'],'escalation':e['id']}}
path=Path('/opt/eztv-support-pilot/local/dashboard/hierarchy-test-result.json');path.write_text(json.dumps(report,indent=2));path.chmod(0o600)
print(f'{len(checks)} hierarchy checks passed. No external email or credit/provider operation performed.')
