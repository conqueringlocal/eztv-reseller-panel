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
- Suggested future inbox: `support@eztvclub.com`; no mailbox has been created or connected.
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
docker compose exec -T zammad-railsserver rm /tmp/eztv-pilot-users.json /tmp/eztv-bootstrap.rb
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

Run from the V1 repository:

```sh
python3 services/support/check-pilot.py
python3 services/support/test-pilot.py
python3 services/support/test-recovery.py
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

## Launch work still required

1. Create the dedicated mailbox and connect its real inbound/outbound service.
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
