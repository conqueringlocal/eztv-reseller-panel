import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Reseller } from '../types';
export const useCredits = (_resellers:Reseller[],_setResellers:React.Dispatch<React.SetStateAction<Reseller[]>>,refreshData:()=>Promise<void>)=>{
 const adjust=useCallback(async(resellerId:string,delta:number,notes?:string)=>{
  const key=`credit-adjustment:${resellerId}:${delta}:${notes||''}`;
  // Retain the same operation reference across a timeout or browser reload.
  const id=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,id);
  const {error}=await supabase.rpc('adjust_reseller_credits',{p_id:id,p_reseller:resellerId,p_delta:delta,p_notes:notes?.trim()||'Manual administrator adjustment'});
  if(error){toast.error('Adjustment could not be confirmed. Check the credit log before retrying.');return false;}
  sessionStorage.removeItem(key);await refreshData();window.dispatchEvent(new CustomEvent('creditsUpdated'));return true;
 },[refreshData]);
 return {addCredits:useCallback((id:string,n:number,notes?:string)=>Number.isInteger(n)&&n>0?adjust(id,n,notes):Promise.resolve(false),[adjust]),removeCredits:useCallback((id:string,n:number,notes?:string)=>Number.isInteger(n)&&n>0?adjust(id,-n,notes):Promise.resolve(false),[adjust])};
};
