import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.7";
import { createSupportHandler } from "./handler.ts";
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const url = Deno.env.get("SUPABASE_URL")!;
const db = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  options,
);
Deno.serve(
  createSupportHandler(db, () =>
    createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, options),
  ),
);
