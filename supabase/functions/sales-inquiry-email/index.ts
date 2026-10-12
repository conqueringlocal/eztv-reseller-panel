import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.7";
import nodemailer from "npm:nodemailer@10.1.0";
import { inquiryEmailHandler } from "./handler.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const user = Deno.env.get("EZTV_CUSTOMER_EMAIL_USER"),
  pass = Deno.env.get("EZTV_CUSTOMER_EMAIL_PASSWORD");
const transport = nodemailer.createTransport({
  host: "my.mailbux.com",
  port: 465,
  secure: true,
  auth: { user, pass },
  tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
  connectionTimeout: 8000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
  disableFileAccess: true,
  disableUrlAccess: true,
  logger: false,
  debug: false,
});
Deno.serve(
  inquiryEmailHandler(db, {
    configured: user === "noreply@eztvclub.com" && !!pass,
    verify: async () => {
      await transport.verify();
    },
    send: async (message) => {
      const result = await transport.sendMail(message);
      if (result.rejected?.length || result.accepted?.length !== 1)
        throw new Error("smtp_recipient_not_accepted");
    },
  }),
);
