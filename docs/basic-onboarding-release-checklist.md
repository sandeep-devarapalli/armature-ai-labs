# Independent basic-registration release checklist

Prepared 26 September 2026. This is a source-selection and verification plan, not evidence that the checks or deployment below have run.

Source inspected: `codex/secure-basic-onboarding` at `57c4afdc105e44e1a49e12b422a3633d141a726e`, compared with fetched `origin/main` at `864be31ce00a49e8d7b7414030f756ee9440d779`. Refresh both references before preparing the release. Incorporate separately reviewed retention changes made after that source commit.

The coordinating task's production inventory found migrations `202607260001` through `202607260012` and `202609020001`; no onboarding migrations were present. Recheck this inventory immediately before any migration. Do not apply the stacked checkout with an unrestricted `supabase db push`.

## Scope and separation

Prepare a focused branch from current main. Do not merge the PR73 → PR78 → PR79 stack to release basic registration. Free registration, identity review and corrections do not activate a paid membership. Keep paid/team membership, component requests, booking workers and payments disabled. Razorpay TEST remains on hold during the LLP name change.

Deploying the cleanup infrastructure does not open intake. Keep all three intake gates false until the final release checklist passes: `public.onboarding_settings.enabled`, Edge `ONBOARDING_ENABLED`, and frontend `VITE_BASIC_ONBOARDING_ENABLED`. Retention has its own independent `ONBOARDING_RETENTION_ENABLED` gate and must continue running when intake is closed.

## Exact source manifest

### Database and Edge Functions

Select these complete migrations, in order, after confirming the core schema prerequisites already exist:

- `supabase/migrations/202609260002_basic_onboarding.sql`
- `supabase/migrations/202609260003_onboarding_corrections.sql`
- `supabase/migrations/202609260004_onboarding_notice.sql`
- `supabase/migrations/202609260005_onboarding_launch_notice.sql`

Their prerequisites are existing auth users, `public.staff_roles`, `public.staff_role`, `private.is_staff`, the `extensions` schema/UUID function, and Supabase Storage tables. They do not depend on the team-membership or Gmail-delivery migrations. Migration002 creates the private image bucket, application/document/review tables and deletion RPCs;003 adds revision-safe corrections;004 records versioned notice acceptance. Preserve `enabled=false` throughout installation.

Select these complete function files:

- `supabase/functions/onboarding-document/index.ts`
- `supabase/functions/onboarding-retention/index.ts`, including the separately reviewed dedicated retention credential update
- `supabase/functions/_shared/onboarding-scanner.ts`
- `supabase/functions/_shared/scanner-identity.ts`

Retain current-main `_shared/http.ts`, `_shared/cors.ts`, `_shared/supabase.ts` and `_shared/env.ts` dependencies. Port only the narrow dedicated-retention-secret support if the reviewed implementation changes `_shared/env.ts`; do not change booking-job authentication. In `supabase/config.toml`, select only the `functions.onboarding-document` and `functions.onboarding-retention` sections (`verify_jwt=false`): document requests perform user authentication internally, retention requests require their dedicated secret.

Do not select `202609250001_team_membership.sql`, `202609260001_gmail_delivery_guard.sql`, `_shared/booking-mail.ts`, `_shared/google-mail.ts`, booking-specific changes to `_shared/google.ts`, or changes to `calendar-sync` and `retry-reminders`.

### Production UI

Select these complete files:

- `src/lib/onboarding.ts`
- `src/pages/OnboardingForm.tsx`
- `src/pages/OnboardingPage.tsx`
- `src/pages/OnboardingLocalPage.css` (also styles the production form despite its name)

The form imports `getAgeOnDate` from `src/lib/membershipPreview.ts`. To keep the release independent, move only `getAgeOnDate` and its private `dateValue` dependency into `src/lib/onboarding.ts`, update the form import, and add equivalent date-validation/age-boundary tests. Do not copy the whole paid-pass preview module just for this helper.

Select only these hunks from shared files:

