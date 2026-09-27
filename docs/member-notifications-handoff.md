# Membership notifications — implementation handoff

27 September 2026. Scope: build the isolated queue and sender with mocked delivery tests. Outbound delivery stays disabled; pilot participants will be chosen later. This is a preparation change, not authority to contact volunteers, approve the owner application, activate bookings or enable payments.

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

- Confirm pilot names/addresses and authorise controlled test sends.
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
