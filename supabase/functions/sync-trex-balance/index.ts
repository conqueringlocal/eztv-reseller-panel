import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.7';
import { createBalanceHandler } from './handler.ts';
const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
Deno.serve(createBalanceHandler(db, name => Deno.env.get(name)));
