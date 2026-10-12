# Dashboard support ownership

The dashboard is the reseller-facing help desk. Zammad stores conversations and
attachments; the dashboard adapter enforces the reseller hierarchy. Resellers do
not receive native Zammad agent accounts or access to its user directory.

## Routing and visibility

- Direct reseller → EZTV's admin support queue.
- Sub-reseller → their immediate parent reseller's queue, at every depth.
- Retail customers remain the selling reseller's responsibility; no retail portal
  or retail invitations are created here.
- Categories: technical support, channel issue, channel request, VOD request.
- A reseller has **My support tickets** and **Tickets from my resellers**.
- Admin has **My support queue** (direct requests and escalations reaching EZTV)
  and **All tickets** for administrative oversight.
- The requester sees public messages and public attachments on their own tickets.
  Their assigned current parent can also write/read private notes and attachments.
  Siblings, unrelated branches and grandparents cannot access those tickets.
- A handler escalates to their own immediate support provider. For direct resellers
  this is EZTV; deeper hierarchies continue through each parent. The handler writes
  an explicit summary and chooses attachments. A separate linked upstream ticket
  keeps that conversation and upstream private notes out of the original thread.
  The parent remains responsible for replying to their sub-reseller.
- Each original ticket has at most one linked escalation. Requester sees only that
  the issue was escalated; private links are returned only to authorized viewers.
- Profile reparenting immediately removes the former parent's access on the next
  request. New tickets route to the new parent. Existing tickets retain their old
  assignment and require admin review; they are not silently disclosed to a new
  parent. The requester retains their own public conversation history.

## Runtime

Frontend: `src/pages/Helpdesk.tsx`, routes `/reseller/support` and `/admin/support`.
The page uses existing dashboard auth. Every API call validates the JWT with
Supabase Auth, then checks the actual session, user deletion/ban, expired admin
impersonation, current roles and parent/child membership in the database. A cyclic
or missing parent relationship fails closed. User metadata never determines roles.
Admin MFA is enforced when the account has an enrolled factor.

`reseller-helpdesk` signs a short-lived request with a service-only Vault key.
The public Caddy route `/eztv-support/v1` on the VPS hostname proxies only to the
adapter, not the native Zammad interface. HMAC covers the entire payload; contexts
older than 15 seconds are rejected. Browsers get neither the signing key nor the
internal endpoint/configuration. No DNS or Cloudflare Access change is needed to
use support inside the existing dashboard.

`bridge.rb` is mounted as a Rails initializer. Three additive tables in the Zammad
DB map immutable dashboard UUIDs to native identities/tickets and record request
IDs. Native identities use unique `.invalid` contact addresses and random passwords
so changing an editable dashboard email cannot merge identities or grant access.
The request ID, ticket and messages commit together in one DB transaction. Actor
and ticket locks prevent duplicate submissions and racing escalations. Retrying
an already committed request rechecks current access before returning the ticket.

Attachments: up to three per message, 1 MB each; JPG, PNG, WebP, PDF or plain text.
Downloads check ticket and article visibility again, and use an attachment download
rather than embedding arbitrary content. Messages render as plain text.

Conversation data stays on the existing VPS. Supabase stores only one configuration
row and uses its existing identity tables. No new project, paid add-on, scheduled
polling or Realtime subscription is added. Queries run on page load/focus, explicit
refresh and ticket actions.

## Deployment and rollback

1. Apply `schema.rb` with `EZTV_SUPPORT_PILOT=true bundle exec rails runner` after
   a backup; it only adds adapter tables. Do not overwrite the Zammad schema.
2. Copy `bridge.rb` and `bridge.yml` under the protected deployment's
   `local/dashboard/`. Generate a 32-byte random signing key in `signing-key`.
   The parent directory is mode 0700. The mounted key is readable only inside the
   Rails container and from the protected host directory; never commit its value.
3. Append `local/dashboard/bridge.yml` to the existing Compose file list. Recreate
   only `zammad-railsserver` using `up -d --no-deps` after validation. Changes to the
   initializer require a Rails restart. All databases/jobs remain internal-only.
4. Apply `reseller_helpdesk_context` migration to V1, save the same signing key in
   Vault, and reference its secret ID in `reseller_helpdesk_settings`.
5. Deploy the Edge function with its explicit getUser/session authentication.
   Keep the DB feature switch false during checks. Configure only the exact Caddy
   API route; all other VPS hostname paths continue returning 404.
6. Build/publish Pages, verify the live bundle and route, then enable the DB switch.

Rollback: set `reseller_helpdesk_settings.enabled=false` to stop new API actions
and show the preparation message. Preserve tickets/identities/request records.
To remove external bridge access, restore the prior Caddy hostname route and reload
only after validating its configuration. Do not delete volumes or signing keys to
troubleshoot. Normal Zammad mail channels/triggers stay disabled.

The native bootstrap/reset scripts are synthetic-pilot tools. Do not run them on
an instance with real dashboard tickets. They can disable accounts/channels.

## Verification

- 34 HTTP hierarchy checks: direct/child/grandchild routing, cross-branch denial,
  private-note and attachment restrictions, immutable request replay, racing
  escalations, selected-summary isolation, close/reopen, reparenting/revocation,
  and rejection of executable attachments.
- 9 database/Edge tests: service-only permissions, role/context derivation,
  session expiry/deletion/bans, ended impersonation, reparenting/cycles, spoofed
  caller context, disabled config and upstream failure behavior.
- Actual React UI + actual Zammad bridge at 1280 and 390 pixels: child opens a
  channel ticket, parent adds private note/escalates, admin responds upstream,
  and child sees neither the private note nor upstream response.
- Public HTTPS bridge rejects unsigned requests and accepts correctly signed ones.
- Supabase advisors: new config intentionally has no client policies because it is
  service-only. Existing unrelated warnings remain; the new function is not
  executable by anon/authenticated roles and has a fixed empty search path.

Commands (from the repository):

```sh
node --test tests/helpdesk.test.mjs
python3 services/support/dashboard/test-hierarchy.py
node tests/helpdesk-browser.mjs
```

Tests create synthetic support tickets only, never paid operations or external
mail. Do not run pilot reset scripts to clean them up. The cleanup helper selects
only UUIDs in the protected fixture registry, checks their native pilot identity,
and refuses non-pilot titles. The approved mailbox test ticket is preserved.

## Current limits

This first version is dashboard-based. Email notifications and ordinary support
mailbox intake are **not enabled**. The previously tested email round trip remains
separate: arbitrary email cannot select a reseller/parent or bypass dashboard
permissions. A later mail adapter must preserve these same identity, ownership and
private-thread rules before ordinary inbox intake is enabled.

Same-VPS backups exist and have been restored successfully. Off-site disaster
recovery, support coverage/response targets, notification delivery and a larger
capacity rehearsal remain before inviting the proposed 85-reseller network.
