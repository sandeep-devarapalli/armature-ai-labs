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

The engine selects one best eligible offer, optionally applied after the approved launch reduction. It does not stack arbitrary campaigns together. Awarded student offers are restricted to at most 20% on individual coworking after launch pricing. Public and own-account projections keep private target identities/codes out of public pages; exhausted offers are excluded. Public membership and equipment pages show relevant offers. The isolated booking-beta page intentionally makes no booking RPC requests and retains its static estimator. The existing beta estimate is still illustrative, not a final payable quote.

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

## Reproduction and teardown

The full local suite used `docker exec -i supabase_db_armature-equipment-wishlist-check psql -U postgres -v ON_ERROR_STOP=1 < "$test_file"` for every `supabase/tests/database/*.sql`, retaining separate logs in `/private/tmp/discount-database-suite/`. Each log was inspected for `not ok` and `ERROR:`; only successful TAP plans remained. The final expanded `030_discounts.sql` was rerun after adding repeated-use cases.

Final local read-back: booking mock gate false; equipment mock gate false; synthetic discount users/offers zero; private discount quotes and redemptions zero. SQL tests roll back; concurrency teardown removes its own synthetic fixtures.

## Remote handoff

- Implementation commit: d83810c56b61cb3bdd641843733bde69de3bb01c
- Draft PR: https://github.com/sandeep-devarapalli/armature-ai-labs/pull/104
- Initial CI: https://github.com/sandeep-devarapalli/armature-ai-labs/actions/runs/36730307956
- Initial frontend CI stopped on pre-existing development dependency advisories (brace-expansion and undici via jsdom/miniflare/wrangler). Production dependency audit passed. A targeted non-major dependency repair is being validated separately; no `--force` or payment change.

## CI dependency repair

The initial full audit failure was reproduced locally. Updated only the affected development dependency chain: Wrangler 4.131.0 to the first patched 4.144.0, brace-expansion 2.1.7/5.0.12, fast-uri 3.1.8, and undici 7.29.1/8.11.2 within dependency constraints. Wrangler already used Miniflare 5 alpha; this does not introduce a new major/prerelease line. No force upgrade or runtime product dependency change.

After the update: complete audit reports zero vulnerabilities; production audit clean; all 367 unit tests pass; build and 156-page SEO/artifact checks pass; Cloudflare `check:pages-runtime` passes 22 bounded HTTP probes. A late quote-preview error-handler change required `Promise.resolve` around Supabase's PromiseLike RPC builder; TypeScript/build and the 10 discount tests pass after correction. The initial commit omitted the locally tested new quote-preview component from explicit staging; the follow-up commit includes it before final CI.

Dependency test logs: `/private/tmp/discount-dependency-tests.log`, `/private/tmp/discount-dependency-build.log`, `/private/tmp/discount-dependency-runtime.log`.


## Final browser boundary correction

CI run 36731090521 passed the full database job (29 files, 868 assertions, all concurrency scripts) and both 24-test registration fixture runs. Its final production browser subset found that adding dynamic offers to the isolated booking beta violated that page's existing no-RPC boundary. The test flags all RPC requests, including reads. Kept that test unchanged, removed the dynamic offer panel from booking beta, and switched the remaining stable offer-list reads to HTTP GET. Membership and equipment pages retain relevant offers. Final exact-env verification passed: 367 unit tests, 24 prebuilt alternate-backend registration/admin browser tests, and 31 production browser tests with 3 expected skips. Both booking-beta no-RPC checks passed unchanged. A local six-worker screenshot timeout was resolved by matching CI's two-worker setting; one intermediate shell omitted CI flags and was corrected explicitly rather than changing assertions. Reproduction script: `/private/tmp/discount-get-production-final.sh`; logs: `/private/tmp/discount-get-{tests,build,prebuilt,production-final}.log`.
