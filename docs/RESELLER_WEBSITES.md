# Reseller websites on their own domains

Owner requirement (October 12, 2026): a reseller page remains unpublished until the reseller connects their own domain. There is no shared-domain fallback. Public `/r/:slug` reads and the old slug-based inquiry endpoint stay closed.

## Reseller flow

Open **Sales tools → Website & domain**. Save branding and contact details as a private draft, enter an owned hostname, and add the exact A and TXT records displayed. Main domains and `www`/other subdomains are supported independently. The first release connects one exact hostname per reseller; it does not automatically redirect a second hostname.

The A record points to `2.25.68.22`. `_reseller-site.<hostname>` contains a random per-connection ownership proof. Remove conflicting A/AAAA records for that exact hostname and disable DNS proxying. Keep the TXT record installed. Do not replace DNS for an existing website unless you intend to move that hostname here; unrelated MX/email records are unchanged.

**Check connection** verifies public DNS, authorizes certificate issuance only for the verified hostname, and checks a trusted HTTPS response from the local gateway. A valid certificate alone is insufficient: the response must carry the current ownership proof. The reseller then explicitly confirms their public details and publishes. Preview displays only saved public fields in a sandboxed iframe; private setup notes and tutorial URLs never enter the public renderer.

Published pages receive inquiries into the existing Leads & trials workspace, including the existing consent, referral, deduplication and rate-limit rules. No trial, payment or credit operation is performed. Referral links use the connected domain only.

Disconnecting immediately unpublishes and deletes the domain claim, preserving draft content and leads. A new connection gets a new proof; an in-flight old verification cannot activate it. DNS/HTTPS rechecks run every ten minutes. Failed checks unpublish the page; a reseller must publish again after recovery. Readiness expires after 24 hours if verification stops, and public reads/intake fail closed even if a stale published flag remains. Domain checks are throttled per account to once every 30 seconds. Conflicting ownership claims require support review; do not transfer a claim without verifying the new owner's DNS control.

## Runtime and security

- Source: `services/websites/`; dependency-free Node HTTP service, public upstream on **127.0.0.1:8095**, certificate-permission endpoint on **127.0.0.1:8096**.
- Installed as `eztv-websites.service` on `srv1781264`, running as a dynamic unprivileged user with a read-only filesystem and memory/CPU bounds.
- Existing Caddy remains the only public listener. Named sites retain precedence. A fallback HTTPS route uses restricted on-demand TLS and rejects Host/SNI mismatches. Caddy replaces the client-IP header; incoming forwarded hosts/IPs are not trusted. The certificate-permission endpoint is never proxied publicly.
- Authenticated management endpoint: `https://srv1781264.hstgr.cloud/reseller-websites/manage`. It allows only the dashboard Origin and verifies the bearer token through Supabase Auth. The authenticated user's ID supplies ownership, never a browser-submitted reseller ID.
- Service config: `/etc/eztv-websites.env`, root-only. It contains the existing **anon** API key and a random scoped `WEBSITE_GATEWAY_SECRET`. The service never receives the Supabase service-role key, provider keys or payment secrets. The database stores only SHA-256 of the scoped secret in an RLS-protected settings table with no browser grants.
- `sales_website_gateway` is intentionally callable by `anon`, but every action first checks the scoped secret and hosting enablement. It grants only domain lookup/status, public-field preview/render, and existing inquiry intake. `connect_sales_domain` and `disconnect_sales_domain` intentionally use authenticated security-definer RPCs with ownership checks and consistent advisory locks. Those three RPCs produce expected advisor warnings; the private settings table produces an expected RLS/no-policy informational notice. Browser write grants and direct access to the renamed internal functions are revoked.
- Publication is guarded by a database trigger, including direct writes. Public reads, submissions and certificate permission independently check readiness and expiry. HTML escapes all reseller text, uses a nonce CSP and no-store responses, and never includes private setup fields. HTTPS probes connect only to loopback with the reseller hostname for SNI/certificate validation: supplied DNS cannot choose a fetch destination.

## Deployment and rollback

Apply only `20261012050857_reseller_custom_domains.sql`; do not replay historical migrations. The migration initializes hosting disabled. Install the service, generate a random secret into a root-only environment file, store its hash in `reseller_website_settings`, and configure the IPv4/management URL. Enable hosting only with a working service.

