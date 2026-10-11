# Automatic PayPal credit purchases

## Release state

Backend deployed October 11, 2026; frontend prepared for gated rollout. Live checkout is gated **off** by both
`paypal_credit_settings.enabled` and `EZTV_PAYPAL_ENABLED`. Existing manual PayPal
requests remain available. No real payments or provider credit operations have
been performed during implementation.

Reuse assessment: [V1/V2 comparison](V1_V2_ASSESSMENT_2026-10-11.md).
V2 source: `_shared/payments/paypal.ts` and `src/features/reseller/paypalReturn.ts`
at committed base `6fd3d97`. The new adapter deliberately does not inherit its
non-atomic fulfillment or webhook acknowledgment behavior.

## Behavior

Resellers with direct credit-purchase permission can buy 5/10/20/50 credits at
$3 USD each. Parent-managed accounts retain the current credit-request route.
The backend creates a durable local order at a server-controlled price and returns
an allowlisted PayPal approval URL. After buyer approval, browser capture or the
verified `CHECKOUT.ORDER.APPROVED` webhook can capture the order. A completed
capture callback/webhook/recheck grants once. Pending results do not grant.

Amounts, USD currency, configured merchant, local order ID, capture status and
final capture are validated against PayPal's server API. Stable request IDs protect
create/capture retries; database row locks and a receipt registry protect balance
updates. The registry is shared with manual approval so a capture cannot fund both.
Confirmation, balance, credit log, sale, actual reported fee and completion event
commit together. Persistence errors return non-2xx, allowing webhook retries.
If PayPal omits fee data, the fee remains unknown; it is not assumed zero.

Refunds, reversals, disputes and denials enter **Admin → Credits → PayPal purchases
and payment reviews**. V1 has whole-credit balances, so operators verify the event,
record the refund in Finance and apply any appropriate adjustment using existing
credit tools. Resolve the review with an outcome note. Resolving a review does not
move money or credits. A reviewed order cannot subsequently grant on a late capture.
An unresolved review blocks new automatic purchases by that reseller; it does not
suspend existing service, stop provider usage or automate collections of spent credits.

Checkout request references persist per signed-in user in browser storage. Payment
history polls every 30 seconds and on focus. A failed/unknown payment never tells a
reseller to pay again. Direct payments to @eztvclub remain manual requests.

## Deployment and configuration

Target is V1 **hddnqgggjjlildufirof**, not V2 staging. Deploy only the additive
`20261011210039_paypal_automatic_credits.sql` migration, `paypal-credits` and
`paypal-credit-webhook`, then the frontend. Do not replay historical migrations.
Both functions use `verify_jwt=false`: user requests explicitly validate the bearer
with Supabase Auth and filter orders by that user; the webhook requires PayPal
signature verification. Mutation RPCs are service-only except the admin-checked
review-resolution command. Browsers cannot set prices, credit balances, environment
or activation gates. Anonymous users cannot read orders/events/receipts/settings.

Configure these as **Supabase Edge Function Secrets**, never frontend variables:

- `EZTV_PAYPAL_CLIENT_ID`: the PayPal REST app's client ID.
- `EZTV_PAYPAL_CLIENT_SECRET`: that app's secret.
- `EZTV_PAYPAL_WEBHOOK_ID`: webhook belonging to the same app/environment.
- `EZTV_PAYPAL_MERCHANT_ID`: receiving PayPal Business merchant ID.
- `EZTV_PAYPAL_ENV`: `live` for production, `sandbox` only in an isolated test target.
- `EZTV_PAYPAL_ENABLED`: keep `false` until acceptance passes.

Use a dedicated Live REST app, or carefully retain existing app webhooks rather than
replacing them. Sandbox secrets on old V2 hosted staging cannot be read back through
Supabase's secret-list API and are not live credentials. No V2 secrets or projects
were modified. Secret metadata was unavailable through the current CLI session.

Webhook URL:
`https://hddnqgggjjlildufirof.supabase.co/functions/v1/paypal-credit-webhook`

Subscribe to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
`PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`,
`PAYMENT.CAPTURE.REVERSED`, and `CUSTOMER.DISPUTE.CREATED`.
`PAYMENT.CAPTURE.DECLINED` is handled defensively if received.

After sandbox acceptance, verify the live app's credentials/merchant/webhook and
run a designated real buyer purchase and delivery/retry check. Do not mint sandbox
credits into real reseller balances or use a real purchase as an unapproved test.
Then set both live activation gates intentionally. Existing authorized orders and
webhooks can still settle while creation is paused: disabling purchases is not a
reason to abandon payments already captured.

## Verification

`npm run test:paypal`: isolated Postgres plus real handler/adapter tests with
synthetic PayPal responses. Tests cover ownership, RLS, privileged commands,
server price and entitlement, environment gating, concurrency, rollback/replay,
manual/automatic overlap, out-of-order refund events, admin review resolution,
receipt validation, safe redirects, stable request IDs and webhook verification.

`node tests/paypal-browser.mjs`: real React component at desktop and 390px widths,
mocked Auth/API, all external traffic blocked. Covers disabled checkout, purchase
redirect, PayPal return, balance-refresh signal and admin review controls.

Also run production build, application TypeScript check, changed-file ESLint,
Edge type checks and the existing stabilization/business suites. These are not a
substitute for a new sandbox test of this V1 adapter and a controlled live purchase.

## Operations and rollback

Keep failures visible in payment history/reviews. Recheck the existing order rather
than creating a second payment. Valid but unlinked financial events return a retryable
error; investigate recurring webhook delivery failures in PayPal. This release does
not add an unattended reconciliation scheduler or an outbound alert channel.

To pause new purchases, set the database flag and `EZTV_PAYPAL_ENABLED` false.
Keep the webhook and settlement path available for previously approved payments.
Keep all order/receipt/event/audit rows. Frontend rollback can restore manual-only UI
without deleting paid evidence. Do not remove the shared manual receipt guard after
automated payments exist: it prevents manual double-crediting of those captures.

References: [PayPal webhook verification/retries](https://developer.paypal.com/api/rest/webhooks/rest/),
[PayPal request idempotency](https://developer.paypal.com/api/rest/reference/idempotency/),
[Supabase function authorization](https://supabase.com/docs/guides/functions/auth).

Production verification: the database gate is false, the environment is live, and
orders/events remain empty. Anonymous purchase calls return 401; unconfigured
webhook calls return 503. Browser roles cannot fulfill orders or enable checkout.
Security-advisor changes are the two intentionally policy-free, service-only
settings/receipt tables and the intentionally authenticated, admin-checked review
RPC. No new mutable-search-path or anonymous-definer warning was introduced.

Validation passed: 18 payment tests, 31 stabilization tests, 22 business tests;
desktop/mobile component browser scenarios; application TypeScript, both Edge
entrypoints, changed component ESLint and production build. Build retains the
existing large-bundle and outdated Browserslist warnings.
