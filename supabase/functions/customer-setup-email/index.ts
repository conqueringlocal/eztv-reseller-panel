import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import nodemailer from 'npm:nodemailer@10.1.0';
import {createEmailHandler} from '../_shared/customer-email/handler.ts';
import {sender} from '../_shared/customer-email/message.ts';
const options={auth:{persistSession:false,autoRefreshToken:false}};
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options);
const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,options);
const user=Deno.env.get('EZTV_CUSTOMER_EMAIL_USER'),pass=Deno.env.get('EZTV_CUSTOMER_EMAIL_PASSWORD');
// Supabase blocks outbound port 587. Mailbux's implicit TLS listener uses 465.
const transport=nodemailer.createTransport({host:'my.mailbux.com',port:465,secure:true,
 auth:{user,pass},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
 connectionTimeout:8000,greetingTimeout:5000,socketTimeout:10000,
 disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
Deno.serve(createEmailHandler(db,async(jwt)=>{
 const {data,error}=await auth.auth.getUser(jwt);return error?null:data.user?.id||null;
},{configured:user===sender&&!!pass,verify:async()=>{await transport.verify();},send:async(message)=>{
 const result=await transport.sendMail(message);
 if(result.rejected?.length || result.accepted?.length!==1)throw new Error('smtp_recipient_not_accepted');
}}));
