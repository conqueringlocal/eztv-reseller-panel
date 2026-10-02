# Trex provisioning incident and deployment

The current reseller dashboard could reject a successful Trex creation because it expected top-level credentials instead of the documented M3U URL. It also required an immediate `device_info` lookup, which earlier project tests found could report a newly created account as missing. Its duplicate check ran against a credit log written after customer persistence, so either failure could leave retries unprotected. These defects are reproduced; the five accounts reported by the owner have not yet been attributed to Derek.

The dashboard creation form is paused in the Cloudflare Pages deployment. Existing open tabs, service callers, and direct requests are not stopped until the backend update below is deployed. No production database changes or Supabase function deployments have been made by this patch. No provider credits were spent during testing.

## Deploy in this order

Target only the existing V1 Supabase project `hddnqgggjjlildufirof` (EZTV Reseller Platform).

1. Download the currently deployed function bundles as a backup. Repository history is a source backup, not proof that it exactly matches deployed functions.
2. Deploy `supabase/functions/create-trex-user/index.ts` from this branch. It defaults to returning `creation_paused` before any provider/database call unless `TREX_CREATION_ENABLED` is exactly `true`. Keep that secret absent or false for now. This closes the direct Trex creation path used by old dashboard tabs and by `create-iptv-user`. Do not replace unrelated trial, renewal, or MAG endpoints.
3. Run ONLY `supabase/migrations/20261002160000_trex_provisioning_guard.sql` in the SQL editor. It is transactional and adds a table, indexes, and two service-only functions; it does not change existing customer rows or balances when installed. Do not run `supabase db push` or replay historical migrations: the repository contains historical production data repairs.
4. Deploy `create-iptv-user` and `webhook` from this same branch. Include the updated `webhook/enhancedWebhookHandler.ts` with its existing shared dependencies. The generic entrypoint now forwards a whole Trex operation, preserves its existing credential response, and delegates charging once. The webhook reuses the already persisted customer and gives each intended upgrade line a stable reference. Do not edit HighLevel workflows or credentials.
5. Verify live table permissions and function deployment versions. The table must have RLS enabled, no anon/authenticated access, and no client-callable claim/finish RPCs. Confirm the paused endpoint returns `creation_paused` without using a real customer request. Compare the live schema with the existing columns used in the migration; tests use an isolated legacy-schema fixture, not a live database clone.
6. Reconcile the five existing provider accounts before inviting Derek to resubmit. Check original function logs against account times/IDs, request metadata, and reseller profile. Do not export or paste passwords, API keys, M3U URLs, or complete raw logs. Do not assume all five belong to Derek. Do not delete or refund automatically. These historical accounts predate the new request ledger and cannot be deduplicated by it.
7. Once backend verification and reconciliation are complete, set Supabase secret `TREX_CREATION_ENABLED=true`. Rebuild/deploy the frontend with `VITE_TREX_CREATION_PAUSED=false`. Keep both controls paused if any step is incomplete. A live create test spends provider credits and needs explicit parameters from the owner; the automated test suite makes no live provider calls.

Cloudflare Pages deployment command (run after the intended build):

```sh
npx wrangler pages deploy dist --project-name eztv-reseller-panel --branch main
```

If a deployment issue occurs, set `TREX_CREATION_ENABLED=false` and deploy the frontend with its default pause. Keep the request table and its receipts intact. Rolling back to the old unguarded function would restore the duplicate-purchase risk.

## Behavior and support recovery

Every creation first claims a database request under a reseller row lock. One unresolved request per reseller is allowed. Concurrent or repeated attempts, including changed form data, return the existing reference while a request is unresolved. Unresolved attempts never expire or get retried automatically. Successfully completed requests for the same normalized customer identity and operation are suppressed for 24 hours.

Each provider creation is called once. A confirmed response is parsed, and its receipt is saved before the next paid connection is attempted. No immediate `device_info` lookup gates success. Provider failure, timeout, malformed response, or receipt-storage failure stops further connections. Uncertain outcomes require manual review; no automatic refund, expiry, lock release, or repurchase is performed.

Customer persistence, credit deduction, credit log insertion, and the final response commit in one database transaction. Repeating finalization returns the saved result without a second charge. Partial successes are saved and charged only for the confirmed lines; the attempt remains in review. Reseller credits are not reserved upfront: a competing legacy renewal can change the balance and cause finalization to require reconciliation, but the original claim and saved receipts prevent a repeat purchase.

The request ledger records the reseller, customer, package, duration, requested connections, timestamps, and provider receipts. Receipt credentials are sensitive, like the legacy customer credentials, and are restricted to the service role. New provider notes put the request reference and reseller first, but the ledger remains authoritative if the provider does not retain notes. The existing blank notes are not proof of which reseller created the five accounts.

Safe support inventory (SQL editor; contains no credentials):

```sql
select id, reseller_id, state, created_at, updated_at,
       request_data->>'name' as customer_name,
       request_data->>'connections' as requested_connections,
       jsonb_array_length(receipts) as confirmed_receipts,
       response->>'code' as result_code
from public.trex_provisioning_requests
where state in ('processing', 'review_required')
order by created_at;
```

For a `processing` request with all receipts present and no final response, after checking that its worker has stopped and confirming the provider accounts, an operator can run `finish_trex_provisioning` on that existing request. This does not call Trex. For partial/uncertain requests, investigate the provider result and reconcile locally before changing state; never simply clear a hold or rerun the original create. The `resolved` state is for deliberate operator reconciliation, not a retry button. The patch does not add automatic recovery or a support UI.

## Verification

```sh
npm run test:trex
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

The regression suite creates and deletes its own network-isolated PostgreSQL 17 container. Supabase SDK imports, HTTP calls to Trex, and HighLevel integration calls are mocked; SQL claim/finalization and permissions run against real PostgreSQL. It covers documented and legacy responses, credential encoding, repeated and concurrent requests, permanent uncertain-outcome holds, partial creation, receipt/finalization failures, atomic rollback, role restrictions, service delegation, and webhook consolidation. No real accounts, provider credits, customer records, HighLevel contacts, or payment records are touched.
