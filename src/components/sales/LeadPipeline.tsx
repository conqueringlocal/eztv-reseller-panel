import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LeadEditor, salesSelect } from "./LeadEditor";
import { CopyText } from "./CopyText";
import {
  stages,
  needsFollowUp,
  leadMessage,
  toISO,
  type SalesLead,
  type SalesWorkspace,
} from "@/lib/sales";
import { useRefreshSales } from "@/hooks/useSalesWorkspace";
import { toast } from "sonner";
import { money } from "@/lib/business";

export function LeadPipeline({
  data,
  today = false,
}: {
  data: SalesWorkspace;
  today?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [limit, setLimit] = useState(15);
  const [editing, setEditing] = useState<SalesLead | "new" | null>(null);
  const [contact, setContact] = useState<SalesLead | null>(null);
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState("0");
  const [next, setNext] = useState("");
  const [trial, setTrial] = useState("");
  const [busy, setBusy] = useState(false);
  const contactId = useRef(crypto.randomUUID());
  const refresh = useRefreshSales();
  const rows = data.leads
    .filter(
      (l) =>
        (!today || needsFollowUp(l)) &&
        (stage === "all" || l.stage === stage) &&
        `${l.name} ${l.email} ${l.source}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      today
        ? (a.follow_up_at ? Date.parse(a.follow_up_at) : 0) -
          (b.follow_up_at ? Date.parse(b.follow_up_at) : 0)
        : Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
  const importTrial = async () => {
    if (!trial || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("import_sales_trial", {
        p_customer: trial,
      });
      if (error) throw error;
      await refresh();
      toast.success(
        "Existing trial linked. Confirm its setup and exact end time.",
      );
      setTrial("");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const record = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contact || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_sales_contact", {
        p_id: contactId.current,
        p_lead: contact.id,
        p_note: note.trim(),
        p_minutes: Number(minutes),
        p_next: toISO(next),
      });
      if (error) throw error;
      await refresh();
      setContact(null);
      toast.success("Conversation recorded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap justify-between gap-3 items-center">
          <CardTitle>
            {today ? "Today’s lead follow-ups" : "Leads & trials"}
          </CardTitle>
          <Button onClick={() => setEditing("new")}>Add lead</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {today
              ? "Open leads with no follow-up scheduled, overdue follow-ups, and trials ending within 24 hours. Review the contact history before reaching out."
              : "Keep a next action for each prospect. Payment status is recorded by you after checking the receipt."}
          </p>
          {data.lead_count > data.leads.length && (
            <p role="status" className="text-amber-900">
              Showing the {data.leads.length} most recently updated leads out of{" "}
              {data.lead_count}. Older records are retained; ask support for a
              full export.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sales-search">Find a lead</Label>
              <Input
                id="sales-search"
                value={search}
                placeholder="Name, email or source"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(15);
                }}
              />
            </div>
            <div>
              <Label htmlFor="sales-stage-filter">Stage filter</Label>
              <select
                id="sales-stage-filter"
                className={salesSelect}
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setLimit(15);
                }}
              >
                <option value="all">All stages</option>
                {Object.entries(stages).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!today && (
            <details className="border rounded p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Link an existing trial
              </summary>
              <div className="flex flex-wrap gap-2 mt-3">
                <select
                  aria-label="Existing trial customer"
                  className={`${salesSelect} flex-1 min-w-0`}
                  value={trial}
                  onChange={(e) => setTrial(e.target.value)}
                >
                  <option value="">Select existing trial</option>
                  {data.customers
                    .filter((c) => c.is_trial)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  disabled={!trial || busy}
                  onClick={() => void importTrial()}
                >
                  Link trial
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                This links the account already created. To create a new trial,
                use{" "}
                <Link className="underline" to="/reseller/customers">
                  Customers
                </Link>{" "}
                first.
              </p>
            </details>
          )}
          <p className="text-sm text-muted-foreground">
            {rows.length} leads in this view
          </p>
          {rows.length === 0 && (
            <div className="rounded bg-slate-50 p-6 text-sm">
              {today
                ? "No leads need follow-up in this view. Review upcoming renewals below."
                : "Add your first lead or link an existing trial. New website inquiries will appear here automatically."}
            </div>
          )}
          {rows.slice(0, limit).map((lead) => (
            <div key={lead.id} className="rounded border p-4 space-y-3">
              <div className="flex flex-wrap gap-2 justify-between">
                <div>
                  <p className="font-semibold">{lead.name}</p>
                  <p className="text-sm text-muted-foreground break-all">
                    {lead.email}
                    {lead.phone ? ` · ${lead.phone}` : ""}
                  </p>
                </div>
                <span className="rounded bg-indigo-50 text-indigo-900 text-xs px-2 py-1 h-fit">
                  {stages[lead.stage]}
                </span>
              </div>
              <p className="text-sm">
                Next: {lead.next_action || "Choose the next action"} ·{" "}
                {lead.follow_up_at
                  ? new Date(lead.follow_up_at).toLocaleString()
                  : "Not scheduled"}
              </p>
              {lead.trial_ends_at && (
                <p className="text-sm">
                  Trial ends: {new Date(lead.trial_ends_at).toLocaleString()}
                </p>
              )}
              {lead.paid_at && (
                <p className="text-sm">
                  Recorded payment: {money(lead.paid_amount)}
                  {lead.stage === "refunded" ? " · full refund recorded" : ""}
                </p>
              )}
              {lead.do_not_contact && (
                <p className="text-sm font-medium text-amber-900">
                  Do not contact
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(lead)}
                >
                  Edit lead
                </Button>
                {!lead.do_not_contact &&
                  !["paid", "lost", "refunded"].includes(lead.stage) && (
                    <>
                      <CopyText
                        text={leadMessage(lead)}
                        label="Copy follow-up"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setContact(lead);
                          setNote("");
                          setMinutes("0");
                          setNext("");
                          contactId.current = crypto.randomUUID();
                        }}
                      >
                        Record conversation
                      </Button>
                    </>
                  )}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Contact history & notes
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="whitespace-pre-wrap break-words">
                    {lead.notes || "No notes yet."}
                  </p>
                  {lead.lost_reason && <p>Lost reason: {lead.lost_reason}</p>}
                  {lead.contact_requested_at && (
                    <p className="text-muted-foreground">
                      Requested a response via inquiry form{" "}
                      {new Date(lead.contact_requested_at).toLocaleString()}.{" "}
                      {lead.marketing_opt_in_at
                        ? "Also opted in to offers."
                        : "No marketing opt-in recorded."}
                    </p>
                  )}
                  {data.activities
                    .filter((a) => a.lead_id === lead.id)
                    .slice(0, 12)
                    .map((a) => (
                      <p key={a.id} className="border-t pt-2 break-words">
                        {new Date(a.created_at).toLocaleString()} · {a.note}
                        {a.minutes ? ` · ${a.minutes} min` : ""}
                      </p>
                    ))}
                </div>
              </details>
            </div>
          ))}
          {rows.length > limit && (
            <Button variant="outline" onClick={() => setLimit((n) => n + 15)}>
              Show more leads
            </Button>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Add lead" : "Edit lead"}
            </DialogTitle>
            <DialogDescription>
              Track the next step and record confirmed outcomes.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <LeadEditor
              key={
                editing === "new" ? "new" : `${editing.id}-${editing.revision}`
              }
              lead={editing === "new" ? undefined : editing}
              data={data}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!contact}
        onOpenChange={(open) => {
          if (!open) setContact(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a conversation</DialogTitle>
            <DialogDescription>
              Only record contact you actually made. No message is sent by this
              form.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={record}>
            <Label htmlFor="contact-outcome">Outcome</Label>
            <Input
              id="contact-outcome"
              minLength={2}
              maxLength={1000}
              required
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                contactId.current = crypto.randomUUID();
              }}
            />
            <Label htmlFor="contact-minutes">Time spent (minutes)</Label>
            <Input
              id="contact-minutes"
              type="number"
              min="0"
              max="1440"
              required
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                contactId.current = crypto.randomUUID();
              }}
            />
            <Label htmlFor="contact-next">
              Next follow-up (local time, optional)
            </Label>
            <Input
              id="contact-next"
              type="datetime-local"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                contactId.current = crypto.randomUUID();
              }}
            />
            <Button disabled={busy} type="submit">
              Save conversation
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
