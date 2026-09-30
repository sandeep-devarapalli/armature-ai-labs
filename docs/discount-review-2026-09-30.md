# Discount implementation review 30 September 2026

Independent source review of the discount administration and quotation work on `codex/discount-management`. No remaining critical blocker was identified for the stated preparation scope: offer administration and estimates while purchases and payment-provider activation remain closed. This is not approval to connect the discount ledger to real checkout or refunds.

## Sources inspected

- `supabase/migrations/202609300001_discount_management.sql`
- `supabase/tests/database/030_discounts.sql`
- `src/pages/AdminDiscountsPage.tsx`
- `src/components/DiscountOffers.tsx`
- Existing booking-product quotation and equipment-rental schema used by those functions.

## Verified in source

- Offer mutations and member/audit lookup RPCs require Admin or Super admin. Review Staff receive no new permissions. Direct authenticated offer-table access is revoked. Reservation and settlement RPCs explicitly revoke PUBLIC, anonymous and authenticated execution and grant service-role execution only. Arbitrary-price private helpers are also revoked from the service role.
- Public projections omit private targets, coupon codes and audit records. Personal offers are selected by the authenticated account. Frontend account changes hide the previous account's offer snapshot; the Admin editor remounts for a changed account.
- Prices come from stored booking products or an owned, unexpired equipment quote. Percentage/fixed offers are compared against launch pricing, reductions are capped at the subtotal, and students are restricted to at most 20 percent on individual coworking after launch pricing. A pass spanning the launch-expiry boundary is rejected for pricing review.
- The reservation ledger locks the offer before testing usage limits. Settlement takes the same offer lock and checks `clock_timestamp()` after acquiring locks, preventing a transaction-start timestamp from reviving expired quota. Idempotency conflicts are rejected. A captured use cannot be reset to released through the settlement API.
- Access snapshots now persist the selected resource and original access quotation, explicitly labelled pre-tax only. Equipment snapshots persist the source quote ID, tax basis points, discounted tax and total; their expiry cannot exceed the underlying equipment quote. Original rental payable values and payment state are not rewritten.
- Migration code does not activate payment gates, seed production offers, grant entitlements or contact payment providers. The Admin interface distinguishes its editable illustration from a server quotation and says saving does not create a purchase.

## Findings resolved during review

The first draft silently repriced cross-year passes at the base rate, omitted source references from stored snapshots, and used transaction-start time for settlement expiry. The current source rejects the ambiguous boundary, persists source context, and uses consistent offer locking with current-time expiry checks.

## Verification limits and release checks

This reviewer did not execute SQL, browser or concurrency tests during this independent review. The backend owner subsequently reported 65 discount assertions and all 868 assertions across 29 SQL suites passing; those results are recorded in the parent progress note and remain distinct from this source-only review. Tests visible in source cover server pricing, private visibility, role restrictions, one-use consumption, fixed reductions, expired/paused offers, launch/student selection, equipment source/tax snapshots and unchanged rental payment state. The requested repeat-until-expiry test with two captures and a per-member cap was added and reported passing before handoff.

Real checkout integration remains deferred. Service-only reservation/capture currently manages discount usage, not proof of provider payment. Access estimates are pre-tax; a future payment adapter must bind the source quote and final tax, allocate discounts consistently across payable items, verify provider receipts, and use captured monetary snapshots for partial or full refunds. This review does not establish that such an adapter or refund execution exists.
