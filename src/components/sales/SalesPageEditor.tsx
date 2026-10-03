import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useRefreshSales } from "@/hooks/useSalesWorkspace";
import type { SalesPage } from "@/lib/sales";
import { CopyText } from "./CopyText";
import { toast } from "sonner";
export function SalesPageEditor({ page }: { page: SalesPage | null }) {
  const [form, setForm] = useState({
    slug: page?.slug || `reseller-${crypto.randomUUID().slice(0, 8)}`,
    brand_name: page?.brand_name || "",
    headline: page?.headline || "Streaming subscriptions and setup support",
    description: page?.description || "",
    contact_email: page?.contact_email || "",
    accent_color: page?.accent_color || "#4f46e5",
    setup_notes: page?.setup_notes || "",
    tutorial_url: page?.tutorial_url || "",
    published: page?.published || false,
    public_details_confirmed: false,
  });
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshSales();
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_sales_page", {
        p_revision: page?.revision || 0,
        p_data: form,
      });
      if (error) throw error;
      await refresh();
      toast.success(
        form.published
          ? "Inquiry page published."
          : "Draft and setup instructions saved.",
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
        <CardTitle>Branded inquiry page & setup settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Choose the details customers may see. Pages start as drafts.
          Publishing makes your brand, description and contact email public;
          lead records and setup notes stay private.
        </p>
        {page?.published && (
          <div className="rounded border p-3 space-y-2">
            <a
              className="underline break-all"
              href={`/r/${page.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              https://reseller.eztvclub.com/r/{page.slug}
            </a>
            <CopyText
              text={`https://reseller.eztvclub.com/r/${page.slug}`}
              label="Copy inquiry page link"
            />
          </div>
        )}
        <form onSubmit={save} className="space-y-4">
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
            <div>
              <Label htmlFor="page-slug">Page address after /r/</Label>
              <Input
                id="page-slug"
                required
                pattern="[a-z0-9][a-z0-9-]{2,47}"
                maxLength={48}
                value={form.slug}
                disabled={busy || page?.published}
                onChange={(e) => set("slug", e.target.value.toLowerCase())}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens. Unpublish before
                changing a live address; old links will stop working.
              </p>
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
                required={form.published}
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
            <Label htmlFor="page-description">Public description</Label>
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
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => set("published", e.target.checked)}
            />
            Publish my inquiry page
          </label>
          {form.published && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={form.public_details_confirmed}
                onChange={(e) =>
                  set("public_details_confirmed", e.target.checked)
                }
              />
              I reviewed the public details and want customers to see them.
            </label>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? "Saving…"
              : form.published
                ? "Save and publish"
                : "Save draft & setup kit"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
