import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.7";
import { createInquiryHandler } from "./handler.ts";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(Deno.env.get("SUPABASE_URL") || "", secret);
Deno.serve(createInquiryHandler(db, secret));
