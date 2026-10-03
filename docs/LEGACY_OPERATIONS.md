# Legacy dashboard operations

Manual credit purchases are active until automated payments are rebuilt for V2.

1. Reseller opens Credits & Usage, pays PayPal **@eztvclub** in **USD** at **$3 per credit**, and submits the payment transaction reference. Packages: 5, 10, 20 or 50 credits.
2. Administrator opens Credit Management, verifies receipt, amount, currency and payer directly in PayPal, then enters the verified transaction reference and approves. Denials require a note in the interface.
3. Approval, balance change, revenue entry and credit log commit together. Repeated approvals and reusing the same verified PayPal reference cannot grant twice. Pending requests prevent another submission. The page refreshes status and balance every 30 seconds and on focus.

Automated checkout and capture endpoints are paused with HTTP 503. Stripe webhook events are deliberately not acknowledged or fulfilled while paused; check the merchant dashboard for any historical charge requiring manual reconciliation. Do not instruct a reseller who already paid to pay again. Re-enable automation only after an order/event ledger and verified fulfillment are implemented.

## Paid Trex operations

New customer creation retains its existing guarded receipt workflow. Renewals and added connections use `trex_paid_operations`:

- Verify the caller and ownership; user-supplied internal-call flags do not grant access.
- Use a canonical connection list for quote and debit. Reject ambiguous connection records.
- Lock the reseller balance, create a durable claim and reserve the entire quoted amount before a paid call. Admin overrides reserve zero and are logged.
- Store each paid receipt before fetching the provider expiry or starting the next paid line. Expiry comes from Trex `device_info.expire`.
- Finalize customer records atomically. A timeout, partial response or storage failure leaves a hold; it does not buy again or refund automatically.
- Browser operation references survive refreshes and ambiguous failures. Recent overlapping changes are also blocked for 24 hours. A successful response clears the browser reference so a later intentional renewal can be requested.
- Legacy direct renewal workers are retired (410). CRM renewals use the same coordinator and real service authentication.

Credit Management includes a review queue for incomplete operations, historical pending renewals, provider records that could not be verified, and historical duplicate accounts. Receipts containing credentials are service-only. The browser sees references and outcomes, never those receipts.

For recovery, inspect the request and Trex account before any mutation. Do not expire a hold, repeat a provider call, refund a reserved amount, or remove a provider account based solely on a timeout. A support operator must establish which lines were actually purchased/renewed and which credit entries already exist. Preserve the evidence and operation reference for every adjustment.

`inspect-trex-accounts` is an authenticated administrator-only, read-only provider inspection endpoint. Its response contains status/date fields, not credentials. Provider errors do not prove an account is missing or justify a refund.

## Accounts and security

`user_roles` is authoritative for the updated authorization paths. Self-service profile edits cannot change balances, role, hierarchy or provider settings. Signup metadata cannot grant administrator privileges or opening credits. Administrative adjustments and child reseller allocations use checked database transactions.

SSO links expire after 30 days. Links existing at deployment received a 30-day rotation window. SSO redirects use the live dashboard origin. Remove unnecessary historical tokens and enroll administrators in MFA through a separately verified login/enrollment rollout; MFA has not been enforced by this release.

## Release and rollback

Target only the existing V1 Supabase project and Cloudflare Pages project. **Never run `supabase db push` over this repository's historical migrations.** Apply only explicitly reviewed new migration files.

Validation: `npm run test:trex`, `npm run test:stabilization`, `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build`. Tests use disposable network-isolated PostgreSQL containers and mocked provider requests. No paid provider request is needed for regression testing.

Deploy migrations, dependent backend functions and the frontend as one coordinated release. GitHub/Lovable may also redeploy backend functions after a merge; verify deployed versions afterward. Pages currently requires a direct upload. Retain migration and deployed-source backups privately.

If an operation needs pausing, return an explicit unavailable response **before** any provider call. Keep the ledger and current access restrictions. Do not restore the old renewal workers or permissive credit grants as a rollback. A frontend rollback must retain the manual-payment page or temporarily hide purchasing; old checkout endpoints stay paused. Never delete a ledger to clear a hold.

Remaining operational work: review historical exceptions, confirm any inconsistent legacy administrator assignment, enroll MFA, review Supabase auth settings, and plan a database update with a tested backup/restore. Dependency and performance work remains separate from these financial fixes.

## Finances and renewal worklist (October 3, 2026)

