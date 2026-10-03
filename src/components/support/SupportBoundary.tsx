import { endSupportSession } from "@/lib/endSupportSession";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supportKey } from "@/integrations/supabase/client";
import { readSupportContext } from "@/lib/supportSession";
import { Button } from "@/components/ui/button";
export function SupportBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, isLoading } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!supportKey) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!supportKey || pathname === "/support/reseller") return <>{children}</>;
  const context = readSupportContext();
  const expired = !context || context.expires_at * 1000 <= now;
  const mismatch = !isLoading && user?.id !== context?.reseller_id;
  const exit = async () => {
    setBusy(true);
    setError("");
    try {
      await endSupportSession();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <aside
        className="sticky top-0 z-50 bg-amber-100 border-b border-amber-400 text-amber-950 p-3 flex flex-wrap gap-3 justify-between items-center"
        aria-label="Reseller support session"
      >
        <div>
          <p className="font-semibold">
            {expired ? "Support session expired" : `Acting as ${context.name}`}
          </p>
          <p className="text-sm">
            Changes affect this reseller’s live account and credits. Your admin
            tab remains signed in.
          </p>
          {!expired && (
            <p className="text-xs">
              Session ends at{" "}
              {new Date(context.expires_at * 1000).toLocaleTimeString()}.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <Button variant="outline" disabled={busy} onClick={exit}>
          {busy ? "Ending session…" : "Return to admin"}
        </Button>
      </aside>
      {expired || mismatch ? (
        <main className="p-6">
          <p>
            This support session is no longer available. Return to admin to open
            another one.
          </p>
        </main>
      ) : (
        children
      )}
    </>
  );
}
