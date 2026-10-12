# Automatic PayPal credit purchases

## Release state

Backend and frontend deployed October 11, 2026. Live checkout is **enabled** by both
`paypal_credit_settings.enabled` and `EZTV_PAYPAL_ENABLED`, following the owner's
instruction to proceed and verification of the live app and webhook. Existing manual
PayPal requests remain available. The first buyer-approved purchase and delivery
confirmation are still pending; no payment was captured during launch verification.

Reuse assessment: [V1/V2 comparison](V1_V2_ASSESSMENT_2026-10-11.md).
V2 source: `_shared/payments/paypal.ts` and `src/features/reseller/paypalReturn.ts`
at committed base `6fd3d97`. The new adapter deliberately does not inherit its
non-atomic fulfillment or webhook acknowledgment behavior.

## Behavior

Resellers with direct credit-purchase permission can buy 5/10/20/50 credits at
their assigned USD price per credit, defaulting to $3.00. Parent-managed accounts retain the current credit-request route.
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
- `EZTV_PAYPAL_APP_URL`: required only for isolated sandbox testing; use that test
  frontend origin (HTTPS, or localhost HTTP). Sandbox configuration refuses the
  production dashboard origin. Live returns always use reseller.eztvclub.com.

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

For subsequent releases, validate changes in isolation, verify the live app's
credentials/merchant/webhook, and arrange a designated real buyer purchase and
delivery/retry check. Do not mint sandbox credits into real reseller balances or use
a real purchase as an unapproved test. Set both live activation gates intentionally.
Existing authorized orders and
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

Production verification at initial deployment: the database gate was false, the
environment was live, and orders/events were empty. Anonymous purchase calls
returned 401; unconfigured webhook calls returned 503. Browser roles cannot fulfill
orders or enable checkout.
Security-advisor changes are the two intentionally policy-free, service-only
settings/receipt tables and the intentionally authenticated, admin-checked review
RPC. No new mutable-search-path or anonymous-definer warning was introduced.

Validation passed: 18 payment tests, 31 stabilization tests, 22 business tests;
desktop/mobile component browser scenarios; application TypeScript, both Edge
entrypoints, changed component ESLint and production build. Build retains the
existing large-bundle and outdated Browserslist warnings.

## Live activation evidence — October 11, 2026

- A short-lived, bearer-protected diagnostic performed PayPal Live OAuth and
  webhook lookup without returning credentials. Live authentication succeeded.
- The initially saved webhook ID referred to the old self-hosted V2 URL. An API
  attempt to replace its URL was rejected (HTTP 400), leaving it unchanged. A
  read-only webhook listing found the already-created V1 webhook. The owner then
  saved that webhook's ID and set `EZTV_PAYPAL_ENABLED=true` in V1 secrets.
- Readback confirmed the configured webhook belongs to the Live app, its URL is
  exactly the V1 `paypal-credit-webhook` endpoint above, and all six required event
  subscriptions are present. The older webhook was left intact.
- The deployed adapter created an unapproved $15 / 5-credit PayPal order and fetched
  it back. Approval URL, merchant, custom reference, currency and amount validated.
  PayPal order `7AG81986VD5481917` remained `CREATED`, without a capture. This was an
  isolated API probe, not a reseller purchase: no local order, credit, sale or fee
  was recorded, and no approval link was shared with a buyer.
- The production database gate was enabled only after configuration readback
  passed. Both gates are now enabled in Live mode. At activation, local payment
  order and event counts were zero. Actual buyer approval, capture and webhook
  credit delivery remain to be observed; this is not a completed end-to-end test.
- The diagnostic function `paypal-launch-preflight` was replaced with an inert
  HTTP 410 handler, and its temporary access token was removed. The previously
  authorized request now receives 410; anonymous checkout receives 401 and unsigned
  webhooks receive 400. No new Supabase project or paid add-on was created.

First-purchase check: an existing direct-purchase reseller opens Credits, selects
5 credits ($15), and approves payment themselves using an eligible buyer account.
Confirm one `credited` order, one receipt, one credit addition, one sale and the
reported fee. Check PayPal's completed webhook delivery and repeat the existing
order status check to establish no additional credit grant. If the UI reports an
uncertain result, inspect that order instead of submitting another payment.

## Individual reseller pricing — October 12, 2026

V1 at `reseller.eztvclub.com` is the active application. Future changes should
extend V1; do not publish the separate V2 frontend over it.

In **Admin → Resellers → select a reseller → Credit purchase pricing**, enter a
USD price per credit and save. Blank restores the standard $3.00 rate. The price
applies to direct PayPal checkout and manual PayPal payment requests; parent-managed
sub-reseller rates remain separate. No existing reseller override is assigned by
the migration. Admin changes are recorded in `reseller_credit_price_history`.

