import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import { createHandler } from '../_shared/paypal-credits/handler.ts';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createHandler(db, async () => null, (key) => Deno.env.get(key), true));
