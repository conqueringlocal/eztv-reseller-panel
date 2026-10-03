import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  stages,
  localDateTime,
  toISO,
  type SalesLead,
  type SalesWorkspace,
  type LeadStage,
} from "@/lib/sales";
import { useRefreshSales } from "@/hooks/useSalesWorkspace";
import { toast } from "sonner";
export const salesSelect =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
export function LeadEditor({
  lead,
  data,
  onClose,
}: {
  lead?: SalesLead;
  data: SalesWorkspace;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: lead?.name || "",
    email: lead?.email || "",
    phone: lead?.phone || "",
    device: lead?.device || "",
    source: lead?.source || "manual",
    stage: lead?.stage || "new",
    customer_id: lead?.customer_id || "",
    referral_id: lead?.referral_id || "",
    next_action: lead?.next_action || "",
    follow_up_at: localDateTime(lead?.follow_up_at || null),
    trial_ends_at: localDateTime(lead?.trial_ends_at || null),
    notes: lead?.notes || "",
    lost_reason: lead?.lost_reason || "",
    paid_amount: lead?.paid_amount ? String(lead.paid_amount) : "",
    payment_reference: lead?.payment_reference || "",
    refund_reference: lead?.refund_reference || "",
    do_not_contact: lead?.do_not_contact || false,
    payment_verified: false,
    refund_verified: false,
  });
  const id = useRef(lead?.id || crypto.randomUUID());
  const command = useRef({ body: "", id: crypto.randomUUID() });
  const [busy, setBusy] = useState(false);
  const refresh = useRefreshSales();
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((old) => ({ ...old, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const payload = {
      ...form,
      paid_amount: Number(form.paid_amount || 0),
      follow_up_at: toISO(form.follow_up_at),
      trial_ends_at: toISO(form.trial_ends_at),
    };
    const body = JSON.stringify(payload);
    if (command.current.body !== body)
      command.current = { body, id: crypto.randomUUID() };
    try {
      const { error } = await supabase.rpc("save_sales_lead", {
        p_id: id.current,
        p_revision: lead?.revision || 0,
        p_command: command.current.id,
        p_data: payload,
      });
      if (error) throw error;
      await refresh();
      toast.success("Lead saved.");
      onClose();
    } catch (error) {
      toast.error(
        (error as Error).message ||
          "Save not confirmed. Reload before trying again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Record your sales process here. Creating a lead or changing its stage
        does not create a trial, collect money, or renew service.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {(
          [
            ["name", "Name", 100],
            ["email", "Email", 254],
            ["phone", "Phone (optional)", 40],
            ["device", "Device / app", 100],
            ["source", "Lead source", 100],
          ] as const
        ).map(([key, label, max]) => (
          <div key={key}>
            <Label htmlFor={`lead-${key}`}>{label}</Label>
            <Input
              id={`lead-${key}`}
              type={key === "email" ? "email" : "text"}
              value={form[key]}
              required={key === "name" || key === "email"}
              minLength={key === "name" ? 2 : undefined}
              maxLength={max}
              disabled={busy}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
        <div>
          <Label htmlFor="lead-stage">Stage</Label>
          <select
            id="lead-stage"
            className={salesSelect}
            disabled={busy}
            value={form.stage}
            onChange={(e) => set("stage", e.target.value as LeadStage)}
          >
            {Object.entries(stages)
              .filter(([key]) => key !== "refunded" || lead?.paid_at)
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </div>
        <div>
          <Label htmlFor="lead-customer">
            Link an existing customer (optional)
          </Label>
          <select
            id="lead-customer"
            className={salesSelect}
            value={form.customer_id}
            disabled={busy}
            onChange={(e) => set("customer_id", e.target.value)}
          >
            <option value="">Not linked</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.is_trial ? " · trial" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="lead-referral">Referred by (optional)</Label>
          <select
            id="lead-referral"
            className={salesSelect}
            value={form.referral_id}
            disabled={busy || !!lead?.referral_id}
            onChange={(e) => set("referral_id", e.target.value)}
          >
            <option value="">No referral</option>
            {data.referrals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="lead-next">Next action</Label>
          <Input
            id="lead-next"
            value={form.next_action}
            maxLength={200}
            disabled={busy}
            onChange={(e) => set("next_action", e.target.value)}
            placeholder="Example: check whether setup worked"
          />
        </div>
        <div>
          <Label htmlFor="lead-due">Follow-up time (local)</Label>
          <Input
            id="lead-due"
            type="datetime-local"
            value={form.follow_up_at}
            disabled={busy}
            onChange={(e) => set("follow_up_at", e.target.value)}
          />
        </div>
        {(form.stage === "trial" || form.trial_ends_at) && (
          <div>
            <Label htmlFor="lead-trial-end">
              Actual trial end time (local)
            </Label>
            <Input
              id="lead-trial-end"
              type="datetime-local"
              value={form.trial_ends_at}
              required={form.stage === "trial"}
              disabled={busy}
              onChange={(e) => set("trial_ends_at", e.target.value)}
            />
          </div>
        )}
      </div>
      {(form.stage === "paid" || form.stage === "refunded") && (
        <div className="border rounded p-3 space-y-3">
          <p className="text-sm">
            Record the payment you actually received, in USD. This does not
            credit or charge an account.
          </p>
          <Label htmlFor="lead-amount">Payment received (USD)</Label>
          <Input
            id="lead-amount"
            type="number"
            min="0.01"
            max="1000000"
            step="0.01"
            required
            value={form.paid_amount}
            disabled={busy || !!lead?.paid_at}
            onChange={(e) => set("paid_amount", e.target.value)}
          />
          <Label htmlFor="lead-receipt">Verified payment reference</Label>
          <Input
            id="lead-receipt"
            minLength={3}
            maxLength={200}
            required
            value={form.payment_reference}
            disabled={busy || !!lead?.paid_at}
            onChange={(e) => set("payment_reference", e.target.value)}
          />
          {!lead?.paid_at && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={form.payment_verified}
                onChange={(e) => set("payment_verified", e.target.checked)}
              />
              I checked that I received this payment.
            </label>
          )}
          {form.stage === "refunded" && (
            <>
              <Label htmlFor="lead-refund">Full refund reference</Label>
              <Input
                id="lead-refund"
                minLength={3}
                maxLength={200}
                required
                value={form.refund_reference}
                onChange={(e) => set("refund_reference", e.target.value)}
              />
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={form.refund_verified}
                  onChange={(e) => set("refund_verified", e.target.checked)}
                />
                I verified the full refund was already paid.
              </label>
              <p className="text-sm text-muted-foreground">
                Partial refunds need separate reconciliation. A recorded refund
                does not cancel service or recover provider credits.
              </p>
            </>
          )}
        </div>
      )}
      {form.stage === "lost" && (
        <div>
          <Label htmlFor="lead-lost">Why was this lead lost?</Label>
          <Input
            id="lead-lost"
            required
            minLength={2}
            maxLength={500}
            value={form.lost_reason}
            onChange={(e) => set("lost_reason", e.target.value)}
          />
        </div>
      )}
      <div>
        <Label htmlFor="lead-notes">
          Notes (no passwords or payment card details)
        </Label>
        <textarea
          id="lead-notes"
          className="w-full rounded border p-2 text-sm"
          rows={3}
          maxLength={3000}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.do_not_contact}
          onChange={(e) => set("do_not_contact", e.target.checked)}
        />
        Do not contact this person
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save lead"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