The dashboard and both purchase forms load `get_my_credit_pricing()`, keyed by the
signed-in account and refreshed every 30 seconds/on focus. Checkout snapshots the
server price under the same profile lock used by admin rate changes. An outdated
quote receives `409 price_changed` before any PayPal request; the browser refreshes
and requires another click. Durable retries preserve and display the original quote.
Old clients continue to use the $3.00 quote and cannot buy at that price after a
custom rate is assigned. Manual requests snapshot their unit price for later approval.

Deploy only `20261012005556_individual_reseller_pricing.sql`, the `paypal-credits`
function with its shared dependencies, and this frontend. The existing webhook
validates each order's stored amount and needs no code change. Do not change PayPal
credentials, environment, enablement gates, or provider settings. Keep all payment,
receipt, rate history and financial records on rollback. A frontend rollback can
safely leave the schema in place; custom-rate buyers on an older client must refresh
to the updated UI before a new purchase.

Validation covers distinct reseller prices, fallback/reset, RLS/write permissions,
audit history, stale quotes, concurrent changes, idempotent fulfillment and finance
amounts. Browser checks at 1280px and 390px cover admin save/reset, custom totals,
manual requests, saved checkout quotes and stale-price refresh. No real payment or
provider operation is part of these tests.

## Checkout order-link correction — October 12, 2026

The first reseller checkout exposed a live PostgREST query failure after PayPal
successfully created an order. The guarded update used an OR filter on
`paypal_order_id` but selected only `id`. This project's PostgREST also applied the
OR filter to the update's returned rows, where that column was absent; PostgreSQL
rejected the query with `42703`. Thus the local purchase remained unlinked and the
browser received HTTP 503 before redirecting to PayPal.

The update now returns both `id` and `paypal_order_id` and verifies they match the
expected pair before returning an approval URL. The guard against replacing an
existing different PayPal order remains intact. No schema, pricing, capture or
credit-fulfillment changes are involved.

All 28 payment tests and both payment Edge entrypoint type checks pass. New tests
reproduce the actual PostgREST-generated update/representation query, exercise the
real create handler through it, and verify that a competing different link cannot
be overwritten or yield an approval redirect. Existing tests cover duplicate
captures/webhooks and credit/finance atomicity.

A short-lived, bearer-protected diagnostic replayed only the original failed
purchase's stable PayPal request ID, with capture prohibited. The same PayPal order
was returned each time. After the fix, the application saved its link and returned
a valid approval URL. Readback verified 10 credits / $30 USD, the expected merchant
and local reference, PayPal status CREATED, and zero captures. No credits or
financial entries were issued. The original saved purchase can resume; do not
replace it with another purchase or a manual payment. Actual buyer approval and
credit fulfillment still require the buyer to finish checkout.

The diagnostic endpoint was replaced with an inert HTTP 410 handler and its
access token deleted. Anonymous purchase calls remain HTTP 401. Production
`paypal-credits` version 14 contains the fix; the shared change affects only the
create action, so the webhook and frontend needed no redeployment.

## Credit minimums — October 12, 2026

New direct PayPal and manual purchases offer **10, 20 or 50 credits**. The minimum
is 10 credits, including requests from sub-resellers to their parent. Individual
reseller prices remain unchanged. The browser and database reject smaller new
requests; the PayPal endpoint rejects them before making a provider call. A stale
five-credit browser draft receives the minimum-purchase message and resets to the
10-credit package after the server rejection.

Sub-reseller onboarding now defaults to and requires **20 initial credits**,
replacing the old 100-credit threshold. Both the create-reseller endpoint (before
Auth account creation) and initialize_reseller enforce the rule. Admin-created
children also require 20; creating an unfunded top-level reseller remains allowed.
Parent-created accounts retain the existing atomic balance transfer and ledger.
The parent's available balance must cover the allocation. The form allows editing
the number but disables submission below 20, for fractional amounts, or when the
balance is insufficient. Removed the existing form-payload console log so new
sub-reseller passwords are not logged.

Deployment: apply only `20261012025214_reseller_credit_minimums.sql`, then deploy
`paypal-credits`, `create-reseller`, and the frontend. Existing grants and table
constraints are preserved. Historical five-credit records can still fulfill or be
reviewed; no payment, balance or ledger is rewritten. No pending five-credit
PayPal/manual order existed at the pre-deployment check.

Validation: 34 payment/database tests, three create-reseller endpoint tests,
TypeScript/Deno checks, production build, and desktop/mobile payment and allocation
browser tests. Tests cover rejecting five-credit purchases, legacy wrapper RPCs,
existing five-credit fulfillment, 19-versus-20 initial allocations, insufficient
balances, parent transfers, stale browser drafts, and rejection before Auth/PayPal
calls. The old PayPal linking regression remains covered. Browser commands:
`node tests/paypal-browser.mjs` and `node tests/reseller-minimums-browser.mjs`.
