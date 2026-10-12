import type { InquiryDelivery, SalesWorkspace } from "@/lib/sales";
const labels = {
  queued: "Email queued",
  sending: "Sending email",
  sent: "Email accepted by mail provider",
  failed: "Email needs attention",
  uncertain: "Email delivery unconfirmed",
};
export function InquiryDeliveryStatus({
  deliveries,
}: {
  deliveries: InquiryDelivery[];
}) {
  if (!deliveries.length) return null;
  return (
    <details className="text-sm border-t pt-3">
      <summary className="cursor-pointer font-medium">
        Website inquiries · {deliveries.length} · {labels[deliveries[0].status]}
      </summary>
      <div className="mt-3 space-y-4 [overflow-wrap:anywhere]">
        {deliveries.map((item) => (
          <div key={item.id} className="border-t pt-3 space-y-1">
            <p className="font-medium">
              {new Date(item.created_at).toLocaleString()} · Saved to CRM
            </p>
            <p
              className={
                item.status === "failed" || item.status === "uncertain"
                  ? "text-amber-900"
                  : "text-muted-foreground"
              }
            >
              {labels[item.status]}
              {item.recipient ? ` · ${item.recipient}` : ""}
            </p>
            {(item.status === "failed" || item.status === "uncertain") && (
              <p className="text-amber-900">
                Your inquiry is safely stored here. Follow up from the details
                below; contact support to review the email alert.
              </p>
            )}
            <p className="break-words">
              {item.inquiry.name} · {item.inquiry.email}
              {item.inquiry.phone ? ` · ${item.inquiry.phone}` : ""}
            </p>
            {item.inquiry.device && <p>Device: {item.inquiry.device}</p>}
            <p className="whitespace-pre-wrap break-words">
              {item.inquiry.message || "No message provided."}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}
export function InquiryRoutingNotice({ data }: { data: SalesWorkspace }) {
  const config = data.inquiry_email;
  return (
    <div className="rounded-lg border p-4 text-sm space-y-1">
      <p className="font-semibold">Website inquiries go straight to your CRM</p>
      <p>
        Every submission is saved in Leads & trials, including new messages from
        existing leads.
      </p>
      {config?.enabled && config.recipient ? (
        <p className="break-words">
          Email alerts go to your login email:{" "}
          <strong>{config.recipient}</strong>. Delivery status appears with each
          inquiry. Use Refresh to check for updates.
        </p>
      ) : (
        <p className="text-amber-900">
          Email alerts{" "}
          {config?.recipient
            ? "are temporarily unavailable"
            : "need a verified login email"}
          . Inquiries remain available in your CRM.
        </p>
      )}
    </div>
  );
}