| File | Required selection |
| --- | --- |
| `src/config/release.ts` | `isSupabaseConfigured` import and explicit default-off `basicOnboardingAvailable` export. |
| `src/app/routes.tsx` | Basic gate import, lazy `OnboardingPage`, `/onboarding` route, and auth/callback gates permitting basic-only access. Do not copy team routes or paid membership-preview routes. |
| `src/lib/authReturnPath.ts` | `onboardingAuthReturnPath` helper, preserving the existing safe-return-path behavior. |
| `src/pages/AuthPages.tsx` | Basic-only callback destination and private/free-registration copy. |
| `src/lib/seo.ts` | `onboarding: "Basic Membership"` operational title; retain the existing operational-page noindex behavior. Add local-preview title only if retaining that dev-only fixture. |

Keep current-main `src/context/AppContext.tsx`, `src/lib/liveData.ts`, `src/types/database.ts`, `src/types/domain.ts`, `src/components/Shell.tsx`, `src/pages/MemberPages.tsx` and `src/pages/AdminPages.tsx`. Their stacked changes concern team access, not basic onboarding. In particular, do not introduce `list_my_team_access` or `create_booking_with_access` RPC calls into this release. The selected onboarding form uses its supplied Supabase client directly and performs staff authorization through database policies/RPCs.

`src/pages/PrivacyPage.tsx` is already on main. Its launch wording still requires a separate reviewed edit; it must not claim applications are open before the gates open. Add a clear public registration link only as part of the final intake release, preserving existing page content.

### Verification fixtures and operations

Select:

- `supabase/tests/database/012_basic_onboarding.sql`
- `supabase/tests/database/013_onboarding_corrections.sql`
- `supabase/tests/database/014_onboarding_notice.sql`
- `tests/frontend/onboarding-form.test.tsx`
- `tests/frontend/onboarding-scanner.test.js`
- `tests/frontend/scanner-identity.test.js`
- Basic-only hunks in `tests/frontend/auth-callback.test.tsx` and `tests/frontend/release-gates.test.tsx`
- `scripts/test-onboarding-local.mjs`
- `scripts/run-onboarding-retention-local.mjs` and `tests/scripts/onboarding-retention.node.mjs`, including the dedicated-secret update
- `src/lib/onboardingLocal.ts`, `src/pages/OnboardingLocalPage.tsx`, `playwright.onboarding-local.config.ts`, and `tests/frontend/e2e/onboarding-local.spec.ts` for connected synthetic browser tests
- Only the dev/demo-gated `/onboarding-local` route from the stack; keep it unavailable in production
- `tools/onboarding-scanner/` source, test and deployment-reference files; these support the already separate scanner service, not website bundling
- Reviewed managed-retention runner, tests and deployment references as a separate operational change
- `docs/onboarding-notice-contract.md`, `docs/basic-onboarding-handoff.md`, this checklist, and relevant evidence entries in `docs/website-work-progress-2026-09-26.md`

Update `.github/workflows/ci.yml` narrowly: explicitly wire the basic gate, retain paid/component gates false, and run selected onboarding checks. Do not copy its stacked `concurrent_team_seat.sh` step without the deliberately excluded team migration. Keep current-main lockfile and dependency updates.

Existing `tests/frontend/e2e/public-release-gates.spec.ts` assumes `/auth` and `/onboarding` are closed. Retain that configuration and add a distinct basic-on/paid-off configuration that expects registration/auth to open while booking/admin-paid surfaces remain closed. Team URLs absent from the focused release can return not-found; do not copy expectations that require excluded team routes.

## Local verification commands and prerequisites

Use Node22 and the committed lockfile. Confirm Docker access first. Use only the isolated stack `/private/tmp/armature-onboarding-local` (API55421); never substitute production if it is unavailable. Run DB, Storage and browser mutations sequentially. Preserve existing synthetic review fixtures and restore gates after each test.

From the focused checkout, after preparing an isolated copy of its selected migrations/functions:

```sh
node --version
docker info
npm ci
npm test
npm run build
npm run check:pages-runtime
npm run audit:production
npm run audit:all
supabase test db --workdir /private/tmp/armature-onboarding-local
node --test tests/scripts/onboarding-retention.node.mjs
node scripts/test-onboarding-local.mjs
node tools/onboarding-scanner/check_edge.mjs
npx playwright test --config playwright.onboarding-local.config.ts
npm run test:e2e
npm run test:e2e:production
```

