# Policy corrections and Razorpay TEST review, 4 November 2026

Prepared for owner review. These changes coordinate commercial policies, government-ID consent/deletion and an isolated Razorpay TEST integration. They are not published and do not activate live payments or establish provider approval.

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
| Actual provider-delivered HTTPS webhook | Not yet verified. The owner approved temporary HTTPS testing. The listener rejected login/Admin/payment-creation paths with 404 and unsigned webhook requests with 401. The tunnel lost connectivity before registration and was stopped. Razorpay then required sign-in; Google sign-in could not connect to reCAPTCHA. No webhook was registered. Owner sign-in is pending; the local TEST ledger gate is disabled. |

The local SQL ledger recorded one captured and one failed test payment. Real bookings, paid entitlements, paid membership terms and identity-service periods remained zero. The local lab was stopped and its ledger gate restored to false. The replacement TEST key is stored only in ignored owner-only local server configuration; its temporary downloaded CSV was removed. The initially exposed test key was replaced with immediate deactivation selected under explicit owner approval.

## Combined verification and remaining release gates

- `npx tsc --noEmit`, the app TypeScript build and `npm run build` passed, including release/SEO artifact checks.
- `npm test`: 1,124 tests passed across 99 files.
- Existing `npm run test:e2e`, using a private config on dedicated loopback port 57443: 184 passed; 18 existing environment-dependent tests skipped. The first run was stopped because default port 4173 belonged to an older worktree. No test failure was bypassed; the dedicated run used this branch's demo build.
- Deno: 17 pure handler/core tests and function/harness type checks passed. Production-env script tests: 5 passed.
- Actual native PostgreSQL migration/SQL assertions and retention/payment concurrency tests passed against synthetic local records. Initial PR CI passed unit/Deno/audits and the standard browser suite. Broader registration fixtures still expected the removed consent and prohibited the approved government-ID-only reupload flow; the SQL fixture also needed to model protected Storage API cleanup. These scoped test-fixture corrections are being validated in CI; no complete green result is claimed here. Hosted end-to-end Auth/Storage remains a separate rehearsal.
- Independent scoped reviews found no remaining commercial/ID-copy contradiction or new material payment-security issue after fixing webhook replay and bounded recovery.

**Before live payment collection:** resolve and successfully retest the provider refund rejection; verify actual HTTPS webhook delivery; finish the hosted synthetic Auth/Storage/retention activation rehearsal; connect reviewed commercial prices, tax/deposit breakdowns, booking availability and fulfilment to server quotes; confirm Razorpay merchant activation/account agreement and operating responsibility for refunds and D+4 complaints; obtain owner review and explicit production release/payment authorization. This stage deliberately exercises a synthetic INR 1 fixture and does not claim a completed customer booking checkout.


## Review delivery

Local review branch: `codex/razorpay-test-mode`. The source changes are committed locally. Two Git pushes were rejected by GitHub with server-side ref/HTTP500 errors; the branch was not created remotely. Automatic approval review then rejected an API upload because these changes would become public repository content under the review-before-publication hold. The owner subsequently explicitly approved creating the public draft PR. Upload and remote CI are not yet verified. No merge, production deployment, production migration or payment activation is authorized.

Owner-facing local report, full patch and genuine browser screenshots are preserved under `output/razorpay-review-2026-11-04/` in the shared Armature Lab workspace. The owner explicitly approved a temporary test-only HTTPS webhook endpoint, limited to signed webhook delivery and removed after testing. Actual delivery and cleanup results are recorded separately; no local Admin/login route may be exposed.


## Approved public review and temporary endpoint follow-up

The owner explicitly approved public draft publication and temporary test-only HTTPS webhook exposure on 4 November 2026. [Draft PR #171](https://github.com/sandeep-devarapalli/armature-ai-labs/pull/171) is open and remains unmerged. No production deployment or payment activation is authorized.

The isolated webhook-only listener was checked before exposure: login, Admin/payment operations and health routes returned 404; the unsigned webhook returned 401. A temporary Cloudflare Quick Tunnel was created, lost connectivity during a network interruption before Razorpay registration, and was stopped. The dashboard session then required sign-in, and the normal Google sign-in flow reported a reCAPTCHA connection failure. No webhook was registered and actual provider delivery remains unverified. Both local test listeners were stopped and the SQL test gate verified false while awaiting owner sign-in. No live key was generated, existing key rotated or production setting changed during this follow-up.
