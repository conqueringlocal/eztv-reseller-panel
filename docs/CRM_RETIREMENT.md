# CRM retirement — V1

V1 at `reseller.eztvclub.com` is the production application. Customers, provisioning, renewals, credits, and reseller-specific PayPal pricing are managed in the dashboard. SSO login links remain available for self-hosted portals.

## Removed behavior

- HighLevel configuration, imports, contact editors, CRM status, webhook API-key controls, and external credit-alert settings.
- Outbound contact/credential syncing from trial creation, CSV import, and M3U domain updates.
- CRM sports auto-posting and the `reseller-credit-monitor` scheduled job.
- The browser `/api/webhook` provisioning route and legacy CRM provisioning handlers.

The following Edge Functions remain as dependency-free HTTP 410 responses, including malformed and stale requests: `webhook`, `create-highlevel-contact`, `update-highlevel-contact`, `update-highlevel-contact-credentials`, `get-highlevel-fields-and-tags`, `import-customers-to-highlevel`, `send-highlevel-message`, `sync-customer-to-crm`, `reseller-credit-monitor`, and `auto-post-sports-update`. Keeping these responses deployed prevents old clients or workflows from reaching previous production code. Their OPTIONS response is 204.

Trial credentials are saved and displayed in the dashboard for resellers to copy and share. The Telegram bot continues saving its legacy sports feed; the private sports reader and manual share functions remain available. CRM messaging, SMS, and social posting are no longer sent by this application.

## Data and deployment

Apply `20261012011221_retire_highlevel_integration.sql`. It disables both CRM settings tables, clears saved CRM tokens/API keys, removes the global agency key, revokes browser access to CRM settings/status, and blocks reactivation. Only the CRM cron job is unscheduled; provider balance synchronization remains enabled.

Historical customer contact IDs, sports posting flags, and retired settings metadata remain in the database to avoid destructive customer-data changes. Generated database types and historical migrations reflect those archived columns. Existing reseller deletion operations can still clean up their archived settings rows.

Deploy the ten retired endpoints plus `create-trial-user`, `create-trex-trial-user`, `backfill-m3u-domains`, and `telegram-sports-webhook`, then upload the V1 production build to Cloudflare Pages. Preserve the existing JWT settings. Include each function's relative shared dependencies. Do not deploy historical CRM handler versions.

This change does not delete the external HighLevel account or cancel its subscription. CRM credentials intentionally cannot be restored by a code rollback; reconnecting would require an explicit new integration and freshly configured credentials.

## Verification

- `npm run test:crm`: retired requests cannot invoke databases/providers, trials persist and return credentials without CRM calls, domain updates retain connection URLs, and migration permissions/constraints prevent reactivation while preserving the provider cron job.
- Existing Trex, stabilization, PayPal, business, balance, sales, support, and sports suites.
- `node tests/crm-browser.mjs` and `node tests/paypal-browser.mjs`: desktop/mobile settings, trial instructions, and individual reseller payment flows with mocked APIs.
- TypeScript, Deno checks for changed workers, production build, live 410/204 checks, and before/after database aggregates. No real provider accounts or payments are created by verification.
