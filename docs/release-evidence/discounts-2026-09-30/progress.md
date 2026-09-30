# Discount management implementation and Claude review

Owner authorised implementation on 30 September 2026, including personal discounts usable once or repeatedly until expiry. Default personal usage is once. This note records implementation evidence and limits for independent review. It is not a payment-launch approval.

## Confirmed scope

- Admin and Super admin manage personal offers, scheduled general promotions and optional coupon codes. Membership-review Staff receive no new permissions.
- Percentage or fixed INR reductions; explicit coworking, cabin and equipment scope; start/end timestamps displayed in IST; expiry and redemption limits.
- Personal offers are private. Public offers use a safe projection without personal targets, private codes or internal audit data.
- Best eligible offer by default. Only explicitly allowed combinations stack. Preserve the approved launch offer plus awarded student discount (up to 20%, individual coworking only).
- Server-derived prices and eligibility, atomic usage enforcement, immutable accepted price/discount snapshots, and refunds based on amounts paid.
- No Razorpay setup, payment activation, entitlement grants, actual purchases or production offers are authorised by this implementation.

## Plan

1. Reuse the completed managed checkout, based on current main, preserving the original dirty Downloads project.
2. Add protected offer administration, quoting and an idempotent redemption ledger. Keep future payment-provider hooks separate from real payment processing.
3. Add Admin Discounts and relevant public/private offer presentation in the existing design.
4. Run local synthetic database and concurrency tests, existing frontend/build checks and desktop/mobile browser checks. Review permission and price-trust boundaries.
5. Create focused reviewable PRs and record exact commits, commands, outcomes and uncompleted release requirements here.

## Starting evidence

- Branch: codex/discount-management
- Checkout: /Users/dev/.codex/worktrees/mhs-blog-cover/Armature Lab
- Base: 9d96a33e5b486b9c7292fbf0d3dc0704c018b110
- Existing discount support is a generic protected percentage in booking quotes and a public launch/student estimator, not persistent campaigns or personal awards.
- Local Docker instances are available. Only isolated synthetic local databases may be used for tests.
- Existing source is preserved; unrelated tools/member-notifications/__pycache__ remains untouched.

## Verification and open items

Implementation in progress. No checks claimed yet. No production settings changed.

## Baseline checks

- Node 22 `npm test`: 41 files, 357 tests passed, 7.80 seconds.
- Initial Vite run hit sandbox EPERM writing its temporary bundle; retried with scoped worktree write permission and passed. This was a filesystem access issue, not a failing test.
- `git fetch origin main` and branch creation required scoped git metadata write permission; succeeded without resetting any checkout.

## Implemented behavior

Admin and Super admin can create, edit, pause and expire offers at `/admin/discounts`, with revision checks and audit history. Personal offers default to one use and also support repeated eligible purchases until expiry, optionally capped per member. General promotions and private coupon codes support percentage/fixed INR amounts, category scope and purchase-time windows displayed in IST. Definitions start paused in the UI. The member picker identifies the recipient before confirmation.

The engine selects one best eligible offer, optionally applied after the approved launch reduction. It does not stack arbitrary campaigns together. Awarded student offers are restricted to at most 20% on individual coworking after launch pricing. Public and own-account projections keep private target identities/codes out of public pages; exhausted offers are excluded. Public membership, equipment and booking-beta pages show relevant offers. The existing beta estimate is still illustrative, not a final payable quote.

Server quote helpers derive prices from configured products or owned unexpired equipment quotes. Admins can request a saved personal offer's target-member coworking quote where product prices are enabled. Access snapshots preserve product, dates, seats and resource, explicitly pre-tax. Equipment snapshots preserve source quote, tax and total. Previewing never reserves or consumes a use.

The service-only reservation/settlement ledger is preparation for the future payment adapter, not proof of payment. Reservation locks enforce limits and quote revisions; capture checks actual clock time after offer locks; repeated requests are idempotent. This release does not connect those snapshots to the old mock checkout or its refund totals. Real provider order binding, payment receipt validation, final workspace tax configuration and refunds against actual paid totals remain required before activation.

## Validation completed

- Node 22 `npm test`: 42 files, 367 tests passed.
- `npm run build`: TypeScript, build, route shells, 156 initial-HTML public-page SEO checks and release asset checks passed. Existing large 3D/map chunk and mixed SEO import warnings remain.
- `npx playwright test --config playwright.basic-registration.config.ts`: 24 passed, 21.1 seconds; includes new discount controls plus existing onboarding, account navigation and release-gate checks.
- Focused discount browser checks: 8 passed across desktop/mobile and light/dark/sepia. Synthetic screenshot evidence retained alongside this note.
- Independent source review: `docs/discount-review-2026-09-30.md`. Initial cross-year pricing, source snapshot and expiry-locking findings were fixed before final checks.
- Backend reports all 29 SQL files passing, with 65 new discount assertions; final concurrency totals and commands to be appended below.
- `git diff --check`: passed.

## Release boundaries and Claude review checklist

- No live Supabase migration, offer creation, payment configuration or website deployment performed in this task.
- Apply the reviewed migration before publishing the UI; otherwise the new RPCs are unavailable. No offers are seeded by the migration.
- Verify personal once/repeat limits, coupon eligibility, safe public projection, direct role permissions, stale revisions, source/tax snapshots and the expiry race using the committed tests.
- Verify the retained payment and mock-grant gates remain closed before and after any later production release.
- Do not call the service settlement RPC as a substitute for a payment provider receipt. Never use an undiscounted old mock order's total to refund a discounted future purchase.
- For public offers, scheduling refers to when a purchase qualifies. The separate approved launch offer additionally checks service dates. A pass crossing the launch expiry requires review.

## Final local database results

- Isolated synthetic database: `supabase_db_armature-equipment-wishlist-check`, localhost port 58322.
- All 29 SQL suites: 868 assertions passed, including 65 discount assertions.
- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:58322/postgres PSQL=/opt/homebrew/opt/postgresql@15/bin/psql sh supabase/tests/concurrent_discounts.sh`: passed; exactly one limited-use reservation succeeds and a transaction begun before expiry cannot capture after expiry.
- Same local DATABASE_URL with `concurrent_equipment_rental.sh` and `concurrent_workspace_pass.sh`: passed; equipment loser rolls back workspace and monthly/day conflicts remain enforced.
- Temporary full database logs: `/private/tmp/discount-database-suite/`; migration log: `/private/tmp/discount-migration.log`.
