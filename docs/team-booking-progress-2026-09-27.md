# Team memberships and bookings — implementation progress

Owner approved the next-phase plan on 27 September 2026. Scope is implementation, local synthetic testing and preview; payments, outbound booking messages and public paid-booking activation remain disabled. Preserve the LLP/Razorpay hold, including test mode.

## Baseline and workspace

- Existing draft PR #73: `codex/team-membership-booking-email`.
- Reused clean managed checkout `/Users/dev/.codex/worktrees/basic-registration-release/Armature Lab`; original working folder preserved.
- Merged released main `7dd26083e461da892380725de41c533e26f08848` into draft as `309a3b6`. Retained both current onboarding/account-management routes and gated private team routes, all database CI scripts and historical progress records. No force push.
- First post-merge unit run: 297 tests in 33 files passed under Node 22. Existing results are not acceptance for the new implementation still underway.
- Separate local Supabase project `armature-team-booking-check`, API `127.0.0.1:57321`, database `127.0.0.1:57322`. Existing local previews and live Supabase untouched. Local credentials are not part of this note.

## Implementation division

- Team core: approved-basic eligibility, team administrative authority, team-admin transfer and booking on behalf of named members, actor/member audit and tests.
- Booking policy: explicit dated entitlements, configurable resource policies/prices/closures, workspace/equipment dependencies, event/cabin rules and tests. Fail closed when required configuration/access is absent.
- Interface: team controls, member pass selection and Admin access configuration, with desktop/mobile checks.
- Integration: role-aware routing/navigation, updated existing test fixtures, full database/concurrency/build/browser checks and reviewable draft PR update.

## Launch holds

Do not activate paid production entitlement grants or scheduled workers. Do not create provider accounts, run Razorpay test mode, send messages, access real identity documents or invent final prices/resources/closure dates. Any mock entitlement path must be explicitly local and unavailable in production. Real launch still requires prices/inventory/calendar/refund details, payment-workflow choice, controlled integration tests and release approval.

## Implemented and reviewed

- `392eac3`: server-side approved-basic eligibility, team-admin transfer, on-behalf booking actor attribution, dated paid-access policies and tests. Type contracts preserve existing ordering and add the generated booking contracts and current membership-review role.
- `72d8be7`: discard stale account snapshots immediately after account changes; three deferred-response regression tests.
- `e380e6e`: gated member/team/Admin interfaces, IST booking inputs/displays, resource availability explanations, renewal deduplication and focused UI tests.
- Team admin remains an organization role. Website Admin/Super admin configure team access; membership-review Staff cannot. Direct authenticated booking/reservation writes are revoked in favour of checked RPCs.
- Resource policies, unconfigured prices, exact-paise quotes/discounts, closures, day/week/calendar-month ranges, overnight age/time limits, cabin guest windows, equipment workspace dependency and event buffers/capacity are enforced in Postgres. Paid workspace seat quantity must cover the team's current seat allowance.
- Private member/team/Admin interfaces show IST times and local-only activation. Renewal preferences do not charge or extend access. Pantry copy excludes atta.
- Source review found and fixed inadequate paid-seat quantity, repeated renewal controls, misleading availability/price wording and stale account snapshots.

## Verification evidence

The managed checkout is still the existing draft branch; production was neither merged nor deployed.

All commands used Node 22 and the isolated local database on port 57322. No production database, payment provider or outbound integration was used.

- Final clean setup: copy migrations/seed into `/private/tmp/armature-team-booking-check/supabase/`; `supabase db reset --local --workdir /private/tmp/armature-team-booking-check`. Log `/private/tmp/team-fresh-reset-final.log`.
- Database: pgTAP extension initialized once, then `psql --set ON_ERROR_STOP=1` for each `supabase/tests/database/*.sql`: **21 files, 571 assertions passed**. All seven `supabase/tests/concurrent_*.sh` scripts passed with `DATABASE_URL` set to the local port. Logs `/private/tmp/armature-final-db-check/`. Mock gate verified false afterwards.
- `npm test`: **309 tests / 37 files passed**, `/private/tmp/team-unit-final.log`.
- `npm run build`: passed TypeScript, Vite, model/media integrity, route-shell and SEO checks; **154 public initial-HTML pages**. `/private/tmp/team-build-final.log`.
- `npm run test:e2e`: **147 passed, 15 conditional skips** (local backend-only and mode/device-specific checks), `/private/tmp/team-existing-browser.log`.
- `npx playwright test --config playwright.basic-registration.config.ts`: **6 passed**, `/private/tmp/team-basic-browser.log`.
- Production-style build with basic registration enabled, paid platform disabled and synthetic backend configuration; `npx playwright test tests/frontend/e2e/public-release-gates.spec.ts`: **13 passed, one desktop/mobile-conditional skip**, `/private/tmp/team-gated-browser.log`.
- `npm run check:pages-runtime`: **20 HTTP/SEO probes passed**, `/private/tmp/team-pages-runtime.log`.
- `npx playwright test --config playwright.team-local.config.ts`: **desktop and mobile passed**. Real local journey covers team application/activation, invitation/acceptance, member self-booking, Admin on-behalf attribution, usage and removal/cancellation. `/private/tmp/team-browser-final.log`.
- `npx playwright test --config playwright.access-local.config.ts`: desktop/mobile access journeys passed, covering product/resource policy, closure display, synthetic weekly grant, server quote and one renewal preference. Final fixture cleanup verification recorded below.
- Screenshots reviewed in light/dark/sepia on desktop/mobile. Representative copies are in `/Users/dev/Downloads/Armature Lab/private/team-booking-review-2026-09-27/`; they contain synthetic users, not real members.