`services/websites/Caddyfile.fragment` shows the exact new routes and global permission setting. Merge into the existing config, validate, and gracefully reload; do not replace unrelated site blocks. A pre-change Caddy and sales-function backup is in `/root/.eztv-websites-backups/`. For future changes, take a fresh backup and verify that the current config has not changed concurrently.

Build the dashboard and upload `dist` to the existing Cloudflare Pages project `eztv-reseller-panel`. Git pushes do not deploy this frontend.

To disable all public websites immediately:

```sql
UPDATE public.reseller_website_settings SET enabled=false WHERE id=true;
```

That blocks public content/intake, new connections, publishing and new certificate permission while preserving drafts and leads. Keep the database guards and closed old APIs. If reverting the server routing, remove only this feature's additions from the current Caddy config; use the backup wholesale only if no other config change occurred. Remove the fallback route before stopping the service. Do not re-enable the historical `/r/` publishing model.

## Verification

`npm run test:websites`: 19 checks across isolated PostgreSQL, DNS verification, real local TLS certificate/hostname/proof checks, host routing, authentication, input validation, ownership isolation, expired readiness, disconnect races, inquiry deduplication/referrals/rate limits and HTML escaping. No real reseller domains, provider calls, payments or customer messages are used.

`npm run test:sales`: 19 existing sales checks pass. TypeScript and the production build pass. Browser verification at mobile and desktop sizes covers draft save, pending DNS instructions, verification, explicit publish, scriptless private preview and disconnect; browser Auth/API responses use fixtures.

Live activation on October 12: database migration/configuration installed; service active on loopback; Caddy configuration validated and reloaded; gateway access verified; unknown domains denied certificate permission and public content; unauthenticated management rejected with 401; authenticated database checks confirm reseller access to setup and denial of direct verification/settings writes. No pages or domain claims existed during activation. The dashboard release is recorded with the final deployment below.

**Outstanding acceptance:** connect an owner-designated reseller domain and verify public DNS propagation, real ACME issuance and a real browser inquiry through that hostname. No live custom-domain certificate or inquiry is claimed as tested before that happens.

Implementation references: [Caddy on-demand HTTPS](https://caddyserver.com/docs/automatic-https#on-demand-tls), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).


Final dashboard deployment: [d6e777fa](https://d6e777fa.eztv-reseller-panel.pages.dev), built from `b0a1cf0` on top of Help Center release `14e042b`. The production custom-domain bundle matches the local build byte-for-byte. The same mobile/desktop domain flow passed against the deployed frontend with fixture Auth/API interception; no production reseller draft, claim or inquiry was created by that browser test.


## Domain validation correction and logos (October 12, 2026)

`20261012123444_reseller_website_domain_fix_logos.sql` corrects an overly broad platform-domain restriction. `eztvclub.com`, `www.eztvclub.com`, and other ordinary owned website addresses can connect through the same DNS/HTTPS verification as reseller domains. Actual service addresses (`reseller.eztvclub.com`, `supabase.eztvclub.com`, `vpn.eztvclub.online`, and shared hosting/internal names) remain reserved. Reserved-host errors now explain the restriction instead of reporting a formatting error. No domain is automatically claimed, pointed, verified or published by this update.

The editor accepts PNG, JPG and WebP logo files up to 5 MB, preserves transparency, and resizes/re-encodes them as PNG up to 512 pixels and a 256 KiB data-URL limit. The database checks the PNG envelope, dimensions and size, and stores it with the private page. There is no separate publicly accessible draft-logo object. Preview and published pages display the logo above the brand name; Remove logo takes effect when the page is saved. Existing clients that omit the logo field preserve the saved logo. SVGs, external URLs and malformed/oversized payloads are rejected. The public page's CSP permits embedded data images only.

Verification: all 23 website tests, TypeScript and the production build pass. `tests/website-logo-browser.mjs` covers mobile/desktop upload, invalid file rejection without losing the selected logo, saved/private/public rendering, removal, apex-domain setup and the existing publish/disconnect flow. Run it with Playwright available (or `PLAYWRIGHT_MODULE` set to its module path); `WEBSITE_TEST_URL` selects a local/deployed dashboard URL. Auth/API requests are intercepted with fixtures, so this browser test writes no production records. A production rollback-only database check verifies `eztvclub.com` is accepted as pending and the page remains unpublished.
