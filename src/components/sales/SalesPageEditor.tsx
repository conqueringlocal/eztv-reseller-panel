import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useRefreshSales } from "@/hooks/useSalesWorkspace";
import type { SalesPage } from "@/lib/sales";
import { WebsiteLogoPicker } from "./WebsiteLogoPicker";
import { WebsiteContentEditor } from "./WebsiteContentEditor";
import { websiteContent } from "@/lib/websiteContent";
import { toast } from "sonner";
export function SalesPageEditor({
  page,
  domainReady,
}: {
  page: SalesPage | null;
  domainReady: boolean;
}) {
  const [form, setForm] = useState(() => ({
    public_content: websiteContent(page?.public_content),
    logo_data_url: page?.logo_data_url || "",
    slug: page?.slug || `reseller-${crypto.randomUUID().slice(0, 8)}`,
    brand_name: page?.brand_name || "",
    headline: page?.headline || "Streaming subscriptions and setup support",
    description: page?.description || "",
    contact_email: page?.contact_email || "",
    accent_color: page?.accent_color || "#4f46e5",
    setup_notes: page?.setup_notes || "",
    tutorial_url: page?.tutorial_url || "",
    published: false,
    public_details_confirmed: false,
  }));
  const [saving, setBusy] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const busy = saving || logoLoading;
  const refresh = useRefreshSales();
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const publish =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "publish";
    if (
      publish &&
      (!domainReady ||
        !form.public_details_confirmed ||
        !form.contact_email.trim())
    ) {
      toast.error(
        "Connect your domain, add a contact email, and confirm your public details before publishing.",
      );
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_sales_page", {
        p_revision: page?.revision || 0,
        p_data: { ...form, published: publish },
      });
      if (error) throw error;
      await refresh();
      toast.success(
        publish
          ? "Your website is published on your domain."
          : "Private draft and setup instructions saved. Your page is unpublished.",
      );
    } catch (error) {
      toast.error(
        (error as Error).message ||
          "Save not confirmed. Refresh your settings.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your website & setup settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
          <p className="font-semibold">
            {page?.published && domainReady
              ? "Your website is published"
              : "Your website is private"}
          </p>
          <p className="text-sm text-muted-foreground">
            Save your branding below, connect your domain above, then publish
            when you’re ready. Setup instructions and tutorial links stay in
            your private setup kit.
          </p>
        </div>
        <form onSubmit={save} className="space-y-4">
          <WebsiteLogoPicker
            value={form.logo_data_url}
            brand={form.brand_name}
            disabled={saving}
            onBusyChange={setLogoLoading}
            onChange={(value) => set("logo_data_url", value)}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="page-brand">Business / brand name</Label>
              <Input
                id="page-brand"
                required
                minLength={2}
                maxLength={80}
                value={form.brand_name}
                disabled={busy}
                onChange={(e) => set("brand_name", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="page-headline">Headline</Label>
              <Input
                id="page-headline"
                required
                minLength={2}
                maxLength={160}
                value={form.headline}
                disabled={busy}
                onChange={(e) => set("headline", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="page-contact">
                Public customer contact email
              </Label>
              <Input
                id="page-contact"
                type="email"
                required={false}
                value={form.contact_email}
                disabled={busy}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="page-color">Brand accent color</Label>
              <Input
                id="page-color"
                type="color"
                value={form.accent_color}
                disabled={busy}
                onChange={(e) => set("accent_color", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="page-description">Website description</Label>
            <textarea
              id="page-description"
              className="w-full rounded border p-3 text-sm"
              rows={4}
              maxLength={1200}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe your setup help and how customers can ask about options. Only include claims you can support."
            />
          </div>
          <WebsiteContentEditor
            value={form.public_content}
            disabled={busy}
            onChange={(public_content) =>
              setForm((f) => ({ ...f, public_content }))
            }
          />
          <div>
            <Label htmlFor="page-setup">
              Private setup instructions for your setup kit
            </Label>
            <textarea
              id="page-setup"
              className="w-full rounded border p-3 text-sm"
              rows={5}
              maxLength={6000}
              value={form.setup_notes}
              onChange={(e) => set("setup_notes", e.target.value)}
              placeholder="Approved app, device-specific steps and support process. Do not store customer credentials here."
            />
          </div>
          <div>
            <Label htmlFor="page-video">
              Your tutorial video or guide URL (optional, HTTPS)
            </Label>
            <Input
              id="page-video"
              type="url"
              pattern="https://.*"
              value={form.tutorial_url}
              onChange={(e) => set("tutorial_url", e.target.value)}
            />
          </div>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.public_details_confirmed}
              onChange={(e) =>
                set("public_details_confirmed", e.target.checked)
              }
            />
            <span>
              I reviewed my logo, brand, page content and customer contact email
              for public display.
            </span>
          </label>
          {!domainReady && (
            <p className="text-sm text-muted-foreground">
              Publishing unlocks after your domain and HTTPS connection are
              verified.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              value="draft"
              variant="outline"
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : page?.published
                  ? "Unpublish & save draft"
                  : "Save private draft & setup kit"}
            </Button>
            <Button
              type="submit"
              value="publish"
              disabled={
                busy ||
                !domainReady ||
                !form.public_details_confirmed ||
                !form.contact_email.trim()
              }
            >
              {page?.published
                ? "Save & keep published"
                : "Publish on my domain"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
