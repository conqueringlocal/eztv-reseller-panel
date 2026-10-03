import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreditLogTable } from '@/components/credits/CreditLogTable';
import { SubResellerCreditsView } from '@/components/credits/SubResellerCreditsView';
import { ManualCreditRequests } from '@/components/credits/ManualCreditRequests';
import { CreditsBadge } from '@/components/dashboard/CreditsBadge';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
export default function ResellerCredits(){
 const {user}=useAuth();const {creditLogs}=useApp();
 const [info,setInfo]=useState<{credit_purchase_enabled:boolean;parent_reseller_id:string|null;credit_price_per_unit:number|null}|null>(null);
 useEffect(()=>{if(user?.id)void supabase.from('profiles').select('credit_purchase_enabled,parent_reseller_id,credit_price_per_unit').eq('id',user.id).single().then(({data})=>setInfo(data));},[user?.id]);
 return <DashboardLayout><div className="mb-6 flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Credits & Usage</h1><p className="text-muted-foreground">Request credits and track your account activity.</p></div><CreditsBadge credits={user?.credits||0}/></div>
 {info?.credit_purchase_enabled?<ManualCreditRequests/>:info?.parent_reseller_id?<SubResellerCreditsView userCredits={user?.credits||0} parentResellerId={info.parent_reseller_id} creditPricePerUnit={info.credit_price_per_unit||3}/>:<p className="mb-6">Contact your administrator for credit purchasing access.</p>}
 {new URLSearchParams(window.location.search).has('token')&&<p role="alert">Returning from an older checkout? If you were charged, contact support with that payment reference. Do not pay again.</p>}
 <CreditLogTable logs={creditLogs.filter(log=>log.reseller_id===user?.id)} filter="all"/></DashboardLayout>;
}
