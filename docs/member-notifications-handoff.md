# Membership notifications — implementation handoff

27 September 2026. Scope: build the isolated queue and sender with mocked delivery tests. Outbound delivery stays disabled; the owner selected pilot participants on 27 September 2026 (see below). This is a preparation change, not authority to contact volunteers, approve the owner application, activate bookings or enable payments.

## Baseline and ownership

- Clean managed checkout, branch codex/member-notifications, based on main 4ab1ba573f774173ca9cabaca24879401c834854. Original Downloads working tree preserved.
- Database and sender implemented with separate file ownership and parent review. No production migrations, functions, secrets, scheduled jobs or SMTP changes in this phase.
- Design context: basic-membership-pilot-and-notifications-plan.md in the original project docs. The recorded Resend authentication setup is separate from this proposed notification sender; never reuse or expose its stored secret.

## Guardrails

- Separate member_notifications queue; existing booking/calendar integration queue remains untouched.
- Events follow committed submission readiness and immutable review IDs. A pending application alone is not ready for review.
- Held by default. Two gates are required for future delivery: database settings/recipient allowlist and sender environment. Held events are never automatically promoted when either changes.
- Service-only claim/prepare/finish RPCs, bounded leases and retries, stable provider idempotency key. Unknown outcomes stop before the provider's 24-hour deduplication window; successful API acceptance is not inbox delivery.
- Only generic status messages and authenticated portal links. No ID images, document URLs, DOB, guardian evidence or internal notes in queued content or messages.
- Single operational alert mailbox hello@; the personal sandeep alias is not an additional alert destination. Website identities remain separate.
- No real send tests. Local test fixtures are synthetic and provider fetches mocked.

## Deferred before controlled delivery

- Pilot addresses are confirmed below; controlled test sends still require explicit authorization.
- Verify current sending domain and create a separate narrowly scoped notification credential; keep existing Supabase auth SMTP untouched.
- Signed delivery/bounce/complaint webhook processing, suppression and admin delivery-status UI; current queue outcome accepted must not be labelled delivered.
- Confirm log retention and job cadence/monitoring. No scheduler is provisioned here.
- Explicitly review and configure the two disabled gates and pilot allowlist; no blanket release of held backlog.
- Validate actual inbox delivery, authenticated portal links and reply delivery with the chosen pilot.

## Progress and evidence

Completed locally on Node 22. The original Downloads checkout remains untouched by implementation.

- `npm test`: 28 files, 216 tests passed, including 49 mocked sender/template tests. These execute the transpiled handler with mocked Supabase/provider requests; Deno runtime deployment remains unverified.
- `npm run build`: passed TypeScript, production bundle and all release-artifact/SEO checks (154 public page shells).
- `npm run test:e2e:production`: 27 desktop/mobile checks passed; three existing intentional project-specific skips (two desktop-only reliability checks and one mobile-only navigation check). No new skips.
- Applied migration 009 only to isolated Docker container `supabase_db_armature-basic-release-check`. For each `supabase/tests/database/*.sql`, ran `docker exec -i supabase_db_armature-basic-release-check psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"`: 15 suites, 364 assertions passed, including 57 notification assertions. Tests roll back synthetic fixtures.
- Concurrent readiness: `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres PSQL=/opt/homebrew/opt/postgresql@15/bin/psql sh supabase/tests/concurrent_notifications.sh`. Verified through an equivalent Docker psql wrapper: exactly one ready event after simultaneous scan completion. Synthetic fixture cleaned up.
- Independent review fixed a leased/sending transition mismatch and stale saved-registration wording. Real corrections/resubmission RPC integration is covered. Accepted queue state requires a provider ID; no claim of delivered email is made.
- Existing app browser regression uses repository Playwright; no rendered website surface changed. Browser plugin skill was unavailable.

Evidence logs are retained under the original project's `docs/release-evidence/member-notifications-2026-09-27/`. No real email, production migration, function deployment, scheduler or secret change occurred. PR is intentionally draft; activation prerequisites above remain open.

## Delivery tracking and admin status — 27 September 2026

