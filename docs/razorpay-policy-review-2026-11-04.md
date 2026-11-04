# Policy corrections and Razorpay TEST review, 4 November 2026

Prepared for owner review. These changes coordinate commercial policies, government-ID consent/deletion and an isolated Razorpay TEST integration. They are available in a public draft PR, remain undeployed on the live website and do not activate live payments or establish provider approval.

## Approved commercial decisions

| Offering | Duration and deposit |
| --- | --- |
| Whole cabin | Monthly rent, minimum 3 months, security deposit equal to 2 months' rent. Existing 30-day termination notice after the minimum remains. |
| Individual hot desk or seat | Day, week or month pass. The cabin minimum and deposit do not apply. |
| Equipment rental | Week or month rental, minimum 1 week. Any asset-specific deposit must be disclosed before payment. Initiate the deposit refund within 7 working days of return, less documented unpaid charges or damage; checking cannot postpone the start of this period. |
| Workshop, event or meeting room | The stated session duration. |

For all day, week and month hot-desk/reserved-seat passes, cancellation at least 48 hours before the start receives a full refund. Later cancellation and no-show are non-refundable; after the pass starts, unused time is non-refundable. These rules supersede the earlier quote-dependent desk placeholders.

Damaged, defective, wrong or missing hardware is reported within 3 calendar days after delivery or pickup. Reasonable opening and testing do not bar a valid defect claim; applicable manufacturer warranties remain available under their terms. Refund and shipping pages now use the same reporting window.

Missing items do not require a return. Claims are assessed against fulfilment and delivery records; approved refunds follow the existing 5-7-working-day initiation deadline from approval. The returned-item inspection clock applies only where an item is returned.

Complaints are acknowledged within 1 business day and resolved by D+4 business days, where D is the date the complaint is received. The earlier 48-hour acknowledgement/30-day resolution copy is removed. This publishes an operational commitment; the responsible team still needs to deliver and record it.

Approved refund deadlines have explicit triggers: initiation within 5-7 working days of approval; cabin-deposit refund initiation within 7 working days of move-out; equipment-deposit refund initiation within 7 working days of return, less documented unpaid charges or damage; returned-item checking and replacement arrangement/refund initiation within 5 working days of receiving the item. Bank-credit time is separate. Confirmed duplicate-charge refund initiation uses the existing 5-7-working-day window from confirmation.

The booking beta's cabin figure is explicitly one month's rent, excluding the full minimum commitment, deposit and tax. Its full-term quote must resolve any launch-price transition. This change does not modify approved rates or the estimate calculator. Unpriced sprint copy now says "Enquire for a quote"; the unapproved certificate claim is removed.

## Decisions still required before the relevant paid offer opens

- Equipment asset-deposit amounts must be set in the accepted asset quote before payment, and deductions require documented unpaid charges or damage. The owner has now approved the refund deadline; no deposit amount has been invented.
- Operational hardware handling must follow the published missing-item record check and returned-item inspection rules. Applicable warranty and defect claims must not be rejected solely because reasonable testing opened the product.
- Confirm current prices, availability, taxes, funding for refunds, monitored contact channels and ownership of the published complaint deadlines before launch. Policy text does not prove these operations work.

The commercial-copy changes below are accompanied by the coordinated privacy, consent and deletion changes described next. No production member data has been changed.

## Verification

The legal-copy digests are updated only for these approved corrections. Explicit checks cover cabin-only minimum/deposit scope, equipment periods, the desk 48-hour cancellation boundary and after-start rule, equipment-deposit deductions and the return-based deadline, hardware reporting/testing/warranties, refund initiation and complaint deadlines. Existing operator, address, footer and policy rendering guards remain in place.

Passed after the final desk/deposit decisions: `npm test -- tests/frontend/legal-policies.test.tsx tests/frontend/booking-beta-page.test.tsx tests/frontend/retired-site-copy.test.ts` (3 files, 25 tests), plus scoped `git diff --check`. Full-suite, build and browser checks remain with the combined implementation. No production or provider payment was made for this stage.


## Government-ID changes prepared together

- Privacy and required upload consent remove future equipment-eligibility/convenience retention. The new consent version is recorded separately from historical consent.
- Initial free Verified review retains an ID for up to 7 days from upload. Review completion ends that purpose; an explicitly approved active service can continue the necessary retention.
- After the last active service ends, access stops and cleanup queues immediately; physical copies and unnecessary ID details must be deleted within 24 hours. Overdue deletion is an alerting failure, not a silent extension.
- Actual service periods require bounded, audited independent Admin approval. Mock bookings, test captures, free membership and free courses cannot extend ID retention. Future services require a fresh document when the old one is deleted.
- Existing identity approval/mobile verification/free learning remain separate from copies. Verification photos retain their separate 30-day rule.
- Migration 001 defaults off. Publication must be coordinated with reviewed real-service backfill, activation at 168 hours and worker/document-function release. The runbook is `tools/onboarding-retention/README.md`. No production migration or cleanup was run.

## Razorpay TEST implementation and actual results

The Admin-only test console accepts only server-created INR 100-paise synthetic quotes. It creates actual Razorpay TEST orders, verifies callback HMAC against the stored server order, checks provider payment facts, reconciles payment/refund status and supports refunds with a durable UUID in the documented `X-Refund-Idempotency` header. Signed webhook handling verifies the raw body, deduplicates durable event receipts and recovers events that arrived before local order/refund mapping.

