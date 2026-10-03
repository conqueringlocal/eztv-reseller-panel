import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.7";
import { createSportsHandler } from "./handler.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(createSportsHandler(db));