Open **Admin → Finances**. The reporting currency is USD; dates and month boundaries use UTC. The initial planning quote is $100 for 60 Trex credits ($1.66666667 each), pending confirmation that the supplier quote is USD. This is a cost assumption, not a recorded purchase. Record actual USD-settled purchase amounts (including conversion costs when applicable). The latest recorded purchase establishes the planning cost; each sale freezes its cost estimate when recorded. Correcting/backdating a purchase does not rewrite earlier sale estimates.

- Approved manual PayPal requests automatically create one sales record in the same transaction as approval and credit allocation. The verified transaction reference is unique. Approval fails atomically if financial capture fails.
- Enter the actual PayPal fee against its recorded payment. A missing fee is unknown, not zero. Only enter $0 when the receipt confirms it.
- Record actual Trex purchases, cash expenses, refunds already paid, confirmed credit losses, and complimentary credits already issued. Owner time is an optional non-cash valuation (hours × hourly rate). These forms do not transfer money, refund a payment, provision an account, or change credit balances.
- Historical payments can be entered after checking the original receipt. Do not re-enter payments approved through manual credit requests. Credit transfers and free allocations are not sales. Old credit logs, including historical revenue amounts, are deliberately not imported as verified payments.
- Net recorded cash flow = sales − payment fees − cash refunds − cash expenses − Trex purchases. Estimated contribution = sales − estimated fulfillment cost of credits sold − payment fees − refunds − estimated confirmed loss/complimentary cost. Operating estimate further subtracts expenses and owner time. Supplier purchases are not subtracted twice. These are incomplete, pre-tax management estimates until records are reconciled, not formal recognized revenue or accounting profit. Costs are shown in the month recorded; late fees/refunds can affect a different month from their sale. A refund conservatively retains fulfillment cost; do not invent a provider credit recovery.
- Manual records can be voided with a reason; history stays visible. Correct linked fees/refunds before voiding a manual sale. Automatically captured verified payments cannot be voided through this screen. Record an actual refund, if applicable, separately.

**Provider coverage:** the administrator's available Trex credits are read using the documented `reseller_info` API action. `sync-trex-balance` runs every five minutes via an authenticated scheduler and when the admin dashboard/Finances refreshes. A database lease and one-minute cooldown deduplicate concurrent calls. Credentials stay server-side. The scheduler uses a dedicated random token encrypted in Supabase Vault; its validator and enqueue functions are service-only. No paid provider operation is called.

Only validated successful API responses create a balance snapshot, including a genuine zero. Failure retains the previous balance and displays a warning. API snapshots become stale after ten minutes; subsequent guarded operations and unresolved operations also make coverage uncertain. Timestamps use the start of the provider request so concurrent activity cannot look older than the check. The source and last successful check time are displayed. Legacy manual checks remain in history, but the manual entry form has been removed. Use **Refresh Trex balance** after a top-up; provider requests run at most once per minute.

The warning compares unused Trex reseller balances with the latest snapshot and estimates top-ups in 60-credit batches. Reserved credits are shown separately. Actual purchase costs still require receipt entries; the API balance is not evidence of a payment amount. No top-up is purchased automatically.

Balance diagnostics: check `trex_balance_sync_state` for the last attempt/success and sanitized error code, and the `trex-balance-sync` cron job plus the corresponding pg_net HTTP response status. Never print the Vault token, provider API key, or full provider response. `SELECT public.enqueue_trex_balance_sync()` queues a read-only check for a service/operator connection. Do not reset the lease or cooldown to force repeated calls. Validate with `npm run test:balance` and `npm run test:business`; the latter stubs scheduling/HTTP and Vault only inside its isolated test database.

**Renewals:** admin and reseller dashboards show next 7 days, next 30 days, expired in the last 30 days, and records needing review. The backend scopes records by owner, groups them using the paid renewal coordinator's grouping, and uses canonical connection counts. Mixed/inactive groups, ambiguous details, unverified provider records, and pending operations withhold quotes. Date-based estimates are not live provider checks. Reminders are copied for human review; nothing is sent automatically. A reseller's “Review renewal” opens the existing confirmation flow, which recalculates the actual charge before purchase. Search on customer lists supports name and email.

Additional validation: `npm run test:business` (isolated PostgreSQL and financial calculations). The stabilization suite also loads the business migration to check compatibility with payment approvals and paid operations. No paid provider calls are needed.

## Reseller sales tools (October 3, 2026)

Resellers open **Sales tools**; administrators open **Sales program** for aggregate adoption and recorded results. The tools are available to existing authenticated accounts. No accounts, subscriptions, customer messages, payments, or credit rewards are issued by these new forms.

