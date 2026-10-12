import {useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link,useSearchParams} from 'react-router-dom';
import {BookOpen,ArrowLeft,Plus,Search} from 'lucide-react';
import {DashboardLayout} from '@/components/layout/DashboardLayout';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {HelpArticle,HelpCategory,HelpLibrary,HelpCenterError,helpApi} from '@/lib/helpCenter';

function ArticleEditor({article,categories,onSaved,onCancel}:{article:HelpArticle;categories:HelpCategory[];onSaved:(article:HelpArticle)=>void;onCancel:()=>void}){
 const [title,setTitle]=useState(article.title),[body,setBody]=useState(article.body||''),[category,setCategory]=useState(article.category||categories[0]?.id||'');
 const pending=useRef<Record<string,unknown>|null>(null);const [uncertain,setUncertain]=useState(false);
 const save=useMutation({mutationFn:(input:Record<string,unknown>)=>helpApi<HelpArticle>('kb_save',input),onSuccess:onSaved,onError:(error)=>{
  const definite=error instanceof HelpCenterError&&error.definite;setUncertain(!definite);if(definite)pending.current=null;
 }});
 function submit(status:HelpArticle['status']){
  if(save.isPending)return;
  pending.current??={id:article.id,revision:article.revision,request_id:crypto.randomUUID(),title,body,category,status};
  save.mutate(pending.current);
 }
 const disabled=save.isPending||uncertain;const selected=categories.find(c=>c.id===category);
 return <Card><CardHeader><CardTitle>{article.revision?'Edit article':'New article'}</CardTitle></CardHeader><CardContent>
  <form className="space-y-4" onSubmit={e=>{e.preventDefault();submit('draft');}}>
   {save.error&&<Alert variant="destructive"><AlertDescription>{save.error.message}{uncertain?' Retry the same save below.':''}</AlertDescription></Alert>}
   <div><Label htmlFor="article-title">Title</Label><Input id="article-title" value={title} maxLength={180} required disabled={disabled} onChange={e=>setTitle(e.target.value)}/></div>
   <div><Label htmlFor="article-category">Category</Label><select id="article-category" className="w-full border rounded-md p-2 bg-white" value={category} disabled={disabled} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
   <p className="text-sm text-gray-600">{selected?.audience==='admin'?'Private admin guide. Resellers cannot see this article.':selected?.audience==='customer'?'Customer guidance for signed-in resellers to use when helping their customers.':'Reseller guide. Publishing makes it available to signed-in resellers.'}</p>
   <div><Label htmlFor="article-body">Article content</Label><Textarea id="article-body" rows={15} value={body} maxLength={50000} required disabled={disabled} onChange={e=>setBody(e.target.value)}/><p className="text-sm text-gray-500 mt-1">Use plain text, short headings, and numbered steps. Line breaks are preserved.</p></div>
   {article.status==='published'&&<p className="text-sm text-amber-800">Saving as a draft or archiving will remove this article from reseller view. Publish updates to keep it available.</p>}
   <div className="flex flex-wrap gap-2">
    {uncertain?<Button type="button" disabled={save.isPending} onClick={()=>pending.current&&save.mutate(pending.current)}>Retry same save</Button>:<>
     <Button type="submit" variant="outline" disabled={disabled||!title.trim()||!body.trim()}>Save draft</Button>
     <Button type="button" disabled={disabled||!title.trim()||!body.trim()} onClick={()=>submit('published')}>{selected?.audience==='admin'?'Publish for admins':article.status==='published'?'Publish updates':'Publish article'}</Button>
     {article.revision>0&&article.status!=='archived'&&<Button type="button" variant="outline" disabled={disabled} onClick={()=>submit('archived')}>Archive article</Button>}
    </>}
    <Button type="button" variant="ghost" disabled={disabled} onClick={onCancel}>Cancel</Button>
   </div>
  </form>
 </CardContent></Card>;
}

