# Reseller support help desk pilot

## Decision and scope

Use **self-hosted Zammad** for support conversations, assignments, private notes,
attachments and support operations. Build the dashboard identity/ownership adapter
ourselves. Keep the help desk separate from Trex provisioning and credit accounting.
This is a private infrastructure pilot, not a reseller-facing launch.

The current owner-support model is:

- Each reseller supports their own retail customers, including setup and billing.
- The incoming distributor handles his resellers' credit purchases and his own retail customers.
- EZTV staff handle reseller technical support and provider escalation.
- The distributor is not automatically a support agent or global administrator.

Zammad's **Customer** role represents a reseller requesting help here. It does not
mean retail subscribers are being invited to the central help desk.

## Current deployment

- VPS directory: `/opt/eztv-support-pilot`.
- HTTP: `http://127.0.0.1:8093` (VPS loopback only).
- Existing inbox: `support@eztvclub.com`, confirmed by the owner in Mailbux webmail
  and its mobile app. A verified app password is configured in an **inactive**
  Zammad channel. The sender address remains inactive and unlinked.
- Zammad: `7.2.2-0000`, official `ghcr.io/zammad/zammad` image.
- Upstream Compose revision: `b51cba16ab6d753efcb6676a30afaf97753b72cb`.
- All service images pinned to verified digests in `image-lock.yml`.
- PostgreSQL, Redis, Memcached, Elasticsearch and application jobs are on a Docker
  internal network. Only the nginx reverse proxy also joins the frontend bridge,
  because Docker does not publish ports for internal-only containers.
- Persistent named volumes use the `eztv-support-pilot` project prefix.
- Resource limits bound the pilot on this shared VPS. These are pilot limits, not
  proof of capacity for 85 resellers and an unknown customer population.
- Six random-password synthetic accounts: administrator, support agent, two
  resellers, distributor and unrelated reseller. No production identities imported.
- Private organizations, no domain-based auto-assignment, self-registration off.
- All external communication channels and notification triggers disabled.
- No Trex credentials, Supabase service key, provider API calls or credit changes.

Never put all reseller accounts into one shared Zammad organization: that grants
members access to one another's tickets. Distributor reporting is intentionally
not enabled yet. It needs an explicit scope and a server-side adapter.

## Reproduce and operate

Prerequisites: Docker/Compose compatible with upstream (Compose 2.23.1+), Python 3.12+
for these scripts, capacity for the documented Zammad dependencies, and sufficient
`vm.max_map_count` for Elasticsearch. The existing VPS value was already adequate.

From the V1 repository:

```sh
python3 services/support/prepare-pilot.py
```

This clones a pinned upstream checkout into a new destination or verifies the
existing revision. It creates random secrets only if missing and retains them on
re-runs. Do not run `docker compose config` without `--quiet` or selective filtering:
resolved configuration includes database credentials.

```sh
cd /opt/eztv-support-pilot
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps --all
```

Wait for `zammad-init` to exit successfully and Rails to become healthy, then:

```sh
docker compose cp local/pilot-users.json zammad-railsserver:/tmp/eztv-pilot-users.json
docker compose cp /root/projects/eztv-reseller-panel/services/support/bootstrap-pilot.rb zammad-railsserver:/tmp/eztv-bootstrap.rb
docker compose exec -T --user root zammad-railsserver chown zammad:zammad /tmp/eztv-pilot-users.json
docker compose exec -T -e EZTV_SUPPORT_PILOT=true zammad-railsserver bundle exec rails runner /tmp/eztv-bootstrap.rb
docker compose exec -T --user root zammad-railsserver rm /tmp/eztv-pilot-users.json /tmp/eztv-bootstrap.rb
```

The bootstrap is guarded against non-pilot use and never sends invitations. Do not
reuse it for production: it intentionally disables channels and non-pilot users.

For private review, use an SSH tunnel from a trusted computer:

```sh
ssh -N -L 8093:127.0.0.1:8093 YOUR_EXISTING_VPS_SSH_LOGIN
```

Then open `http://localhost:8093`. A server administrator can retrieve pilot login
credentials from `/opt/eztv-support-pilot/local/pilot-users.json` using existing
secure server access. Do not paste these credentials in tickets, chat or Git.