The Storage script needs `ONBOARDING_LOCAL_URL=http://127.0.0.1:55421`, isolated `ONBOARDING_LOCAL_ANON_KEY`, isolated `ONBOARDING_LOCAL_SERVICE_KEY`, and `ONBOARDING_RETENTION_JOB_SECRET`. The Edge Functions need the same local retention secret and local scanner settings. Obtain credentials without printing them or writing them into Git. The scanner Edge check reads the isolated stack status itself and needs the local scanner Python environment documented in its README.

The connected browser config does not start its own server. Start the selected checkout at port4341 with `VITE_DEMO_MODE=true` and `VITE_ONBOARDING_LOCAL_ANON_KEY`; supply the isolated service key to the test process. The public browser suite uses port4173; avoid a stale reused preview process. `test:e2e` rebuilds in demo mode, so rebuild the intended production flag configuration before `test:e2e:production`. Current public tests do not establish basic-on release readiness until the separate configuration exists.

Run scanner Python tests from `tools/onboarding-scanner` with its documented environment: `python -m unittest -v test_scanner test_maintenance`. Run new managed-retention tests using their committed invocation once implemented. Record actual commands, commit IDs, counts, failures and evidence paths; do not carry previous-stack test results forward as focused-branch proof.

## Hosted cleanup gate

- Use a dedicated `ONBOARDING_RETENTION_JOB_SECRET` with no fallback to the booking secret. Store it in Supabase and a retention-only Secret Manager secret. No production service-role key belongs in the Cloud Run runner.
- Give the runner identity access only to that secret; scheduler identity may invoke only its job. Pin the exact HTTPS endpoint and image digest; reject redirects and invalid/oversized results; bound requests, batches and total duration.
- Run every five minutes. Failed deletions, timeouts, malformed responses and exhausted backlog must fail the execution. Avoid immediate automatic retries masking five-minute database leases.
- An empty claim is not proof of an empty overdue queue: leased failures are temporarily invisible. Verify aggregate outstanding/overdue health independently or document this limit and prove lease-expired recovery.
- Verify failed-execution and missed-success notification delivery to the monitored operator mailbox, then recovery. Use harmless controlled failures and remove temporary test policies.
- With all intake gates false, prove hosted synthetic expiry deletes Storage bytes, records deletion, preserves unexpired files and verification results, and succeeds idempotently on repeat. A200 response alone is insufficient.

## Final basic-registration gates and remaining operator decisions

- Verify the actual-domain email sign-in and callback. Confirm an independent staff reviewer has `admin` or `super_admin`; an applicant must not approve their own application. Do not send a test email to an uninvolved recipient.
- Confirmed: guardians email hello@armatureailabs.com with member name/registered email, guardian name/relationship and explicit permission. Decide who verifies it and how the evidence reference is retained.
- Specify retention/access review for the remaining application, notice-acceptance and review records. The30-day rule applies to uploaded image copies; it does not define a duration for all retained verification history.
- Document provider Storage/database backup behavior, log retention, staff downloaded copies and derivatives. Do not promise deletion from those locations merely because Storage object removal succeeds. The owner confirmed portal-only review with no downloaded or retained copies; apply that staff rule.
- Publish launch-accurate privacy/guardian instructions under the confirmed operator, **Jayasri Nageshwara Rao and Partners LLP**. Preserve historical notice acceptance; coordinate any new notice version across SQL acceptance validation, Edge upload validation, frontend constant and fixtures.
- Confirm the staffed review/correction process and alert-response owner. Confirm dashboard basic status cannot be mistaken for a paid pass.
- Verify desktop/mobile and all site themes, keyboard operation, login/logout, correction/reupload, expired files, rejection, minor consent, concurrent review revision protection and cross-user isolation.
- Run final CI on the focused PR, squash-merge only its reviewed scope, then use the production workflow. Backend deployment first with gates false; retain a gate-off rollback that leaves retention enabled.
- Open basic intake only after the above evidence is complete. Recheck live HTML/routes, production feature flags, authenticated document protection, scanner failure closure and cleanup schedule. Paid memberships, team booking, Gmail booking delivery and payment work remain independently held.
