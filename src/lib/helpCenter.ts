import {supabase} from '@/integrations/supabase/client';

export type HelpCategory={id:string;title:string;audience:'reseller'|'customer'|'admin';count:number};
export type HelpArticle={id:string;title:string;category:string;status:'draft'|'published'|'archived';revision:number;updated_at:string;body?:string};
export type HelpLibrary={admin:boolean;categories:HelpCategory[];articles:HelpArticle[];more:boolean};
export class HelpCenterError extends Error {constructor(message:string,public definite:boolean){super(message);}}
export async function helpApi<T>(action:string,input:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await supabase.functions.invoke('reseller-helpdesk',{body:{action,input}});
 if(error){
  let message='The Help Center could not confirm this request. Please try again.';
  try {const body=await error.context?.json();if(body?.error)message=body.error;}catch{/* retain safe fallback */}
  throw new HelpCenterError(message,[400,401,403,409,413,429].includes(error.context?.status));
 }
 return data as T;
}
