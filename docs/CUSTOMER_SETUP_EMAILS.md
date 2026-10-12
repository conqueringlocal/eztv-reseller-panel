# Customer setup emails

V1 uses a single EZTV sender, `noreply@eztvclub.com`. Customer passwords and M3U URLs are intentionally included, as requested by the owner. Replies go to the reseller's saved contact email (Sales Tools branding draft), falling back to the reseller's profile email.

## Reseller workflow

- **Add Customer:** “Email setup details to customer” defaults on when sending is available. Turning it off creates the account without an automatic email. Automatic delivery applies to successful paid Trex M3U creation, after all requested connections are saved. Trials, renewals, historical accounts and partial/review-required creation attempts do not automatically send.
- **Customer credentials:** choose “Review and send email”, check the saved customer email and message preview, then choose “Send setup email”. Manual sends contain only the current active, unexpired connections. They do not create/renew accounts or change credits.
- Use “Refresh preview and status” to check progress. “Accepted by Mailbux” means SMTP accepted the message, not a confirmed inbox delivery. An uncertain send needs a mailbox/customer check before a manual resend.

## Configuration and release

Existing project: `hddnqgggjjlildufirof` (EZTV Reseller Platform). No extra project or paid add-on.

Secrets in this project's Edge Function Secrets:

- `EZTV_CUSTOMER_EMAIL_USER=noreply@eztvclub.com`
- `EZTV_CUSTOMER_EMAIL_PASSWORD`: mailbox/app password, never stored in Git or browser configuration.

SMTP: `my.mailbux.com:465`, implicit TLS, verified certificate, bounded timeouts. Supabase blocks outbound 25/587; Mailbux/Mailwish also supports 465. Nodemailer is pinned. See [Supabase limits](https://supabase.com/docs/guides/functions/limits), [Mailwish SMTP configuration](https://mailwish.com/guides/smtp-imap-and-pop3-details/?generate_pdf=14766), and [Nodemailer SMTP](https://nodemailer.com/smtp).

Apply only `20261012013917_customer_setup_emails.sql`; never replay historical migrations. Deploy `customer-setup-email` and the updated `create-trex-user`, then the frontend. The new function disables gateway JWT verification because the worker has its own scoped token; browser actions validate the JWT with Auth and enforce customer ownership/admin role. Queue RPCs and tables are service-only. The two “RLS enabled, no policy” advisor notices are intentional deny-by-default browser access; all browser table grants are revoked.

The singleton `customer_email_settings.enabled` starts false. Verify SMTP before setting true. The function's `health` action is admin/worker-only and verifies SMTP login without sending a message. Worker tokens remain in Vault; never print them. The October 12 rollout verified the configured mailbox successfully from the hosted Edge Function. No real customer email or paid Trex creation was used for verification; first inbox delivery remains to be observed.

## Delivery safeguards and cost

The original provisioning request durably records `sendSetupEmail` before any paid provider call. Existing callers default false. The email collector reads only completed requests with explicit true; no historical backfill. Each provisioning request can produce at most one automatic job. Deleted customers/old requests are cancelled, not repeatedly scanned.

One pending delivery per customer, stable manual request IDs, a one-minute customer cooldown and a serialized 100/hour reseller manual limit suppress accidental repeats. The worker claims at most four messages per minute globally (240/hour maximum, leaving headroom under Mailbux's published 300/hour mailbox limit). That mailbox should remain dedicated to these sends.

The one-minute database scheduler invokes the Edge Function only when sending is enabled and queued/in-flight jobs exist. UI status refresh is manual; there is no browser polling. The queue stores recipient/status/reference metadata, not copied passwords or message bodies. Keep provider request/response and SMTP debug logging off.

The worker reloads credentials before sending. A changed recipient or changed manual preview fails before SMTP. Messages use deterministic Message-IDs. SMTP cannot guarantee exactly-once delivery: a lost SMTP response or interrupted worker becomes `uncertain`, with **no automatic resend**. Sending never invokes Trex or changes credit balances. Jobs expire after 24 hours; failed/uncertain jobs need manual review.

## Pause / investigate

```sql
UPDATE public.customer_email_settings SET enabled=false WHERE id=true;
```

This stops new claims and scheduled sends; a send already in flight may finish. Leave jobs, request IDs, the Vault secret and service-only permissions intact. Do not reset an uncertain job to queued. Check Mailbux/customer receipt, then use a new manual request if another email is needed. Resume by setting enabled=true after correcting/validating the sender. Unsent jobs older than 24 hours cancel instead of sending unexpectedly.

Safe operational query (no credentials):

```sql
SELECT status, count(*) FROM public.customer_email_jobs GROUP BY status;
```

## Verification

- `npm run test:email`: isolated PostgreSQL and actual handler logic; access isolation, intent filtering, concurrent deduplication, stale previews/recipients, scheduler gating, interrupted/ambiguous sends and unchanged credits/accounts.
- `npm run test:trex`: existing paid-creation regression tests plus durable opt-in, replay and invalid-input tests. Mocked provider only.
- `node tests/customer-email-browser.mjs`: actual React controls at 1280px and 390px with network-isolated synthetic APIs; default on, opt-out payload, manual preview/send, ambiguous-send identity, delivery history, unavailable sender and overflow checks.
- `npx tsc -p tsconfig.app.json --noEmit`, `npx deno check --node-modules-dir=none supabase/functions/customer-setup-email/index.ts supabase/functions/create-trex-user/index.ts`, `npm run build`.
- Existing modified frontend files retain nine pre-existing `no-explicit-any` lint findings; the new email component passes lint. Build retains the existing large-chunk warning.
