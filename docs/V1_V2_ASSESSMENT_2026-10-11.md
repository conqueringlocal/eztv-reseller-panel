# V1/V2 assessment — October 11, 2026

## Recommendation

Keep V1 as the production panel. Reuse V2's useful modules, but do not migrate
customers merely to obtain PayPal checkout or leave Lovable: V1 already runs on
Cloudflare Pages and its core Trex/credit flows have been materially hardened.
Retain V2 as the development and validation environment for deeper platform changes.
A wholesale switch requires demonstrated business benefit and feature parity.

This is a comparison of the checked-out code, migration history, recorded validation
and V1 database metadata. It is not a new penetration test or a certification that
either system is fully secure. Several V2 overview documents are stale: July PayPal
validation and August launch notes supersede the June 'not built' descriptions.

Reviewed V1 production base: `c12c9fc`; support pilot branch: `4b66f92`.
Reviewed V2 committed base: `6fd3d97`; October PlaylistLabs files include substantial
uncommitted work. That work was inspected but neither edited nor discarded here.

## What each version contributes

| Area | Current V1 | V2 evidence and remaining benefit |
| --- | --- | --- |
| Hosting | Cloudflare Pages frontend; existing hosted Supabase backend | Self-hosted Supabase packaging and migration rehearsal; more operating responsibility, not inherently more secure |
| Live customers and Trex | Existing live customer records; guarded creation/renewal, durable receipts, credit reservations, per-line repairs and review holds | Provider adapters and worker queue; current features document marks live/cron configuration gated. Moving requires new acceptance checks |
| Credit accounting | Integer balances, protected mutation RPCs, manual PayPal approvals, finance/cost tracking | Append-only integer-unit ledger (100 units per credit), reconciliation and fractional refund arithmetic; worthwhile accounting components to adopt deliberately |
| PayPal | Manual requests active; legacy checkout stubs disabled | Actual Orders v2 adapter, create/capture/webhook/refund code, return parser, and recorded July sandbox purchase/refund/resend evidence |
| Customer credentials | Ownership checks and guarded provider flows; no equivalent full credential-encryption rollout established by this assessment | AES-GCM credential envelopes, audited reveal and encrypted migration/renewal paths; a concrete security improvement worth prioritizing |
| Reseller operations | Parent/child credit transfers, sales leads/referrals, sports feed, owner finance tools, administrator reseller login | Those V1 capabilities are not all evidenced as equivalent in V2. In particular, no parent-reseller hierarchy implementation was found in the reviewed V2 migrations/features |
| Support | Separate private Zammad pilot; mailbox prepared but delivery not live | Existing V2 support/settings links are not the new ticket infrastructure. The help desk can serve either panel |
| Managed delivery | Current provider accounts remain in use | October PlaylistLabs/UMP workflow and private deployment work is substantial, but licensed integration/device acceptance is still blocked; it is not ready for customer cutover |
| Branded reseller sites | Coming soon; public publishing disabled | V2 current-features document says white-label is out of scope; switching does not deliver it |

## PayPal reuse decision

Reused the V2 Orders v2 server-side checkout design and adapted its adapter; copied
the tested return/cancel query parser into V1. Kept the existing V1 packages and
$3 USD unit price. V2's `resellers`, `payment_orders`, `credit_transactions` and
100-units-per-credit schema cannot be copied directly into V1's `profiles.credits`.

Additional safeguards were necessary despite successful historical sandbox tests:

- V2 updates an order to `captured` before a separate `grant_credits` call. A failure
  between those calls can leave paid-but-uncredited state. V1 fulfillment now commits
  order state, balance, ledger, revenue and fee in one database transaction.
- V2 webhook insertion treats any insertion error as a duplicate and acknowledges
  it; recording an event before later work succeeds also makes retry recovery
  fragile. The new path returns a retryable error on persistence failure and stores
  completion events in the fulfillment transaction.
- V2 capture code does not compare the returned amount to the stored order or
  comprehensively verify currency/payee. The new adapter checks amount, currency,
  merchant, local order identity, capture status and final-capture flag.
- V2 create/capture requests lack durable PayPal request identifiers. The new path
  uses stable per-order keys and queries PayPal before retrying capture.
- V2 refund units are incompatible with V1 whole credits. Initial V1 rollout records
  refunds/reversals/disputes for explicit admin reconciliation; it does not silently
  round away money or automatically remove spent credits.

Do not interpret the old document's 'nothing PayPal-specific remains' as a current
production-readiness result. Sandbox success does not cover database outages,
out-of-order delivery, all security cases, or this newly adapted implementation.

## Practical direction

1. Finish and validate automatic credit checkout in V1, keeping manual requests as
   a fallback and retaining the distributor's existing credit-sales relationship.
2. Finish the shared help desk and a small reseller support pilot.
3. Backport V2's credential encryption/audited reveal and accounting reconciliation
   through separate, tested migrations with rollback/recovery procedures.
4. Define requirements for distributor hierarchy, customer import and expected
   volume before the 85-reseller onboarding. Neither a version label nor current
   test counts establish capacity for that network.
5. Evaluate managed delivery, fractional credits and multi-provider routing as
   independent projects. Reconsider a full V2 migration only if these require it
   and V1 feature parity, data reconciliation and live acceptance all pass.

Keep the V2 repository and work intact. Avoid parallel implementations of the same
payments/support feature and avoid announcing a customer migration at this stage.
