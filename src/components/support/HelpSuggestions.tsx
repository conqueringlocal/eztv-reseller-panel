import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {HelpLibrary,helpApi} from '@/lib/helpCenter';

export function HelpSuggestions({subject}:{subject:string}){
 const {user}=useAuth();const [search,setSearch]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setSearch(subject.trim().slice(0,120)),600);return()=>clearTimeout(timer);},[subject]);
 const {data}=useQuery({queryKey:['help-center',user?.id,user?.role,'suggestions',search],queryFn:()=>helpApi<HelpLibrary>('kb_list',{q:search}),enabled:!!user&&search.length>=3,staleTime:60000,retry:false});
 const base=user?.role==='admin'?'/admin/help':'/reseller/help';
 return <div className="rounded-md border bg-gray-50 p-3 text-sm">
  <p>Before opening a ticket, you can <Link className="underline text-brand-primary" to={base} target="_blank" rel="noopener noreferrer">search the Help Center</Link>.</p>
  {search.length>=3&&data?.articles.slice(0,3).map(a=><Link key={a.id} className="block underline text-brand-primary mt-2 break-words" to={`${base}?article=${a.id}`} target="_blank" rel="noopener noreferrer">{a.title}</Link>)}
 </div>;
}
