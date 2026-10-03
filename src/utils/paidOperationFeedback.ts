export function paidOperationFailure(result?:{requestId?:string;code?:string;error?:string}):string{
 const reference=result?.requestId&&/^[0-9a-f-]{36}$/i.test(result.requestId)?` Reference: ${result.requestId}.`:'';
 if(result?.code==='insufficient_credits')return 'You do not have enough credits for this operation.';
 if(result?.code==='recently_completed')return `These connections were already changed within the last 24 hours. Contact support if another change is needed.${reference}`;
 return `The provider result needs review. Do not submit the operation again; contact support.${reference}`;
}

export function paidOperationKey(kind:string,customerId:string,months:number,connection?:number):string{
 const storageKey=`eztv:paid:${kind}:${customerId}:${connection||0}:${months}`;
 const existing=localStorage.getItem(storageKey);if(existing)return existing;
 const id=crypto.randomUUID();localStorage.setItem(storageKey,id);return id;
}
export function clearPaidOperationKey(kind:string,customerId:string,months:number,connection?:number){
 localStorage.removeItem(`eztv:paid:${kind}:${customerId}:${connection||0}:${months}`);
}