1. **Leads & trials:** add a prospect with contact details, source, device, stage, next action and local follow-up time. Link an existing trial from Customers to avoid creating another provider account; import is idempotent and asks for the actual trial end time. Record a lost reason when appropriate. Mark paid only after checking a received payment and its unique reference. Original payment amount/reference remain immutable; a verified full refund is recorded separately. Partial refunds still require separate reconciliation.
2. **Today:** shows unscheduled/due contacts and trials ending within 24 hours, followed by the existing renewal worklist. Copy a message, review and send it yourself through the customer's agreed channel, then record the conversation, minutes and next follow-up. Do-not-contact records suppress messages and contact logging. Inquiry consent permits a response to that inquiry; optional marketing consent is separate. A phone number alone is not marketing permission.
3. **Quote calculator:** enter connections, months, actual wholesale credit cost and retail price. Fees and support/referral allowance must be explicitly entered, including genuine zeros, before contribution is calculated. Quotes are estimates before taxes, refunds and overhead. Copied customer quotes exclude wholesale costs. No payment is collected.
4. **Setup kit:** copy device questions, setup, trial-check and troubleshooting messages. Private custom instructions and an HTTPS tutorial link are configured in Page & setup settings. Generic guidance is included; app-specific instructions need confirmation of supported players/devices. Do not put customer passwords or playlist URLs in lead notes or shared templates.
5. **Referrals:** select an existing customer and create a private referral label. A published inquiry page yields a shareable link with an opaque referral code. Disabling a code stops new attribution. Only a paid referred lead can have one reward record; self-referrals are rejected. Record credits/cash only after a reward was delivered separately. The form never grants credits, extends service or pays money. Refunded rewarded sales display a recovery-review warning; no automatic clawback occurs.
6. **Page & setup settings:** choose a unique `/r/<slug>` address, public brand/headline/description/contact email and accent. Setup notes/tutorial remain private. Pages default to unpublished, and publishing requires review of public details. Unpublish before changing an address; old links will stop working. Customer inquiries create private leads and a Today task, not trials. Check Today daily; no email/SMS notification service is configured.

Sales totals are reseller-entered first-sale records, not verified owner income, a complete customer payment ledger, or profit. The rolling trial cohort uses recorded trial start times; imported existing trials preserve their existing start date and may be outside the last 30 days. Revenue excludes recorded full refunds; late refunds restate the sale's cohort. Dashboard queries return the latest 1,000 leads and activities; an explicit warning appears when more leads exist. Full metrics still aggregate all records. Server pagination and complete accounting are future work.

**Privacy and abuse controls:** tables use RLS with owner/admin read access and no browser write privileges. Checked commands enforce ownership and optimistic revisions. A deliberately public read function returns only six published marketing fields. The public inquiry Edge Function validates/bounds input and calls a service-only database command; ownership is derived from the published slug, never a browser-supplied reseller ID. Inquiry retries and duplicate open email addresses are deduplicated. Atomic limits cap five attempts per hashed proxy IP and 30 per page per hour; raw IPs are not retained. A honeypot also drops obvious bots. These are basic abuse controls, not CAPTCHA or complete denial-of-service protection. Old attempt records are cleaned during accepted inserts after seven days; infrequently used pages may retain them longer. No provider credentials are involved.

**Validation:** `npm run test:sales` checks database isolation, concurrent deduplication, payment verification, rewards, public consent/limits, quote math and Edge Function behavior. Existing credit/provisioning/business/balance suites also pass. Authenticated browser verification uses mocked sessions/data for mobile and desktop, including lead → conversation → paid/referral reward and draft → publish → public inquiry. Production role verification uses rolled-back transactions, leaving no test customer or lead behind.

Deploy `20261003184139_reseller_sales_tools.sql`, then `public-sales-inquiry` (JWT gateway verification off because the form is intentionally public; the database write command remains service-only), then the frontend. Do not apply historical migrations. To pause public intake, unpublish the affected page or return unavailable from the Edge Function before its database call. Keep existing leads and records. A frontend rollback to the prior release leaves these additive tables dormant without weakening existing credit safeguards.

Advisors reviewed after deployment: the new anonymous SECURITY DEFINER warning is intentional for `get_public_sales_page(text)` only. It returns the six explicitly published fields, and production anonymous checks confirmed private APIs remain denied and unpublished pages return null. The intake attempt table intentionally has no browser RLS policy or grants. New unused-index notices are expected before adoption; no new missing foreign-key indexes were reported. Existing unrelated account/platform advisories remain tracked in the earlier audit.
