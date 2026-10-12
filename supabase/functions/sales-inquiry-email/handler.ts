type Job = {
  id: string;
  lead_id: string;
  claim_id: string;
  recipient: string;
  inquiry: {
    name: string;
    email: string;
    phone: string;
    device: string;
    message: string;
  };
};
const mailbox = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export function inquiryMessage(job: Job) {
  if (
    ![job.recipient, job.inquiry.email].every(
      (v) => typeof v === "string" && v.length <= 254 && mailbox.test(v),
    )
  )
    throw new Error("invalid_address");
  if (!/^[0-9a-f-]{36}$/i.test(job.id) || !/^[0-9a-f-]{36}$/i.test(job.lead_id))
    throw new Error("invalid_reference");
  const i = job.inquiry;
  const text = [
    "You have a new website inquiry. It is saved in your CRM under Leads & trials.",
    "",
    `Name: ${i.name}`,
    `Email: ${i.email}`,
    `Phone: ${i.phone || "Not provided"}`,
    `Device or app: ${i.device || "Not provided"}`,
    "",
    "Message:",
    i.message || "No message provided.",
    "",
    "Open the saved inquiry:",
    `https://reseller.eztvclub.com/reseller/sales?tab=leads&lead=${job.lead_id}`,
    "",
    "Reply to this email to contact the person who submitted the inquiry. Email replies are not recorded automatically; log the conversation in your CRM.",
    "",
    "No account, trial or payment has been created.",
  ].join("\n");
  return {
    from: { name: "EZTV Website Inquiries", address: "noreply@eztvclub.com" },
    to: job.recipient,
    replyTo: i.email,
    subject: "New website inquiry",
    messageId: `<website-inquiry-${job.id}@eztvclub.com>`,
    text,
  };
}
// Database and mail transport are injected so failures can be exercised without real messages.
export function inquiryEmailHandler(
  db: any,
  mail: {
    configured: boolean;
    verify: () => Promise<void>;
    send: (message: ReturnType<typeof inquiryMessage>) => Promise<void>;
  },
) {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "cache-control": "no-store" } });
  const checked = (r: any) => {
    if (r.error) throw new Error("database_unavailable");
    return r.data;
  };
  return async (req: Request) => {
    if (req.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    try {
      const token = req.headers.get("X-Inquiry-Email-Token");
      if (
        !token ||
        !checked(
          await db.rpc("authorize_sales_inquiry_email_worker", {
            p_token: token,
          }),
        )
      )
        return json({ error: "Unauthorized" }, 401);
      const raw = await req.text();
      if (raw.length > 1000) return json({ error: "Request too large" }, 413);
      const body = JSON.parse(raw);
      if (body.action === "health") {
        if (!mail.configured)
          return json({ configured: false, smtp_verified: false });
        try {
          await mail.verify();
          return json({ configured: true, smtp_verified: true });
        } catch {
          return json({ configured: true, smtp_verified: false });
        }
      }
      if (body.action !== "work") return json({ error: "Invalid action" }, 400);
      if (!mail.configured) return json({ error: "Sender unavailable" }, 503);
      const outcomes = [];
      for (let n = 0; n < 4; n++) {
        const job: Job | null = checked(
          await db.rpc("claim_sales_inquiry_email"),
        );
        if (!job) break;
        let status = "sent",
          error: string | null = null,
          attempted = false;
        try {
          const message = inquiryMessage(job);
          // Connection/login failures occur before any message could be accepted.
          await mail.verify();
          attempted = true;
          await mail.send(message);
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          const response = (e as { responseCode?: number }).responseCode;
          const command = (e as { command?: string }).command;
          if (code === "invalid_address" || code === "invalid_reference") {
            status = "failed";
            error = code;
          } else if (
            !attempted ||
            (typeof response === "number" && response >= 400 && response < 500)
          ) {
            status = "retry";
            error = "mail_temporarily_unavailable";
          } else if (typeof response === "number" && response >= 500) {
            status = "failed";
            error = "mail_rejected";
          } else if (command === "CONN" || command === "AUTH") {
            status = "retry";
            error = "mail_temporarily_unavailable";
          } else {
            status = "uncertain";
            error = "smtp_confirmation_unknown";
          }
        }
        const saved = checked(
          await db.rpc("finish_sales_inquiry_email", {
            p_id: job.id,
            p_claim: job.claim_id,
            p_status: status,
            p_error: error,
          }),
        );
        if (!saved) throw new Error("outcome_not_saved");
        outcomes.push({ id: job.id, status });
      }
      return json({ outcomes });
    } catch {
      return json(
        {
          error:
            "Email work could not be confirmed; check saved delivery status",
        },
        503,
      );
    }
  };
}
