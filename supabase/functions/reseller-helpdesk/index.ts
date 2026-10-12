import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import {helpdeskHandler} from './handler.ts';
import {notificationRoute} from './notifications.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(req=>req.headers.has('x-eztv-notification-signature') ? notificationRoute(req,db) : helpdeskHandler(db)(req));
