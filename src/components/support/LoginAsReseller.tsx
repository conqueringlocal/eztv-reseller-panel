import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
export function LoginAsReseller({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const open = () => {
    if (busy) return;
    const tab = crypto.randomUUID();
    const child = window.open(`/support/reseller?tab=${tab}`, "_blank");
    if (!child) {
      toast.error("Allow pop-ups for this site, then try again.");
      return;
    }
    setBusy(true);
    let started = false;
    const cleanup = () => {
      window.removeEventListener("message", receive);
      clearTimeout(timer);
      setBusy(false);
    };
    const receive = async (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== child ||
        event.data?.type !== "eztv-support-ready" ||
        event.data?.tab !== tab ||
        started
      )
        return;
      started = true;
      try {
        const { data, error } = await supabase.functions.invoke(
          "admin-reseller-session",
          { body: { action: "start", reseller_id: id } },
        );
        if (error || !data?.success) {
          let message =
            "Could not open the reseller panel. Try again from this admin tab.";
          if (
            error &&
            "context" in error &&
            error.context instanceof Response
          ) {
            try {
              const body = await error.context.json();
              if (typeof body.error === "string") message = body.error;
            } catch {
              /* use fallback */
            }
          }
          throw new Error(message);
        }
        if (child.closed) {
          await supabase.functions.invoke("admin-reseller-session", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
            body: { action: "end" },
          });
          throw new Error("The reseller tab was closed. Please open it again.");
        }
        child.postMessage(
          { type: "eztv-support-session", tab, ...data },
          location.origin,
        );
      } catch (error) {
        const message = (error as Error).message;
        child.postMessage(
          { type: "eztv-support-error", tab, message },
          location.origin,
        );
        toast.error(message);
      } finally {
        cleanup();
      }
    };
    window.addEventListener("message", receive);
    const timer = setTimeout(() => {
      if (!started) {
        cleanup();
        toast.error(
          "The reseller tab did not connect. Close it and try again.",
        );
      }
    }, 20000);
  };
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={open}
      title={`Open ${name}'s live panel in a separate tab`}
    >
      {busy ? "Opening…" : "Log in as reseller"}
    </Button>
  );
}
