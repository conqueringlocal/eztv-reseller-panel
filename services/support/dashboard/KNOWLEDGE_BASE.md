# Private dashboard Help Center

The Help Center uses native Zammad knowledge-base, category, answer, translation
and content records on the existing VPS. Dashboard metadata controls category
audiences, publication state, edit revisions and idempotent writes. Nothing is
copied into Supabase, and no public help site, paid service or AI service is enabled.

## Authoring

Open **Help Center** in the admin dashboard (`/admin/help`), then **New article**.
Choose a category and enter a title and plain-text content. Save a draft to work
privately; publish when ready. Published articles can be edited, returned to draft,
or archived. Saving a published article as draft removes it from reseller view;
**Publish updates** keeps it available. Revision checks reject stale edits, and
retrying an uncertain save uses the same request ID rather than creating duplicates.

Initial categories:

| Category | Audience |
| --- | --- |
| Getting started | Signed-in resellers |
| Credits & renewals | Signed-in resellers |
| Customer setup | Customer guidance, readable by signed-in resellers |
| Troubleshooting | Customer guidance, readable by signed-in resellers |
| Support & requests | Signed-in resellers |
| Sub-reseller management | Signed-in resellers |
| Private admin guides | Admins only |

Customer guidance is not a public customer portal. Resellers can use it when
assisting their own customers. Only admins can create/edit/publish. Category
management, rich-text/image uploads, translations and public sharing are outside
this first version. Content itself will be written separately with the owner.

Resellers use `/reseller/help` to browse/search published articles. Drafts, archives
and private category names/counts are not returned to them. The ticket form offers
a Help Center link and matching article suggestions after a short typing pause.
Suggestions open in another tab so the unsent ticket stays available.

## Privacy and storage

The existing Edge function validates the signed-in user, current role/session and
impersonation expiration. Its HMAC bridge supports `kb_list`, `kb_detail` and
`kb_save`; only a verified admin can save. Every read, search and direct article
link filters by mapped category and publication status on the server. The browser
never receives Zammad credentials or the signing key. Responses are not cacheable
by shared proxies; query caches are scoped to the signed-in user and role.

The native Zammad KB remains **inactive for its public site**. Dashboard publication
uses native `internal_at`, never `published_at`. The external VPS proxy exposes only
the signed adapter; native KB pages and native REST endpoints remain inaccessible.
The dashboard does not grant native Zammad KB reader/editor or agent permissions.
Article bodies are HTML-escaped into native storage and displayed as plain text.
Authoring records preserve the verified administrator UUID and native author ID.

## Deployment and operations

1. Back up the Zammad database.
2. Run `knowledge-schema.rb` using `EZTV_SUPPORT_PILOT=true bundle exec rails runner`.
   It adds four adapter tables and creates one private native KB with seven empty
   categories. Reruns preserve existing articles and category configuration.
3. Copy `knowledge.rb`, `bridge.rb`, and `bridge.yml` to protected `local/dashboard/`.
   Validate Compose and recreate only Rails with `up -d --no-deps zammad-railsserver`.
4. Run backend/browser tests before publishing KB actions through the Edge function.
   Remove registered synthetic article fixtures before rollout. Do not run these
   tests against a publicly enabled KB without isolating their fixture data.
5. Deploy the existing `reseller-helpdesk` Edge function with all three files and
   publish the Pages build. No Supabase schema migration is needed.

Existing backup archives include native KB and adapter tables. The restore test
checks KB/category/article/write counts along with existing support data. Keep
native public publication disabled and use the dashboard editor for these mapped
articles. A manual native edit does not participate in the dashboard revision lock.

Verification: 19 backend checks covering draft/private/archive access, role checks,
safe body storage, title/body search, request replay and stale edits; desktop and
mobile UI flows covering create/draft/publish/search/archive and direct-link privacy;
existing database/Edge tests; TypeScript, targeted ESLint and the production build.
Test fixture content is removed after verification; no starter articles are published.