All three gates default off: frontend TEST flag, server TEST flag and isolated database ledger setting. Live keys are rejected. Test ledger changes never create real bookings, paid entitlements, Premium membership or identity-service periods. The production build assertion rejects the TEST console flag. No provider secret is a browser variable, bundle asset or Git file.

The standalone development lab uses **synthetic Admin authentication**, actual local PostgreSQL SQL functions and the actual Razorpay TEST API. It is not evidence of a full hosted Supabase Auth/Storage deployment. Launch instructions are in `scripts/razorpay-test-lab.README.md`.

| Actual provider check | Result |
| --- | --- |
| Server-created INR 1 test order and standard checkout | Passed |
| Published RuPay test card, callback HMAC and provider-confirmed capture | Passed |
| Cancelled card attempt, SDK failure notification and provider reconciliation | Passed; failed attempt remains unpaid and does not terminally fail a retryable order |
| Normal refund | Blocked: provider HTTP 400 `BAD_REQUEST_ERROR`, description `invalid request sent`, including after the documented idempotency header. Read-only reconciliation found no provider refund. Cause remains unconfirmed. Local refund is held in `needs_review`; no further retry is automatic. |
| Actual provider-delivered HTTPS webhook | Passed: a fresh RuPay sandbox capture generated `payment.authorized`, `payment.captured` and `order.paid`. All three raw-body signatures were verified and their durable SQL receipts applied. The temporary webhook was then deleted and the tunnel/listeners stopped. |

The local SQL ledger recorded two captured and one failed test payment; the second capture verified actual provider-delivered webhooks. Real bookings, paid entitlements, paid membership terms and identity-service periods remained zero. The local lab was stopped and its ledger gate restored to false. The replacement TEST key is stored only in ignored owner-only local server configuration; its temporary downloaded CSV was removed. The initially exposed test key was replaced with immediate deactivation selected under explicit owner approval.

## Combined verification and remaining release gates

- `npx tsc --noEmit`, the app TypeScript build and `npm run build` passed, including release/SEO artifact checks.
- `npm test`: 1,124 tests passed across 99 files.
- Existing `npm run test:e2e`, using a private config on dedicated loopback port 57443: 184 passed; 18 existing environment-dependent tests skipped. The first run was stopped because default port 4173 belonged to an older worktree. No test failure was bypassed; the dedicated run used this branch's demo build.
- Deno: 17 pure handler/core tests and function/harness type checks passed. Production-env script tests: 5 passed.
- Actual native PostgreSQL migration/SQL assertions and retention/payment concurrency tests passed against synthetic local records. Initial PR CI passed unit/Deno/audits and the standard browser suite. Broader registration fixtures still expected the removed consent and prohibited the approved government-ID-only reupload flow; the SQL fixture also needed to model protected Storage API cleanup. These scoped test-fixture corrections passed 36 focused desktop/mobile registration tests, protected-deletion SQL checks and the complete native payment concurrency test without ripgrep. The draft PR tracks the final exact-head CI result; no earlier run is represented as final sign-off. Hosted end-to-end Auth/Storage remains a separate rehearsal.
- Independent scoped reviews found no remaining commercial/ID-copy contradiction or new material payment-security issue after fixing webhook replay and bounded recovery.

**Before live payment collection:** resolve and successfully retest the provider refund rejection; configure the reviewed production webhook only during an authorized release; finish the hosted synthetic Auth/Storage/retention activation rehearsal; connect reviewed commercial prices, tax/deposit breakdowns, booking availability and fulfilment to server quotes; confirm Razorpay merchant activation/account agreement and operating responsibility for refunds and D+4 complaints; obtain owner review and explicit production release/payment authorization. This stage deliberately exercises a synthetic INR 1 fixture and does not claim a completed customer booking checkout.


## Public review and completed temporary webhook test

The owner explicitly approved public draft publication and temporary test-only HTTPS exposure on 4 November 2026. [Draft PR #171](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/171) is open and remains unmerged. No production deployment or payment activation is authorized.

Before exposure, the isolated listener rejected login and payment-creation routes with 404 and unsigned webhook requests with 401. After the owner restored the dashboard session, the merchant identity and Test Mode were verified. A temporary Cloudflare Quick Tunnel was registered with a dedicated signing secret and seven supported payment/refund events. A fresh INR 1 RuPay sandbox transaction produced three actual provider events: `payment.authorized`, `payment.captured` and `order.paid`. Each passed the real shared raw-body HMAC handler and applied to the native local SQL ledger. The test order was captured and no real access was granted.

Cleanup was verified in Razorpay's Test Mode webhook list: the temporary webhook was deleted and the list returned to its original empty state. The tunnel, isolated relay and local lab were stopped; both loopback listeners were closed, the retired tunnel returned HTTP530, and the SQL test gate was false. Real bookings, paid entitlements, paid membership terms and identity-service periods remained zero. No live key, production setting or real member record was changed.

Owner-facing local report, full patch and genuine browser screenshots are preserved under `output/razorpay-review-2026-11-04/` in the shared Armature Lab workspace. `test-webhook-removed.jpg` records Test Mode and the empty webhook list after cleanup. Hosted Supabase Auth/Storage, real-commercial quoting and the rejected sandbox refund remain outside the completed webhook evidence.