Prepared as a stacked draft on queue/sender commit `e77ff4c2fee9ee76aba3a6f82b1a76cf4d087c33` (PR #87). No production settings changed.

- Added a default-off `member-notification-events` endpoint. `MEMBER_NOTIFICATIONS_WEBHOOK_ENABLED=true` and a dedicated `MEMBER_NOTIFICATIONS_WEBHOOK_SECRET` would be required later. Raw bodies are bounded to 64 KiB and five seconds; official Svix 2.5.0 verifies signatures/timestamp before JSON parsing or database access. The older tested pin was replaced after its transitive dependency audit reported an advisory; current npm audit reports zero vulnerabilities.
- Receipts store only event ID, provider ID, event type and timestamps. Duplicate receipts are idempotent; conflicting IDs fail. Provider acknowledgement and receipt processing serialize on the provider ID, including events arriving before acknowledgement. Delivery status cannot downgrade on late events. No message bodies or recipient details from webhook payloads are retained.
- Bounced, complained and provider-suppressed addresses are blocked at subsequent claim/prepare checks. This cannot recall requests already prepared or in flight. There is no unsuppress control in this release.
- Admin/Super admin only: expandable notification history under Members, with search, status filter, pagination and refresh. Staff/member requests are denied by the database. Logout/account changes clear the view; failed refresh clears stale records. Provider acceptance and recipient-server delivery are explicitly separate; neither proves reading.
- Official protocol sources: https://resend.com/docs/webhooks/verify-webhooks-requests and https://www.svix.com/guides/receiving/receive-webhooks-with-javascript-nextjs/ . Svix 2 verification returns no parsed value; parsing happens only after successful verification.

### Verification

- `npm test`: 30 frontend files, 258 tests, including 37 real HMAC webhook tests plus UI filtering, failed refresh, collapsed-request and logout checks.
- Local SQL: 16 suites, 420 assertions, including 56 new delivery assertions. Container `supabase_db_armature-basic-release-check` only, commands as above.
- `supabase/tests/concurrent_notification_delivery.sh`: overlapping webhook-first and acknowledgement-first transactions and duplicate event race passed using local Docker psql wrapper. Fixtures are synthetic and cleaned up.
- `npm run build`: TypeScript and all production/artifact/SEO checks passed.
- Existing `npm run test:e2e:production`: 27 passed, three existing project-specific skips.
- Synthetic real-component browser preview at `http://127.0.0.1:4350/notification-review.html`: 1440×1000 and 390×844, light/dark/sepia, search and collapse, no document overflow or runtime errors. Used repository Playwright because Browser plugin skill was unavailable. Preview includes both production stylesheets; no real member data used. An initial preview timeout occurred during source changes; stable final runs are recorded separately.
- Deno hosted runtime, actual signed provider requests, inbox delivery and production UI remain unverified. Tests use real signature verification with synthetic secrets and mocked DB responses; no email was sent.

### Remaining activation requirements

Signed-event handling, suppression and the read-only admin UI are now implemented locally. Still required: review/CI, release preparation and runtime checks, separate notification credentials/provider webhook registration, confirmed retention for unmatched events and delivery history, monitored job cadence and reconciliation of unknown/unmatched outcomes, pilot addresses and explicit controlled-send authorization. Existing held backlog will not be released automatically. Paid services and the LLP/payment hold remain unchanged.

## Retention and monitoring preparation — 27 September 2026

The owner explicitly approved 30 days for completed notification history and unmatched webhook receipts, while retaining blocked-address records. This is independent of identity-document retention. See `tools/member-notifications/README.md` for the exact policy and release checklist.

- Migration 011 adds a separate default-off cleanup gate, bounded dry-run/mutation RPC, retained deduplication markers and protected aggregate health reporting. Held history expires without ever becoming sendable. Unknown outcomes and unconfirmed accepted messages remain for reconciliation.
- Minimal event/account/provider identifiers and address hashes remain as pseudonymous deduplication metadata, not anonymous data. These markers prevent archival from permitting duplicate sends and allow late complaints to block future sends without retaining the original address in history. They are removed when either linked account is deleted. Blocked-address records remain separately retained.
- Maintenance endpoint defaults disabled; mutation additionally requires its apply environment flag and database cleanup gate. It accepts no body, uses a separate job secret and makes only cleanup/health RPCs. It never calls the sender.
- Prepared Python monitor validates aggregate response fields, prohibits redirects, bounds response/time and logs no addresses or secrets. It reports failed requests, queue/lease delays, unknown/failed outcomes, missing delivery receipts, unmatched receipts and missed cleanup. Held/dry-run backlog alone is not an alert.
- Independent review found and corrected a cleanup/enqueue lock-order risk by skipping busy advisory locks. Account-deletion coordination is checked separately. Notification concurrency scripts and Python runner tests are included in CI.
- No production migration, deployment, secret, cron job, alert policy or send. Proposed 15-minute pilot cadence and actual alert-channel delivery still require release review and controlled operational testing. Endpoint logs alone do not verify missed-run monitoring.

### Local verification

- `npm test`: 281 tests in 31 files passed, including 23 maintenance-handler tests using the real job-secret helper and mocked database requests.
- `npm run build`: TypeScript, production build and release/SEO artifacts passed.
- `python3 -m unittest discover -s tools/member-notifications -v`: seven tests passed, with subcases covering every actionable signal and invalid responses; no HTTP sent.
- SQL: 452 assertions across 17 files passed, including 32 new operations assertions. Concurrent tests passed inverse enqueue order, complaints in both arrival orders, two cleanup workers and account deletion in both arrival orders. Fixture accounts were removed and cleanup_enabled remained false. Only `supabase_db_armature-basic-release-check` was used. No new rendered website changes in this stage; desktop/mobile evidence belongs to the prior delivery-status PR.

Remaining before pilot activation: review the three stacked PRs and CI, test hosted Deno runtime/dry run, provision separate credentials and a paused job, verify failure/missing-run/recovery alerts with actual receipt, release the approved cleanup controls, select pilot recipients and authorize controlled notification delivery. Previous sending and webhook gates remain disabled, and the paid-service/payment holds remain unchanged.

## Pilot participants selected — 27 September 2026

- priyanka@armatureailabs.com
- rejoe@armatureailabs.com

Selection only: no invitations sent, accounts created, roles granted, production allowlist changed or notification gates enabled. Each participant should register using their own address; account creation is not membership approval. If an address is a Workspace alias, use email sign-in for that exact address rather than Google sign-in as a different primary account.

### Invitation text — individually sent after authorization

Subject: Try basic membership registration at Armature AI Labs

Hi,

Please try our basic membership registration at https://armatureailabs.com/onboarding using the email address receiving this invitation.

Complete your profile and submit the required photo and government ID only through the protected website. Please do not send identity documents by email or chat. We will review your application through the admin portal.

Please let us know if any instructions are unclear or anything fails, including on your phone. Share the step and error message, without personal documents or sensitive details.

This pilot covers free basic registration and approval; paid passes and equipment bookings are not open yet.

Thanks,
Armature AI Labs

### Pilot review checklist

Record completion or issues separately for each participant: sign-in to the intended account, profile and privacy acceptance, secure uploads, pending status, administrator review, approved status across pages, and sign-out/sign-in on mobile. Request corrections only when actually needed; do not reject or revoke real membership solely for a test. Do not claim notification delivery while outbound notification delivery remains disabled.

## Pilot invitations sent — 27 September 2026

The owner said “ok, proceed” after participant selection and invitation preparation. Sent separate invitations from hello@armatureailabs.com to priyanka@armatureailabs.com and rejoe@armatureailabs.com through direct Gmail compose windows in the Armature Work Chrome profile. Subject: Try basic membership registration at Armature AI Labs. Each message used the invitation text above with a personal greeting.

Gmail displayed “Message sent” for each recipient. This verifies send submission, not recipient inbox delivery, reading or completion of registration. No automated notification worker, recipient allowlist, role, membership or payment setting was changed. The personal-account Gmail connector was not used for sending. An automatic review blocked opening the work inbox due to unrelated private-message exposure; direct compose was permitted and used instead.

Next: participants complete their own registration; authorized reviewers inspect actual submissions and record pilot feedback. No scheduled monitoring or reminder sends were configured.

## Automatic pilot activation preflight — 27 September 2026

Owner authorized automatic notifications limited to Priyanka/Rejoe and explicitly approved Resend key/webhook settings access, a separate domain-restricted sending key and secure Supabase storage. Approval does not release held history, unrelated recipients, payment or booking workers.

Live read-only checks: migrations009/010/011 present; notification queue empty; DB.enabled=false, cleanup_enabled=false and pilot_recipients empty. Neither pilot address has an Auth account yet. Notification endpoints are deployed; sender/webhook enable flags hash to false. Dedicated sender Resend key, worker token and webhook signing secret are absent from the secret-name inventory. Existing Cloud Scheduler list contains only scanner refresh and document retention; no notification sender exists.

Independent source audit verified the address allowlist at enqueue and claim/prepare, stale-event suppression, idempotent retry handling and held-history exclusion. Only the two participant addresses may enter the pilot allowlist; hello admin-ready messages remain held.

Provider blocker: current Resend Google login sandeep.devarapalli@gmail.com shows No domains yet. Requested the account owning the already-verified mail.armatureailabs.com domain. No new key/domain/webhook, scheduler, database setting or notification send was created. Automatic approval review initially blocked sensitive dashboard inspection; owner subsequently approved that exact access.

Resume with correct provider account: verify domain, create scoped key and signed webhook, store secrets, configure a paused sender plus monitoring, test runtime authentication/signatures, recheck queue, then enable the exact two-recipient pilot. Delivery/reply evidence requires genuine participant events and participant confirmation; do not manufacture approvals or release historical events to test email.

## General notification release authorization

Owner superseded pilot-only delivery with “yes, lets enable it in general”. Migration024 introduces default-off all_members_enabled and preserves current eligibility, suppression, deduplication and historical held exclusions. Local verification:160 SQL assertions plus3 concurrent scripts;109 sender/webhook/maintenance tests and7 Python monitor tests. Initial test command used nonexistent .ts paths; corrected to existing .js files and all109 passed.

Work Chrome Resend/hello owns the verified mail.armatureailabs.com domain. Created separate Sending-access key81c3b40c-1a40-450c-b314-f02c7daea8ab, limited to that domain; stored in Supabase. Existing Auth key unchanged. Registered webhookcfde5f07-7659-4ae0-b5a7-03e4f9de3322 for sent/delivered/delivery_delayed/bounced/complained/failed/suppressed, with its dedicated secret in Supabase. No open/click tracking subscription.

Hosted runtime checks with database delivery still disabled: sender missing-secret401; authenticated sender200/zero claims; webhook unsigned401; correctly signed unsupported probe200/ignored (no synthetic member event or email). Existing read-only Cloud Run monitor execution member-notification-monitor-pdjp6 succeeded. Cleanup remainsfalse.

Scheduler/IAM creation attempt was blocked by automatic approval review before execution; requested exact authorization for five-minute sender, fifteen-minute read-only monitor, narrowly scoped job invocation, and hello failure/missing-run alerts. No activation claimed until read-back is recorded below.
