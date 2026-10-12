import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {MessageSquare} from 'lucide-react';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';

export function SupportBanner(){
 const {user}=useAuth();
 const {data}=useQuery({
  queryKey:['helpdesk',user?.id,'attention'],
  enabled:!!user,
  queryFn:async()=>{
   const {data,error}=await supabase.functions.invoke('reseller-helpdesk',{body:{action:'attention'}});
   if(error)throw error;
   return data as {queue:number;mine:number};
  },
  staleTime:60000,
  refetchInterval:120000,
  refetchIntervalInBackground:false,
  retry:false,
 });
 if(!data||!(data.queue+data.mine))return null;
 const base=user?.role==='admin'?'/admin/support':'/reseller/support';
 return <div role="status" className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
  <MessageSquare className="h-5 w-5 shrink-0" aria-hidden="true"/>
  <span className="font-medium">Support needs your reply</span>
  {data.queue>0&&<Link className="underline font-medium underline-offset-2" to={`${base}?scope=queue&needs=1`}>{data.queue} assigned {data.queue===1?'ticket':'tickets'}</Link>}
  {data.mine>0&&<Link className="underline font-medium underline-offset-2" to={`${base}?scope=mine&needs=1`}>{data.mine} {data.mine===1?'reply':'replies'} on your requests</Link>}
 </div>;
}