Browser skill was unavailable; the existing repository Playwright workflow was used. Test credentials remained in a private local environment file and are not committed. Screenshots contain synthetic accounts only.

### Harness corrections

The clean direct-psql harness needed pgTAP enabled (the normal Supabase runner does this). Browser fixtures were corrected to choose team access explicitly, choose a 09:00–17:00 slot rather than physical 08:00 availability, use rendered accessible combobox names, and wait for the asynchronous renewal response. Production-style basic-registration checks require a configured synthetic backend as well as the feature flag. Synthetic account switching now initializes storage on a static same-origin page before starting the app, avoiding races with the previous browser auth client. AccountContext itself was reviewed and already rejects mismatched/stale summaries. These were investigated causes, not skipped assertions.

### Separate existing limitation found during synthetic teardown

Auth-user hard deletion is blocked by retained application/certification foreign keys and the immutable audit trigger when a referenced actor is deleted. This phase does not change production retention or audit rules. Local tests delete only their own synthetic prerequisites/audit rows within a guarded transaction before calling the auth deletion API. Account-erasure orchestration needs a separately reviewed retention/audit design; do not treat a generic auth-user delete as a supported production deletion workflow.

## Remaining before paid launch

1. Confirm final per-resource prices, tax treatment, inventory/cabin capacities and location holiday calendar. Generic product pricing is preparation; equipment-specific commercial pricing still needs a defined catalogue.
2. Define purchase/order and refund processing. Preserve the agreed full-refund windows measured from 09:00 (day one hour, week one day, month two days); remaining cancellation/event/equipment terms are unresolved. No payment/refund processing or automatic renewal billing is implemented by this phase.
3. Decide the initial payment workflow after the LLP-name-change hold is lifted. Even Razorpay TEST remains on hold. A local mock grant is not proof of payment.
4. Add dedicated event-attendee registration/check-in; current capacity checks and guest names are not the complete guest-registration product.
5. Perform controlled real booking-calendar, sender/reply delivery and reminder-idempotency tests only when separately authorized. `bookings@armatureailabs.com` remains the alias of `hello@armatureailabs.com`.
6. Review this draft, then separately authorize production migration and paid-route activation. Mock grants default off and remain inaccessible to website users unless the service-controlled gate is deliberately enabled; no production setting was changed.

## Final local acceptance and draft handoff

- `1b2d54e`: reproducible local browser journeys, static-page session initialization, development service-worker isolation and explicit synthetic cleanup.
- Final team desktop/mobile journey: **2 passed / 23.1 seconds**, including asserted Auth deletion; `/private/tmp/team-browser-final.log`.
- Final access desktop/mobile journey: **2 passed / 24.4 seconds**, including asserted Auth deletion; `/private/tmp/access-browser-final.log`.
- Final direct database read: `mock_grants=false`, `synthetic_test_accounts=0` for both team/access fixture prefixes.
- Review evidence includes representative desktop/mobile screenshots in the original folder's ignored `private/team-booking-review-2026-09-27/` directory, with hashes in its README.
- Existing draft PR #73 is the handoff target. Remote CI status must be checked on its latest head; local pass results are not a claim that GitHub checks have finished. No merge or deployment is authorized by this preparation.

## Connected chair and cabin inventory — 27 September 2026

Owner accepted the local booking design and authorized inventory, real local availability, member booking and admin availability controls. Reusing the clean managed draft checkout at head `1121994`; original dirty folder and accepted design study remain preserved. No production migration, paid activation, real payment or outbound message is authorized by this phase.

Plan: add protected stable chair/cabin inventory and atomic pass reservations; connect the full-floor chair map; add reasoned Admin resource controls; test local Supabase, concurrency, frontend/build and desktop/mobile synthetic journeys. Local Docker access confirmed (29.6.1). Dev app uses Node 22 and local API 57321 only, served on 4342. Existing local environment file is private and not copied into source.