Pause the pilot with `docker compose stop`. Start again with `docker compose start`.
Do not remove volumes to troubleshoot. Upgrades require reviewing release notes,
taking a verified backup and updating the pinned versions deliberately.

## Verification

October 9, 2026 pilot results: **29 HTTP integration checks passed**, plus four
browser scenarios (agent and reseller on desktop and the dedicated mobile UI),
the operational isolation check, and the isolated database restore/attachment digest
check. The classic desktop UI is cramped at phone widths; use `/mobile` for phone
testing. These results do not validate live email, dashboard SSO, distributor
reporting or capacity for the incoming network.

Follow-up email verification passed **14 isolated checks** for inbound parsing,
reseller attribution, untrusted ownership-header rejection, attachments, the IMAP
duplicate-message validator, actual outbound delivery into a local SMTP sink,
threading and exclusion of internal notes. Four unit tests verify secure mailbox
credential handling and that the access check never fetches, modifies or sends mail.
Mailbux IMAP and SMTP authentication with certificate-verified TLS succeeded using
the replacement app password. The dedicated test folder is available. These checks
ran from the VPS host; container mail connectivity and live delivery remain untested.

Run from the V1 repository:

```sh
python3 services/support/check-pilot.py
python3 services/support/test-pilot.py
python3 services/support/test-recovery.py
python3 services/support/test-email.py
python3 services/support/test-mailbux-access.py
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node services/support/test-browser.mjs
```

The HTTP integration test creates synthetic tickets in the private pilot. It tests
ownership, cross-reseller denial, note/attachment visibility, assignment, queue
escalation, close/reopen, profile isolation and role escalation resistance. Its
small concurrent-read check is a smoke test, not a launch capacity test.

Results are saved in the private deployment's `local/` directory. Browser screenshots
default to `/mnt/data`. No production dashboard, database or provider is contacted.

The backup service schedules local database and storage backups at 03:00 Eastern,
with seven-day retention. Recovery testing creates an additional backup and restores
it into a disposable network-isolated PostgreSQL container. It checks record counts
and attachment-content digests and extracts the storage archive. Zammad's default
attachment backend stores content in PostgreSQL, so a zero-file storage archive is
expected in this pilot. The test removes only its own disposable container/volume.

Backups are currently on the **same VPS**. This is not disaster recovery. Before
launch, configure encrypted off-site copies, retention and failure notifications,
then rehearse restoring the complete application on another host. Recovery-test
copies in `local/recovery/` are separate from automatic backup retention and should
be pruned deliberately after retaining the desired test evidence.

## Existing Mailbux inbox and channel transition

The owner currently handles support through Discord DMs, Facebook Messenger and SMS.
Keep those as contact avenues during transition, but create a ticket for any issue
requiring investigation. Capture the reseller, relevant customer reference, source
channel and a short factual summary; do not import entire personal conversation
histories. Once connected, staff should reply from the help desk to retain a shared
history. There are no Discord/Messenger/SMS connectors in this pilot.
An inbound email is not authorization to change balances, renew service or grant
access. Unknown senders need staff triage and reseller identity verification.

Mailbux's verified published settings are `my.mailbux.com:993` over TLS for IMAP
and `my.mailbux.com:587` with STARTTLS for SMTP, using the full email address.
Its current SMTP/API documentation states IMAP is available on paid plans and
recommends a separate app password for unattended access. Check the existing
account's entitlement; this setup does not purchase an upgrade or change DNS.

### Cloudflare credential entry (preferred; works from mobile)

A dedicated Worker named `eztv-support-mailbox` is deployed in the owner's
personal Cloudflare account (`7dab44ab414c0018bf0ef6dfce235b56`). It is independent
of the reseller Pages project. The owner can supply the credential without VPS access:

1. Generate a dedicated app password for `support@eztvclub.com` in Mailbux.
2. In Cloudflare, open **Workers & Pages → eztv-support-mailbox → Settings →
   Variables and Secrets → Add**. Select **Secret**, name it exactly
   `MAILBUX_APP_PASSWORD`, paste the app password as its value, then save/deploy.
