import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, supportKey } from "@/integrations/supabase/client";
import {
  supportContextKey,
  supportMarker,
  clearSupportStorage,
} from "@/lib/supportSession";
import { Button } from "@/components/ui/button";
export default function SupportReseller() {
  const [error, setError] = useState("");
  const handled = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    const opener = window.opener,
      tab = sessionStorage.getItem(supportMarker);
    if (!supportKey || !opener || !tab) {
      setError(
        "Open this panel using “Log in as reseller” from your admin account.",
      );
      return;
    }
    const receive = async (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== opener ||
        event.data?.tab !== tab ||
        handled.current
      )
        return;
      if (event.data.type === "eztv-support-error") {
        setError(event.data.message);
        return;
      }
      if (event.data.type !== "eztv-support-session") return;
      handled.current = true;
      clearTimeout(timeout);
      try {
        const { support, session } = event.data;
        if (
          !support?.reseller_id ||
          !session?.access_token ||
          support.expires_at <= Date.now() / 1000
        )
          throw new Error("The support session could not be verified.");
        const result = await supabase.auth.setSession(session);
        if (result.error || result.data.user?.id !== support.reseller_id)
          throw new Error("The reseller session could not be started.");
        sessionStorage.setItem(supportContextKey, JSON.stringify(support));
        window.opener = null;
        navigate("/reseller", { replace: true });
      } catch (error) {
        // A failed browser handoff must not leave a renewable support login behind.
        const token = event.data.session?.access_token;
        if (token)
          await supabase.functions
            .invoke("admin-reseller-session", {
              headers: { Authorization: `Bearer ${token}` },
              body: { action: "end" },
            })
            .catch(() => {});
        if (supportKey) sessionStorage.removeItem(supportKey);
        setError((error as Error).message);
      }
    };
    window.addEventListener("message", receive);
    opener.postMessage({ type: "eztv-support-ready", tab }, location.origin);
    const timeout = setTimeout(
      () =>
        setError(
          "The support session did not start. Return to your admin tab and try again.",
        ),
      45000,
    );
    return () => {
      window.removeEventListener("message", receive);
      clearTimeout(timeout);
    };
  }, [navigate]);
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Reseller support login</h1>
        <p role={error ? "alert" : "status"}>
          {error ||
            "Opening the reseller’s live panel. Your admin tab stays signed in."}
        </p>
        {error && (
          <Button
            onClick={() => {
              if (supportKey) clearSupportStorage(supportKey);
              location.replace("/admin/resellers");
            }}
          >
            Return to admin
          </Button>
        )}
      </div>
    </main>
  );
}
