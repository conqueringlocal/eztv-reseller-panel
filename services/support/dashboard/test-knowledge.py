#!/usr/bin/env python3
"""Run before publishing the Edge KB actions. Fixtures are removed before rollout."""
import hashlib,hmac,json,time,uuid,urllib.request,urllib.error
from pathlib import Path
root=Path('/opt/eztv-support-pilot/local/dashboard')
key=(root/'signing-key').read_bytes().strip()
ids={role:str(uuid.uuid4()) for role in ['admin','reseller']}
registry=root/'fixture-ids.json'
registry.write_text(json.dumps(sorted(set(json.loads(registry.read_text())+list(ids.values())))))
checks=[];articles=[]
def call(role,action,input=None,bad=False):
 body=json.dumps({'issued_at':int(time.time()),'context':{'actor':{'id':ids[role],'name':'PILOT '+role,'admin':role=='admin','parent_id':None},'children':[]},'action':action,'input':input or {}}).encode()
 req=urllib.request.Request('http://127.0.0.1:8093/api/eztv_support',data=body,headers={'Content-Type':'application/json','X-EZTV-Signature':'bad' if bad else hmac.new(key,body,hashlib.sha256).hexdigest()})
 try:r=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e:r=e
 return r.status,json.loads(r.read())
def ok(role,action,input=None):
 status,data=call(role,action,input);assert status==200,(status,data);return data
def check(label,condition):
 assert condition,label
 checks.append(label);print('PASS',label,flush=True)
def save(article=None,**changes):
 if article is None:
  id=str(uuid.uuid4());articles.append(id)
  (root/'knowledge-fixtures.json').write_text(json.dumps(articles));(root/'knowledge-fixtures.json').chmod(0o600)
  value={'id':id,'revision':0,'title':'PILOT article '+id,'body':'A setup step.\n<unsafe> & private?','category':'getting-started','status':'draft'}
 else:value={k:article[k] for k in ['id','revision','title','body','category','status']}
 return {**value,**changes,'request_id':str(uuid.uuid4())}

check('Unsigned KB access rejected',call('reseller','kb_list',bad=True)[0]==401)
check('Admin sees seven categories',len(ok('admin','kb_list')['categories'])==7)
check('Reseller sees only six shared categories',len(ok('reseller','kb_list')['categories'])==6)
check('Private category cannot be requested directly',call('reseller','kb_list',{'category':'admin-guides'})[0]==403)
request=save();a=ok('admin','kb_save',request)
check('Native draft created with body preserved',a['body']==request['body'] and a['revision']==1)
check('Draft absent from reseller search',ok('reseller','kb_list',{'q':a['title']})['articles']==[])
check('Draft direct link denied to reseller',call('reseller','kb_detail',{'id':a['id']})[0]==403)
check('Reseller cannot write articles',call('reseller','kb_save',save(a))[0]==403)
same=ok('admin','kb_save',request)
check('Create retry returns same article and revision',same['id']==a['id'] and same['revision']==1)
check('Changed payload cannot reuse request ID',call('admin','kb_save',{**request,'body':'different'})[0]==400)
published=ok('admin','kb_save',save(a,status='published'))
check('Published article readable by reseller',ok('reseller','kb_detail',{'id':a['id']})['body']==request['body'])
check('Search finds title and body',len(ok('reseller','kb_list',{'q':a['title']})['articles'])==1 and any(x['id']==a['id'] for x in ok('reseller','kb_list',{'q':'setup step'})['articles']))
check('Stale edits rejected',call('admin','kb_save',save(a,body='overwrite stale'))[0]==409)
private=ok('admin','kb_save',save(published,category='admin-guides'))
check('Moving to private immediately revokes reseller access',call('reseller','kb_detail',{'id':a['id']})[0]==403)
check('Private title and body absent from reseller search',ok('reseller','kb_list',{'q':a['title']})['articles']==[])
archived=ok('admin','kb_save',save(private,category='getting-started',status='archived'))
check('Archived article hidden from reseller',call('reseller','kb_detail',{'id':a['id']})[0]==403)
check('Admin can retrieve archived articles',ok('admin','kb_detail',{'id':a['id']})['status']=='archived')
draft=ok('admin','kb_save',save(archived,status='draft'))
check('Archived article can return to draft',draft['status']=='draft')
check('Search injection does not expose articles',ok('reseller','kb_list',{'q':"%' OR 1=1 --"})['articles']==[])
report={'passed':checks,'ids':ids,'articles':articles,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
(root/'knowledge-test-result.json').write_text(json.dumps(report,indent=2));(root/'knowledge-test-result.json').chmod(0o600)
print(f'{len(checks)} knowledge-base checks passed; no emails sent.')
