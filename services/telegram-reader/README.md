# Automatic provider sports feed

This service uses a Telegram **user account**, not a bot. That account must be a member of the provider's original broadcast channel. Creating a new channel does not grant access to the original channel. The owner explicitly chooses a source and enables imports after login.

## Owner setup

1. Add a dedicated Telegram account to the provider's original channel.
2. Sign into that account at https://my.telegram.org/apps and create an API application. Keep its API ID and API hash private.
3. Open https://reseller.eztvclub.com/admin/sports as an administrator. Enter the API credentials and account phone number. Submit to request a Telegram login code.
4. Enter the code in the dashboard, and the Telegram two-step password if prompted. Never paste these into chat, issues, or source control.
5. Select the provider channel and enable automatic updates. Initial import covers 48 hours. Resellers see posts at `/reseller/sports-updates`.

If a channel is missing, join it in Telegram with the same account and use Refresh channel list. The reader lists broadcast channels; it does not ingest private conversations or group chats. Telegram may restrict API registration or login for some accounts; those restrictions cannot be bypassed here.

## Runtime

- Systemd: `eztv-sports-reader.service`; starts at boot, restarts after failure.
- Code: `/opt/eztv-sports-reader/reader.py`; isolated venv with pinned Telethon dependency.
- Environment: `/etc/eztv-sports-reader.env` (root, mode 0600).
- Private session/configuration: `/var/lib/eztv-sports-reader` (service user, mode 0700; files 0600). Backups must protect these as account credentials. Never commit or export them into dashboard responses.
- Scoped worker token matches Vault secret `sports_reader_worker_token`. It cannot access customer provisioning, credits, or payment endpoints. No general Supabase service key is on this worker.
- Edge function `sports-reader` validates administrator JWTs and authoritative roles, or the scoped worker token. JWT gateway verification is disabled because the worker uses a separate header. Authentication is enforced inside the function before actions/body processing.
- Setup inputs are encrypted in Supabase Vault while queued (10-minute lifetime), then atomically claimed/deleted. Only sanitized job metadata remains in the database. Polling claims are deliberately not retried: lost responses require restarting that setup step. Completed sanitized results are persisted locally for retry.
- The session stays on the VPS. Telegram API ID/hash/phone and pending phone-code hash remain in a private local file; login codes and two-step passwords are never written to disk by the worker.
- Reader polls setup/state every 15 seconds and the selected channel every 60 seconds. No inbound public listener, Telegram bot, manual forwarding, outgoing messages, read receipts, HighLevel calls, SMS, or social posting.
- Provider text is treated as data and escaped in the UI. No AI parsing or guessed event times. Publication timestamps display in each viewer's local timezone.
- Private Storage bucket `sports-reader-media`: JPEG, PNG, WebP, PDF; max 8 MiB per attachment; signed links expire after 10 minutes. Attachment signing requires a signed-in profile. Unsupported files retain a notice and any text.

## Reliability and limits

- `(source_id, message_id)` uniqueness prevents duplicate imports. Older edit versions cannot overwrite newer versions. Source generation guards reject writes after pause/source changes.
- Cursor advances only after acknowledged post writes. Batches are capped at 100, so large backlogs drain over multiple polls. Restarts rescan safely; checkpointing is in the database.
- Recent 500 messages within the last seven days are checked for edits and failed attachments every 15 minutes (never before the initial 48-hour start). Edits to older posts and Telegram deletions are not synchronized. Albums display as individual posts. Image/PDF contents are not OCR searched.
- Failed attachment downloads retain text plus a pending notice; retries apply within the edit scan window. Unsupported/oversized files are not repeatedly downloaded.
- Telegram flood waits are persisted and respected, including across restarts. Revoked sessions and inaccessible sources show an administrator error.
- Previously imported posts remain as an archive when the source changes or imports pause. Old media versions remain private; there is currently no automatic archival deletion or storage cleanup policy.
- Dashboard status shows last heartbeat, last successful check, latest source post, and errors. There is no external outage alert yet. A quiet channel is not treated as an outage if checks still succeed.
- The existing `sports_ppv_updates` table and legacy bot webhook/share URLs remain separate. This service does not invoke the old webhook or its HighLevel auto-post function, and new private posts are never inserted into that publicly shared legacy feed.

## Operations

Check without exposing credentials:

```
systemctl is-active eztv-sports-reader
systemctl show eztv-sports-reader -p NRestarts -p User
journalctl -u eztv-sports-reader -n 30 --no-pager
```

Pause via Admin → Sports Updates. Disconnect pauses immediately and then asks the reader to log out its Telegram session. If Telegram is unreachable, check the resulting error and retry disconnect; the UI does not claim successful logout on failure. Reconnection deletes the previous local session and requests a new code; old sessions can also be revoked in Telegram's Devices screen.

For upgrades, run the tests below, stop the service, replace `/opt/eztv-sports-reader/reader.py` and install pinned requirements into its venv, then start it. Preserve private state and environment. Never run two workers against the same Telegram SQLite session. Keep this migration additive; do not run `supabase db push` over the legacy migration history.

Rollback: pause imports or stop the systemd service, redeploy the preceding frontend and keep the additive tables/Storage intact. This does not change customer provisioning or credit records.

## Verification

```
npm run test:sports
/path/to/venv/bin/python -m unittest discover -s services/telegram-reader -p 'test_*.py'
npm run build
```

Database tests run in disposable PostgreSQL with no network. Worker tests use fake Telegram/backend clients and never request login codes. Browser tests should mock Auth, admin setup, and feed APIs; do not send test codes to real Telegram accounts. Live checks can verify heartbeat, paused state, private grants, and unauthenticated endpoint rejection without connecting Telegram.

## Reseller display rules (October 4 update)

The reseller RPC now returns only the selected provider channel's US listings for the current date in `America/New_York`, including DST. Explicit `US|` / `USA|` category labels determine eligibility; US team names and ambiguous/unlabelled services do not. Shared UK/US footer posts retain event text and US labels only. Unsupported category-section layouts are hidden rather than guessed.

Recognized event dates (`start:YYYY-MM-DD`, `@ Oct 3`, or `// ET Sat 3 Oct`) take precedence over original publication date. In dual UK/ET schedules the ET date wins and the parallel UK timestamp is removed. Undated entries use the original Eastern publication date, never edit/import time. Candidate posts are limited to the preceding seven days; stale totals and excluded event lines are removed. Unrecognized or invalid explicit dates are hidden.

Original images/PDFs cannot be reliably filtered by channel/date, so resellers receive text only. Direct access to the originals table and original Storage attachments is now administrator-only. Admin → Sports Updates retains the raw archive for review. Previously issued signed links expire within ten minutes. The old manually shared `sports_ppv_updates` system remains separate.

The reseller page removes old listings at the Eastern date change (checked every second), refetches that day's feed, and only paginates within today's results. Source timezone settings do not override this agreed Eastern display rule.
