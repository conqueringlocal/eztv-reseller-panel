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

**Provider coverage:** record the actual available Trex balance and time checked. No balance is fabricated on deployment. The warning compares unused Trex reseller balances with that snapshot and estimates top-ups in 60-credit batches. A snapshot becomes uncertain after 24 hours, guarded provider activity, a recorded purchase/loss/correction, or an unresolved guarded operation. Provider actions outside the dashboard are not automatically detected; check Trex again before relying on coverage. Reserved credits are displayed separately from unused balances. No top-up is purchased automatically.

**Renewals:** admin and reseller dashboards show next 7 days, next 30 days, expired in the last 30 days, and records needing review. The backend scopes records by owner, groups them using the paid renewal coordinator's grouping, and uses canonical connection counts. Mixed/inactive groups, ambiguous details, unverified provider records, and pending operations withhold quotes. Date-based estimates are not live provider checks. Reminders are copied for human review; nothing is sent automatically. A reseller's “Review renewal” opens the existing confirmation flow, which recalculates the actual charge before purchase. Search on customer lists supports name and email.

Additional validation: `npm run test:business` (isolated PostgreSQL and financial calculations). The stabilization suite also loads the business migration to check compatibility with payment approvals and paid operations. No paid provider calls are needed.
