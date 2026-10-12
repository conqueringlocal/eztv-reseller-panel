import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRefreshSales } from "@/hooks/useSalesWorkspace";
import type { SalesWorkspace } from "@/lib/sales";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
export async function websiteAction(url: string, action: "verify" | "preview") {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again to manage your website.");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action }),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "The website service is unavailable. Try again shortly.",
    );
  return result as { success?: boolean; message?: string; html?: string };
}
export function WebsiteDomainSettings({ data }: { data: SalesWorkspace }) {
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const refresh = useRefreshSales();
  const domain = data.domain;
  const hosting = data.website_hosting;
  const ready =
    domain?.status === "ready" &&
    Date.parse(domain.valid_until || "") > Date.now();
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (error) {
      const text = (error as Error).message || "Please try again.";
      setMessage(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  };
  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const { error } = await supabase.rpc("connect_sales_domain", {
        p_hostname: host.trim().toLowerCase(),
      });
      if (error) throw error;
      toast.success("Domain saved. Add the DNS records below.");
    });
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied.");
    } catch {
      toast.error("Copy failed. Select and copy the value manually.");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your domain</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your page stays private until you connect your own domain and publish
          it. You can use your main domain or an address such as
          www.yourbusiness.com.
        </p>
        {!hosting?.enabled ? (
          <p role="status">
            Domain hosting is being configured. You can keep saving your private
            draft.
          </p>
        ) : !data.page ? (
          <p>Save your website draft below before connecting a domain.</p>
        ) : !domain ? (
          <form onSubmit={connect} className="space-y-3">
            <Label htmlFor="website-domain">Your domain name</Label>
            <Input
              id="website-domain"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="www.yourbusiness.com"
              required
              maxLength={253}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Enter only the domain name, without https:// or a page path.
              Choose an address that is not serving another website.
            </p>
            <Button disabled={busy || !host.trim()}>Connect domain</Button>
          </form>
        ) : (
          <>
            <div className="rounded border p-4 space-y-2">
              <p className="font-semibold break-all">{domain.hostname}</p>
              <p role="status">
                {ready
                  ? "Domain connected · HTTPS ready"
                  : domain.status === "dns_verified"
                    ? "Preparing HTTPS"
                    : "Waiting for DNS verification"}
              </p>
              <p className="text-sm text-muted-foreground">{domain.message}</p>
              {domain.checked_at && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {new Date(domain.checked_at).toLocaleString()}
                </p>
              )}
            </div>
            <p className="text-sm">
              At your domain provider, add these two records. Keep the TXT
              record in place so we can continue verifying ownership.
            </p>
            <div className="space-y-3">
              {[
                { type: "A", name: domain.hostname, value: hosting.ipv4 || "" },
                {
                  type: "TXT",
                  name: `_reseller-site.${domain.hostname}`,
                  value: domain.verification_token,
                },
              ].map((record) => (
                <div
                  key={record.type}
                  className="rounded border p-3 text-sm space-y-2"
                >
                  <p className="font-semibold">{record.type} record</p>
                  <p className="break-all">
                    Name: <code>{record.name}</code>
                  </p>
                  <p className="break-all">
                    Value: <code>{record.value}</code>
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(record.value)}
                  >
                    Copy {record.type} value
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Some DNS providers append your domain automatically; enter only
              the host portion there (use @ for the main domain). Remove
              conflicting A/AAAA records at this exact address. If you use
              Cloudflare DNS, select DNS only. Changes can take time to appear.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await websiteAction(
                      hosting.management_url!,
                      "verify",
                    );
                    setMessage(result.message || "Connection checked.");
                  })
                }
              >
                {busy ? "Checking…" : "Check connection"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRemoving(true)}
              >
                Disconnect domain
              </Button>
            </div>
            {removing && (
              <div className="rounded border border-amber-400 p-3 space-y-3">
                <p>
                  Disconnect {domain.hostname}? Your page will immediately
                  become unpublished. Your draft and leads will be kept.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const { error } = await supabase.rpc(
                          "disconnect_sales_domain",
                        );
                        if (error) throw error;
                        setRemoving(false);
                        setPreview("");
                        toast.success(
                          "Domain disconnected. Your page is private.",
                        );
                      })
                    }
                  >
                    Disconnect and unpublish
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setRemoving(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {data.page.published && ready && (
              <a
                className="block underline break-all"
                href={`https://${domain.hostname}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit your published website ↗
              </a>
            )}
          </>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {data.page && hosting?.enabled && hosting.management_url && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await websiteAction(
                  hosting.management_url!,
                  "preview",
                );
                setPreview(result.html || "");
              })
            }
          >
            Preview saved page
          </Button>
        )}
        {preview && (
          <div className="space-y-2">
            <p className="text-sm">
              Private preview of your last saved content. Save changes below to
              update it.
            </p>
            <iframe
              title="Private website preview"
              sandbox=""
              srcDoc={preview}
              className="w-full h-[650px] rounded border bg-white"
            />
            <Button variant="outline" onClick={() => setPreview("")}>
              Close preview
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