3. Tell the operator it is ready; never paste the password into chat. Create the
   empty `EZTV-Support-Pilot` folder in Mailbux webmail for the access check.

Do not put this credential in Pages frontend variables, a `VITE_` variable, Git,
or ordinary plaintext Worker variables. Cloudflare stores the encrypted Secret;
the VPS and eventually Zammad still require a protected local copy to authenticate.

The Worker accepts authenticated HTTPS POST requests only. A random transport key
is separate from the mailbox secret. The response is RSA-OAEP/SHA-256 ciphertext
encrypted for a pinned 3072-bit VPS public key; only the VPS holds its private key.
There are no CORS permissions, request logs, public previews or cacheable responses.
The current handoff expires **2026-10-16 13:57 UTC**. Disable it after successful
retrieval; it is a temporary handoff, not an ongoing runtime dependency.

Operator commands (no passwords in arguments/output):

```sh
node services/support/cloudflare/fetch-mailbox.mjs --status
node services/support/cloudflare/fetch-mailbox.mjs
python3 services/support/mailbux-access.py --check
```

The fetch helper decrypts locally into mode-0600 `local/mailbux.json`, refuses to
overwrite an existing credential, and does not activate a channel or send/fetch mail.
After retrieval, set `HANDOFF_ENABLED` to `false` in the private Wrangler config
and redeploy, then delete the `VPS_HANDOFF_TOKEN` Secret and confirm authenticated
requests no longer return ciphertext. Keep the config synchronized with dashboard
changes; redeploying stale enabled settings can reopen the handoff before expiry.
After mailbox access is verified, remove `MAILBUX_APP_PASSWORD` from this temporary
Worker too. If a credential needs replacement, deliberately archive/remove the
existing protected local file and generate fresh transport credentials first.

Reproducible setup: `node services/support/cloudflare/prepare-handoff.mjs` generates
the private config/key/token under `/opt/eztv-support-pilot/local/cloudflare/`.
Deploy using Wrangler's `--config` and `--secrets-file` options with `wrangler.json`
and `handoff-token.json` in that directory. Write the deployed HTTPS URL ending in
`/v1/mailbox` to a mode-0600 `endpoint.json` as `{"url":"https://…/v1/mailbox"}`.
Preparation preserves existing keys and expiry; it never creates a mailbox password.
Tests: `node --test services/support/cloudflare/*.test.mjs`. Eleven tests cover
authorization, expiry, encryption, private client storage and overwrite protection.
Live checks verified unauthenticated POST/GET/browser-origin rejection and the
authenticated missing-secret response. No real mailbox credential was present.

