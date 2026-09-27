# Member management release — 27 September 2026

## Approved scope

Implement global basic account status, limited membership reviewers, admin member dashboard, audited role management, owner initial approval exception and separately consented retained avatars. Only Super admins manage Admins. Admins manage Staff only. Sandeep personal identity is the approved Super admin; hello remains Admin. Paid access and Razorpay hold remain unchanged.

## Progress

- Based on main cfd1039 (PR82); reused clean managed basic-registration-release checkout on codex/member-role-management. Original Downloads checkout preserved.
- Read AGENTS.md and DESIGN.md. Applied Supabase security and frontend testing guidance.
- Backend, avatar pipeline and review interface under implementation in isolated file ownership by agents; global AccountProvider and header integration under parent review.
- Docker Desktop started for synthetic local tests. No production database writes or real ID reads performed in this phase.

## Verification gates

Required: local SQL permission/transition/concurrency tests; frontend/unit/build; desktop/mobile rendered interaction evidence; private function deployment and verified bootstrap; CI; production website deployment; live behaviour. Record commands/results below as completed. Do not interpret this checklist as a success claim.

## Local evidence

- `npm test`:164 tests passed before the final retention-contract regression additions.
- `npm run build`: passed;154 prerendered public pages and artifact checks intact.
- `npm run check:pages-runtime`:20 HTTP probes passed.
- `npm run test:e2e`:145 passed,11 expected skips.
- `npx playwright test --config playwright.basic-registration.config.ts`:6 desktop/mobile cases passed. Synthetic reserved.invalid HTTP fixtures; no real applicant data. Header overlap and mobile table overflow were found visually, fixed and covered by bounds assertions. Three themes exercised.
- SQL:307 assertions across14 suites passed on isolated local Supabase (56322), plus concurrent stale-role and actor-demotion rejection tests. Live database never used for synthetic tests.
- Existing local retention monitor tests:7 passed. Managed Python runner tests also passed.
- Read-only production identity check confirmed the existing verified personal and general accounts. Bootstrap pins the exact personal UUID plus email, email confirmation and prior Admin assignment; no private profile fields/images read.

## Release staging

- PR83 database stage commit c3f3279: role scopes, audit, membership transitions, owner exception and tests.
- PR84 avatar stage initially553f49a: private endpoint, separate consent/retention, cleanup and tests. Release review found the managed monitor expects exactly examined/deleted/failed; correction keeps a shared100-item batch and those exact keys.
- Final UI stage contains global account controls, dashboard/review UI, privacy copy and browser tests. Production migrations/functions remain pending until all stages pass CI.

## Owner interaction after release

Sign in with personal sandeep identity for Super admin controls and the one-time owner confirmation. The implementation does not automatically approve the personal application or copy its photo: review/confirmation and avatar consent remain explicit actions in the portal. hello retains Admin permissions and cannot appoint Admins. Paid access remains closed.
