import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useRefreshSales } from "@/hooks/useSalesWorkspace";
import { type SalesWorkspace } from "@/lib/sales";
import { money } from "@/lib/business";
import { CopyText } from "./CopyText";
import { salesSelect } from "./LeadEditor";
import { toast } from "sonner";
export function ReferralTools({ data }: { data: SalesWorkspace }) {
  const [customer, setCustomer] = useState(""),
    [label, setLabel] = useState(""),
    [rewardLead, setRewardLead] = useState(""),
    [credits, setCredits] = useState("0"),
    [cash, setCash] = useState("0"),
    [reference, setReference] = useState(""),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const refresh = useRefreshSales();
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("create_sales_referral", {
        p_customer: customer,
        p_label: label.trim(),
      });
      if (error) throw error;
      await refresh();
      setCustomer("");
      setLabel("");
      toast.success("Referral code ready.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (id: string, enabled: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_sales_referral_enabled", {
        p_id: id,
        p_enabled: enabled,
      });
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !confirmed) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_sales_reward", {
        p_lead: rewardLead,
        p_credits: Number(credits),
        p_cash: Number(cash),
        p_reference: reference.trim(),
        p_note: note.trim(),
      });
      if (error) throw error;
      await refresh();
      setRewardLead("");
      setReference("");
      setNote("");
      setConfirmed(false);
      toast.success("Delivered reward recorded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const eligible = data.leads.filter(
    (l) =>
      l.stage === "paid" &&
      l.referral_id &&
      !data.rewards.some((r) => r.lead_id === l.id),
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Customer referrals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Give a customer a personal inquiry link. Leads and paid outcomes are
            attributed to that code. Define any reward with the customer first
            and include its cost in your quote calculation.
          </p>
          {!data.page?.published && (
            <p className="rounded bg-amber-50 border p-3 text-sm">
              Publish your{" "}
              <Link className="underline" to="/reseller/sales?tab=page">
                inquiry page
              </Link>{" "}
              before sharing referral links.
            </p>
          )}
          <form onSubmit={create} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="referral-customer">Referring customer</Label>
                <select
                  id="referral-customer"
                  className={salesSelect}
                  required
                  value={customer}
                  disabled={busy}
                  onChange={(e) => setCustomer(e.target.value)}
                >
                  <option value="">Choose your customer</option>
                  {data.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="referral-label">Private label</Label>
                <Input
                  id="referral-label"
                  minLength={2}
                  maxLength={100}
                  required
                  value={label}
                  disabled={busy}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Example: customer name"
                />
              </div>
            </div>
            <Button disabled={busy || !customer} type="submit">
              Create referral code
            </Button>
          </form>
          {data.referrals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No referral codes yet.
            </p>
          )}
          {data.referrals.map((ref) => {
            const leads = data.leads.filter((l) => l.referral_id === ref.id);
            const url = data.page
              ? `https://reseller.eztvclub.com/r/${data.page.slug}?ref=${ref.id}`
              : "";
            return (
              <div key={ref.id} className="border rounded p-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">{ref.label}</p>
                  <span className="text-sm">
                    {ref.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <p className="text-sm">
                  {leads.length} tracked leads ·{" "}
                  {leads.filter((l) => l.stage === "paid").length} recorded paid
                  sales
                </p>
                <p className="text-xs text-muted-foreground break-all">
                  Code: {ref.id}. The customer’s name is not included in the
                  public link.
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyText
                    label="Copy referral link"
                    text={url}
                    disabled={!ref.enabled || !data.page?.published}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void toggle(ref.id, !ref.enabled)}
                  >
                    {ref.enabled ? "Disable code" : "Enable code"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Record a reward already delivered</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A paid referred sale is required. This record does not send money,
            grant credits, or renew the referrer’s service. One reward record is
            allowed per sale; verify its details before saving.
          </p>
          <form onSubmit={record} className="space-y-3">
            <Label htmlFor="reward-lead">Paid referred sale</Label>
            <select
              id="reward-lead"
              className={salesSelect}
              value={rewardLead}
              required
              onChange={(e) => setRewardLead(e.target.value)}
            >
              <option value="">Choose an eligible sale</option>
              {eligible.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {money(l.paid_amount)}
                </option>
              ))}
            </select>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="reward-credits">
                  Provider credits already spent on reward
                </Label>
                <Input
                  id="reward-credits"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  required
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="reward-cash">
                  Cash reward already paid (USD)
                </Label>
                <Input
                  id="reward-cash"
                  type="number"
                  min="0"
                  max="10000"
                  step="0.01"
                  required
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm">
              Estimated reward cost:{" "}
              {money(
                Number(cash || 0) +
                  Number(credits || 0) * data.credit_unit_price,
              )}
            </p>
            <Label htmlFor="reward-reference">
              Payment / completed renewal reference
            </Label>
            <Input
              id="reward-reference"
              minLength={3}
              maxLength={200}
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Label htmlFor="reward-note">What was delivered?</Label>
            <Input
              id="reward-note"
              maxLength={1000}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I verified the customer paid and this reward was already
              delivered.
            </label>
            <Button type="submit" disabled={busy || !confirmed || !rewardLead}>
              Record delivered reward
            </Button>
          </form>
          {data.rewards.map((r) => (
            <div key={r.lead_id} className="border rounded p-3 text-sm">
              <p>
                {data.leads.find((l) => l.id === r.lead_id)?.name ||
                  "Recorded sale"}{" "}
                · {r.credits} credits + {money(r.cash_amount)} cash
              </p>
              <p className="break-words">
                {r.reference} · {r.note}
              </p>
              {data.leads.find((l) => l.id === r.lead_id)?.stage ===
                "refunded" && (
                <p className="text-amber-900">
                  Sale refunded after reward. Review recovery manually; no
                  reward was reversed.
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
