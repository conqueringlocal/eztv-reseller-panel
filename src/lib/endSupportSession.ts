import { supabase, supportKey } from "@/integrations/supabase/client";
import { readSupportContext, clearSupportStorage } from "@/lib/supportSession";
export async function endSupportSession() {
  if (!supportKey) return;
  const context = readSupportContext();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && (!context || context.expires_at > Date.now() / 1000)) {
    const result = await supabase.functions.invoke("admin-reseller-session", {
      body: { action: "end" },
    });
    if (result.error || !result.data?.success)
      throw new Error(
        "Sign-out could not be confirmed. Please retry Return to admin.",
      );
  }
  clearSupportStorage(supportKey);
  location.replace("/admin/resellers");
}