export default function HelpCenter(){
 const {user}=useAuth(),query=useQueryClient();const [params,setParams]=useSearchParams();
 const id=params.get('article');const category=params.get('category')||'',search=params.get('q')||'';
 const [searchText,setSearchText]=useState(search),[editing,setEditing]=useState<HelpArticle|null>(null),[offset,setOffset]=useState(0);
 const key=['help-center',user?.id,user?.role];
 const library=useQuery({queryKey:[...key,'list',category,search,offset],queryFn:()=>helpApi<HelpLibrary>('kb_list',{category,q:search,offset}),enabled:!!user,retry:false});
 const detail=useQuery({queryKey:[...key,'article',id],queryFn:()=>helpApi<HelpArticle>('kb_detail',{id}),enabled:!!user&&!!id,retry:false});
 const admin=library.data?.admin===true;const article=detail.data;const error=library.error||detail.error;
 function navigate(next:Record<string,string>){setEditing(null);setOffset(0);setParams(next);}
 function saved(article:HelpArticle){setEditing(null);query.setQueryData([...key,'article',article.id],article);void query.invalidateQueries({queryKey:['help-center']});setParams({article:article.id});}
 const base=user?.role==='admin'?'/admin':'/reseller';
 return <DashboardLayout><div className="mx-auto max-w-5xl space-y-6">
  <header className="flex flex-wrap justify-between items-start gap-3"><div><h1 className="text-2xl font-bold flex gap-2 items-center"><BookOpen aria-hidden="true"/>Help Center</h1><p className="text-gray-600 mt-1">Guides and answers for your reseller business.</p></div>
   {admin&&!editing&&<Button onClick={()=>setEditing({id:crypto.randomUUID(),title:'',category:category||library.data.categories[0]?.id||'',status:'draft',revision:0,updated_at:'',body:''})}><Plus className="mr-2 h-4 w-4"/>New article</Button>}
  </header>
  {error&&<Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
  {library.isLoading&&<p role="status">Loading Help Center…</p>}
  {editing&&admin?<ArticleEditor key={editing.id+'-'+editing.revision} article={editing} categories={library.data.categories} onSaved={saved} onCancel={()=>setEditing(null)}/>:<>
   {(id||category||search)&&<Button variant="outline" onClick={()=>{setSearchText('');navigate({});}}><ArrowLeft className="h-4 w-4 mr-2"/>All guides</Button>}
   {id? <>
    {detail.isLoading&&<p role="status">Loading article…</p>}
    {!detail.error&&article&&<Card><CardHeader><CardTitle className="break-words">{article.title}</CardTitle><p className="text-sm text-gray-500">{library.data?.categories.find(c=>c.id===article.category)?.title} · Updated {new Date(article.updated_at).toLocaleDateString()}{admin?` · ${article.status}`:''}</p></CardHeader><CardContent className="space-y-5"><div className="whitespace-pre-wrap break-words leading-relaxed">{article.body}</div>{admin&&<Button variant="outline" onClick={()=>setEditing(article)}>Edit article</Button>}</CardContent></Card>}
   </>: <>
    <form className="flex gap-2" onSubmit={e=>{e.preventDefault();navigate({...category?{category}:{},...searchText.trim()?{q:searchText.trim()}:{}});}}><Label htmlFor="help-search" className="sr-only">Search guides</Label><Input id="help-search" placeholder="Search guides…" value={searchText} maxLength={120} onChange={e=>setSearchText(e.target.value)}/><Button type="submit"><Search className="h-4 w-4 mr-2"/>Search</Button></form>
    {!category&&!search&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{library.data?.categories.map(c=><button key={c.id} className="rounded-lg border bg-white p-5 text-left hover:border-brand-primary" onClick={()=>navigate({category:c.id})}><span className="font-semibold">{c.title}</span><p className="text-sm text-gray-600 mt-2">{c.count} {c.count===1?'article':'articles'}{c.audience==='admin'?' · Admin only':c.audience==='customer'?' · Customer guidance':''}</p></button>)}</div>}
    {library.data?.articles.length===0&&<Card><CardContent className="py-8 text-center"><p className="font-medium">{search?'No matching articles':'Articles are being prepared'}</p><p className="text-gray-600 mt-2">{admin?'Use New article to save a draft. Publish it when it is ready for its audience.':'We’re building this library. You can still open a support ticket when you need help.'}</p></CardContent></Card>}
    <div className="space-y-3">{library.data?.articles.map(a=><button key={a.id} className="block w-full text-left border rounded-lg p-4 bg-white hover:border-brand-primary" onClick={()=>navigate({article:a.id})}><span className="font-semibold break-words">{a.title}</span><p className="text-sm text-gray-500 mt-1">{library.data.categories.find(c=>c.id===a.category)?.title}{admin?` · ${a.status}`:''}</p></button>)}</div>
    <div className="flex gap-2">{offset>0&&<Button variant="outline" onClick={()=>setOffset(v=>Math.max(0,v-50))}>Previous</Button>}{library.data?.more&&<Button variant="outline" onClick={()=>setOffset(v=>v+50)}>Next</Button>}</div>
   </>}
   <p className="text-sm text-gray-600">Need more help? <Link className="underline text-brand-primary" to={`${base}/support`}>Open Support</Link>.</p>
  </>}
 </div></DashboardLayout>;
}
