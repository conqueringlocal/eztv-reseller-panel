import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import { createHandler } from '../_shared/paypal-credits/handler.ts';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, options);
Deno.serve(createHandler(db, async (jwt) => {
 const { data, error } = await auth.auth.getUser(jwt);
 return error ? null : data.user?.id || null;
}, (key) => Deno.env.get(key)));