Stable proposed placement: S01–S25 shared GF10 pool; C01/GF01, C02/FF03, C03/FF04, C04/FF06, six seats each with whole-team monthly booking. Cabin fit and equipment positions remain provisional. Empty production inventory migration and separately applied local synthetic seed preserve release boundaries. Payments and mock grants remain disabled outside explicit isolated tests.

Implementation details and verification notes:
- Inventory migration provisions no live resources. Local fixture supplies 25 chairs and four whole cabins at a distinct synthetic location, with base prices and no product activation. Existing dated entitlements remain required; basic membership alone cannot reserve paid resources.
- Availability includes closures, occupied dates and disabled resources. Reservation creation rechecks membership, entitlement, certification, hours and conflicts on the server. Week/month allocation spans keep closed days reserved; individual cancellation does not free an entire monthly allocation until all its bookings are cancelled.
- Legacy mapped-resource rescheduling is intentionally blocked: cancel and reserve through the coordinated pass flow. This is not automatic refund processing.
- Admin maintenance controls record a reason and retain existing reservations. Staff membership-review permissions do not expand.
- Reuses the existing installed Three.js 0.183.2 as an explicit exact dependency (deduped with model-viewer), rather than adding a second vendored copy. Viewer/model code loads only when availability opens the map. Native model/GLB sources remain unchanged.
- Initial unit failures came from old pass-page fixture contracts; tests were updated to exercise availability/review and stale-account responses. Browser testing found and fixed dynamic public-module loading and confirmation lost during global booking refresh; successful reservations now open My bookings. Selector issues were corrected using observed accessible roles.
- 314 unit tests passed across 38 files. Full build passed TypeScript, assets/model integrity and SEO checks for 154 public initial-HTML pages. Public release-gate browser tests: 13 passed, one device-conditional skip. Separate basic-registration browser checks: six passed, including paid routes remaining closed while basic registration is enabled.
- Logs: /private/tmp/booking-inventory-units.log, /private/tmp/booking-inventory-build.log, /private/tmp/booking-inventory-release-gates.log, /private/tmp/booking-basic-gates.log.

Remaining commercial configuration: the accepted design study displays approved launch prices; this local connected fixture uses standard base prices. Date-bound launch pricing through 31 December 2026, student eligibility/awards, taxes, equipment rates and real holiday dates still need release configuration before paid activation. No perpetual launch discount was introduced. Native cabin fit and full-pass cancellation/refund UX remain separate launch review items.

Database acceptance: all 22 SQL test files passed, 597 assertions total (26 new inventory assertions). All eight concurrent scripts passed, including month-versus-day competition and simultaneous final-day cancellations. Review fixes added allocation-row locking before cancellation release, blocked independent mapped-pass rescheduling, and aligned organization/location lock order with authorization checked after the organization lock. Logs: /private/tmp/booking-inventory-db-logs. Synthetic inventory restored to 29 resources and mock gate false before the browser tests temporarily enabled their own guarded fixtures.

Browser acceptance: the complete inventory journey passed on desktop and mobile (2 tests, 57.1 seconds), covering visible chair targeting, stale-availability rejection, retry on another chair, booking history, Admin disable/closure controls and a complete six-seat monthly team cabin. Light/dark/sepia screenshots and an idle-render check were captured. Browser plugin skill was unavailable; the repository Playwright workflow was used. Logs: /private/tmp/inventory-browser.log; screenshots: /private/tmp/inventory-review-*-{light,dark,sepia}.png and /private/tmp/inventory-cabin-*.png. Fixture roles, dates and accessible selectors were corrected based on observed errors; no failed assertions were skipped. Vite now ignores generated test/build artifacts and pre-optimizes the existing Three dependency, preventing test-induced state resets.

Final handoff:
- Backend commit `d304af3`: stable inventory, allocation safeguards and database/concurrency regression tests.
- Interface commit `ccd9ae0`: floor-map reservations, Admin resource controls, generated contracts, local browser tests and dev-harness stability.
- Final full unit run: 314 passed (/private/tmp/booking-inventory-units-final.log). Final build passed (/private/tmp/booking-inventory-build-final.log); existing large-chunk and SEO static/dynamic import warnings remain, with no build failure.
- Desktop/mobile inventory journey: 2 passed, 57.1s. Additional desktop evidence capture: 1 passed, 24.6s (/private/tmp/inventory-browser-evidence.log). Readable selected-chair evidence: /private/tmp/inventory-map-chromium.png.
- Final test cleanup verified: mock grants false, tested products disabled, temporary inventory test users zero. 29 synthetic inventory resources remain for repeatable local testing, not production.
- No merge, deployment, payment setup or real booking/email operations. Existing draft PR #73 remains the review target. The authoritative new local app is http://127.0.0.1:4342/passes and requires a synthetic local account; production credentials should not be used there. The accepted standalone design study remains available at4343.