Reference: [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Operational update (2026-10-09): the initial credential appeared in Wrangler's
configuration-diff diagnostics because it was entered as a plaintext variable.
The owner confirmed rotation. The replacement was verified to be an encrypted
Secret, securely retrieved, and successfully tested for IMAP/SMTP login and
read-only test-folder access. Zero messages were fetched or sent. The handoff is
disabled, both Cloudflare Secrets have been deleted, and the former transport token
is rejected (HTTP 401). The protected local credential is now the operational copy.
Capture future Wrangler deployment output in a protected local log and report only
sanitized status: remote plaintext variables can appear in its diff.

`python3 services/support/configure-mailbux.py` prepares the inactive channel using
credentials passed over stdin, without Zammad's mail-sending setup wizard. It checks
the private-pilot guards, disabled channels/triggers, test-folder preservation and
TLS verification. It does not fetch, deliver or activate email, and leaves the
sender unlinked: Zammad otherwise automatically activates addresses linked to any
existing channel. The script can update the same inactive channel after rotation.
The native channel configuration contains credentials and must never be dumped into
logs or chat; protect database backups accordingly.

Before a live pilot, provide controlled container access to Mailbux (the application
network is still internal-only), link the sender, and route only the test folder.
Use designated test messages/recipients to verify receipt, replies, threading,
attachments and sender authentication before enabling normal inbox handling.

### Alternative: interactive VPS entry

Credential handoff can also use the owner's existing secure VPS access:

1. In the Mailbux dashboard, generate a dedicated app password for
   `support@eztvclub.com`, labelled for the EZTV help desk. Do not share the normal
   mailbox password or paste an app password into chat, Git or command arguments.
2. Create an empty mailbox folder named `EZTV-Support-Pilot` in webmail for the
   initial controlled connection. Leave historical messages outside that folder.
3. From the owner's interactive VPS terminal, run:

   ```sh
   python3 /root/projects/eztv-reseller-panel/services/support/mailbux-access.py --store
   ```

   The hidden prompt writes only `/opt/eztv-support-pilot/local/mailbux.json`, mode
   0600 inside a mode-0700 directory. It does not authenticate, fetch or send mail.
4. The operator can then run `mailbux-access.py --check`. This verifies IMAP and
   SMTP authentication with certificate verification and EXAMINEs the test folder
   read-only. It never fetches messages, marks/deletes mail, sends mail, or activates
   a channel. The sanitized result is saved beside the credential file.

Do not run Zammad's account wizard against the live mailbox yet: its documented
setup sends verification emails, including one to an external Zammad address.
Live channel setup should use the approved test folder with `keep_on_server: true`,
auto-response triggers off, and an explicit cutover plan. A channel is not ready
until controlled live receipt/reply tests pass; local parser/SMTP tests do not prove
Mailbux login, IMAP fetching, delivery or SPF/DKIM alignment.

`test-email.py` uses a pinned, disposable Mailpit container on the internal-only
network. It has no published ports or relay configuration. Synthetic `.invalid`
mail passes through Zammad's real email parser and outbound email job into this
local sink. The test disables its temporary channel and removes the sink afterward.
All normal pilot communication channels remain disabled between tests.

References: [Mailbux connection/app-password documentation](https://mailbux.com/smtp-api)
and [Zammad mailbox setup behavior](https://admin-docs.zammad.org/en/latest/channels/email/accounts/account-setup.html).

## Launch work still required

1. Connect the existing Mailbux mailbox using its dedicated app password and test folder.
   Verify receipt, replies, threading, attachments, bounce handling, sender
   authentication and actual notification delivery using designated test recipients.
   No mail invitations or messages have been authorized/sent by this pilot.
2. Configure a public hostname and HTTPS, staff accounts/MFA, secret rotation,
   recovery access and a production host/resource plan. The private pilot password
   authentication and isolation settings are not a production rollout recipe.
3. Add a dashboard support page and server-side identity mapping keyed by immutable
   reseller IDs. Validate customer/connection ownership in the backend before adding
   references to a ticket. Never send provider passwords or playlist URLs to Zammad.
   No privileged Zammad API token may enter the browser. A failed/uncertain ticket
   creation must be reconciled before retry to prevent duplicate submissions.
4. Keep credit purchase questions with the distributor. Give him only explicitly
   scoped reporting for his descendants; do not expose staff-only notes, sibling
   branches or unrelated reseller identities. Test reparenting/revocation and stale
   sessions. Do not grant him the broad Agent role to achieve reporting visibility.
5. Establish named support responders, hours, priorities, escalation/update targets
   and backup coverage. No live SLA or 24/7 response promise is configured.
6. Add outage announcements and ticket-to-incident links; train staff with the four
   saved replies. Unknown paid-operation outcomes require investigation, not a
   second provisioning/renewal attempt. A ticket action never automatically moves credits.
7. Confirm expected customer/connection counts and provider limits. Run representative
   load/failure tests in staging, then pilot with the distributor and 3–5 resellers.

## Sources

- [Official Docker installation](https://docs.zammad.org/en/latest/install/docker-compose.html)
- [Hardware sizing](https://docs.zammad.org/en/latest/prerequisites/hardware.html)
- [Organization sharing behavior](https://admin-docs.zammad.org/en/latest/manage/organizations/index.html)
- [REST API](https://zammad.com/en/product/features/rest-api)
- [Article and attachment visibility](https://docs.zammad.org/en/latest/api/ticket/articles.html)

Compared with building a ticket system from scratch, this keeps custom work focused
on dashboard identity, ownership and business context. FreeScout was also considered;
its [API](https://freescout.net/module/api-webhooks/) and
[end-user portal](https://www.freescout.net/module/end-user-portal/) are separate
modules. Zammad's existing API and ticket
workflows fit this pilot without buying those additional modules.
