import { useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicSalesPage } from "@/lib/sales";
export default function PublicSalesInquiry() {
  const { slug = "" } = useParams();
  return <InquiryForm key={slug} slug={slug} />;
}
function InquiryForm({ slug }: { slug: string }) {
  const [params] = useSearchParams();
  const requestId = useRef(crypto.randomUUID());
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    device: "",
    message: "",
    contact_consent: false,
    marketing_consent: false,
    website: "",
  });
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["public-sales-page", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_sales_page", {
        p_slug: slug,
      });
      if (error) throw error;
      return data as unknown as PublicSalesPage | null;
    },
    retry: 1,
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || sent) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "public-sales-inquiry",
        {
          body: {
            ...form,
            id: requestId.current,
            slug,
            referral: params.get("ref"),
          },
        },
      );
      if (error) {
        let message =
          "We could not confirm your inquiry. Please retry this form or contact the reseller by email.";
        if ("context" in error && error.context instanceof Response) {
          try {
            const body = await error.context.json();
            if (typeof body.error === "string") message = body.error;
          } catch {
            /* Keep safe fallback. */
          }
        }
        throw new Error(message);
      }
      if (!data?.success)
        throw new Error(
          "Your inquiry could not be confirmed. Please try again.",
        );
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (query.isPending)
    return (
      <main className="min-h-screen flex justify-center items-center p-6">
        <p role="status">Loading inquiry page…</p>
      </main>
    );
  if (query.isError || !query.data)
    return (
      <main className="min-h-screen flex justify-center items-center p-6">
        <div>
          <h1 className="text-2xl font-bold">Page unavailable</h1>
          <p className="mt-3">
            This page is not published or could not be loaded. Please check the
            link with your reseller.
          </p>
          {query.isError && (
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          )}
        </div>
      </main>
    );
  const page = query.data;
  return (
    <main className="min-h-screen bg-slate-50">
      <div style={{ backgroundColor: page.accent_color }} className="h-2" />
      <div className="max-w-5xl mx-auto px-5 py-10 sm:py-16">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            {page.brand_name}
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold mt-4 max-w-3xl text-slate-950 leading-tight">
            {page.headline}
          </h1>
          {page.description && (
            <p className="mt-6 text-lg text-slate-600 whitespace-pre-wrap max-w-3xl">
              {page.description}
            </p>
          )}
        </header>
        <div className="grid lg:grid-cols-[1fr_2fr] gap-8 items-start">
          <aside className="space-y-4 text-sm text-slate-600">
            <h2 className="text-lg font-semibold text-slate-900">
              What happens next
            </h2>
            <p>
              Tell us about your device and what you need. {page.brand_name}{" "}
              will respond to confirm compatibility, available options and
              pricing.
            </p>
            <p>
              Submitting an inquiry does not start a trial, purchase a
              subscription or authorize a payment.
            </p>
            <p>
              Contact:{" "}
              <a
                className="underline break-all"
                href={`mailto:${page.contact_email}`}
              >
                {page.contact_email}
              </a>
            </p>
          </aside>
          <section className="rounded-2xl border bg-white p-5 sm:p-8 shadow-sm">
            <h2 className="text-2xl font-semibold mb-5">
              Ask about service & setup
            </h2>
            {sent ? (
              <div role="status" className="space-y-3">
                <p className="font-semibold">Your inquiry has been received.</p>
                <p className="text-sm text-slate-600">
                  The reseller will respond using the details you provided.
                  Please do not send payment until your options and price have
                  been confirmed.
                </p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                {(
                  [
                    ["name", "Your name", "text", 100],
                    ["email", "Email address", "email", 254],
                    ["phone", "Phone (optional)", "tel", 40],
                    ["device", "Device / app you use (optional)", "text", 100],
                  ] as const
                ).map(([key, label, type, max]) => (
                  <div key={key}>
                    <Label htmlFor={`inquiry-${key}`}>{label}</Label>
                    <Input
                      id={`inquiry-${key}`}
                      type={type}
                      autoComplete={
                        key === "name"
                          ? "name"
                          : key === "email"
                            ? "email"
                            : key === "phone"
                              ? "tel"
                              : "off"
                      }
                      required={key === "name" || key === "email"}
                      minLength={key === "name" ? 2 : undefined}
                      maxLength={max}
                      value={form[key]}
                      disabled={busy}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
                <div>
                  <Label htmlFor="inquiry-message">
                    How can we help? (optional)
                  </Label>
                  <textarea
                    id="inquiry-message"
                    className="w-full rounded border p-3 text-sm"
                    rows={4}
                    maxLength={1000}
                    value={form.message}
                    disabled={busy}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, message: e.target.value }))
                    }
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Please do not include passwords, playlist links or payment
                    card details.
                  </p>
                </div>
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="inquiry-website">Website</label>
                  <input
                    id="inquiry-website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, website: e.target.value }))
                    }
                  />
                </div>
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    required
                    checked={form.contact_consent}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        contact_consent: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    I request a response from {page.brand_name} about this
                    inquiry. My details will be stored in their private reseller
                    dashboard for this purpose.
                  </span>
                </label>
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.marketing_consent}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        marketing_consent: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    Optional: I would also like relevant offers from{" "}
                    {page.brand_name}. I can ask them to stop at any time.
                  </span>
                </label>
                {error && (
                  <p role="alert" className="text-sm text-red-700">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || !form.contact_consent}
                >
                  {busy ? "Submitting…" : "Send inquiry"}
                </Button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
