# Basic, Verified and Premium — implementation handoff

## State and boundaries

Prepared 10 October 2026. Production membership rules, MSG91 configuration, recipients, payments, workers and the LLP/Razorpay hold have not been changed. Both the database tier gate and the frontend flag default off. Phone delivery has a separate default-off Edge secret. Real WhatsApp/SMS verification is still required before tier activation.

Base: `db3c2e6736d6cdcd50d16323e7295724e77a2a39` from origin/main. Isolated website worktree: `/Users/dev/.codex/worktrees/mhs-blog-cover/Armature Lab`. The original Downloads checkout was preserved.

Focused commits: `29ab09e` (membership rules/access/templates), `a0c3587` (phone delivery and real local Auth harness); the following UI commit contains this note. Review the stacked branches in that order and squash each after review. Do not merge or activate tiers as a substitute for the real-channel acceptance gate.

## Implemented behavior

- Confirmed email gives Basic access, including published free-course learning. Revoked/suspended/banned/deleted accounts cannot use Basic as an access bypass.
- Verified requires preserved identity approval, authoritative confirmed Auth phone, trusted account-bound proof and matching canonical application phone. Old ID approvals are never erased or fabricated as phone proof.
- Premium is derived from real captured workspace terms, not mock entitlements or renewal preferences. Day periods are bounded; week/month terms remain continuous. All active verified team members qualify without granting extra seats. Overlap, expiry, revocation and team removal are handled.
- `private.membership_paid_terms` is trusted future payment evidence only. No payment integration writes it in production, and it does not itself grant booking access.
- Own account summaries include separate membership level, identity state, role, email/mobile/identity checklist and next level boundary. Admin filters, main-site menus, onboarding and courses use these fields.
- Equipment/wishlist/avatar eligibility uses the central server predicate; own documents and authorized identity review remain independent of mobile completion. Existing administrator assignments are unchanged.
- The gated privacy notice explains MSG91 delivery, Supabase verification and excluded analytics.
- Supabase owns OTPs; the signed hook routes an explicit protected request to MSG91 WhatsApp or SMS. Accounts are not replaced, phone sign-in UI is not added, OTPs are not logged or persisted in application tables, and no private fields are sent to analytics.
- Notification template v3 distinguishes identity approval from membership level. Earlier v1/v2 retry payloads remain unchanged.

## Verification

Node 22.22.2; isolated Supabase project `armature-membership-levels-check`, API 59421/database 59422, GoTrue 2.195.0. No live database was used.

| Check | Result |
|---|---|
| `npm test` | 597 tests / 55 files pass |
| `npm run build` | TypeScript, bundle, route shells, assets and 165-page SEO checks pass |
| Database pgTAP, including four existing course suites | 1,233 assertions / 39 files pass |
| All `supabase/tests/concurrent_*.sh` | 14 scripts pass |
| Main browser suite | 159 pass, 17 existing conditional skips; two 3D booking checks failed under parallel load and both pass in isolated one-worker run |
| Existing basic-registration browser suite, tier flag off | 26 pass; six new tier checks intentionally skipped |
| New membership browser suite, tier flag on | Six desktop/mobile checks pass, including server-held compatibility |
| Course member/session/admin unit suites | 34 pass |
| Course TypeScript + member build with explicit local config | Pass; existing large-chunk warning remains |
| Real course browser, no network interception | Desktop/mobile Basic enrollment, full lesson access and progress retained after reload pass; no runtime errors/overflow |
| Real Supabase OTP lifecycle + simulated MSG91 transport | WhatsApp then SMS replacement, same account, pending state, OTP/hook replay checks pass; two mock sends, zero external messages |
| Deno check of phone handlers and local test harness | Pass |
| Production environment regression checks | Pass |
| `git diff --check` | Pass |

Run DB tests with `PGOPTIONS=--search_path=public,extensions PGPASSWORD=postgres psql -h 127.0.0.1 -p 59422 -U postgres -d postgres -v ON_ERROR_STOP=1 -f <test.sql>`. Install pgTAP and run the repository `supabase/seed.sql` first. All fixtures roll back or remove their synthetic records.

For browser checks: `VITE_MEMBERSHIP_LEVELS_ENABLED=true npx playwright test -c playwright.basic-registration.config.ts tests/basic-registration/membership-levels.spec.ts --workers=2`. Legacy registration checks omit that flag. For the 3D checks use `VITE_DEMO_MODE=true npx playwright test tests/frontend/e2e/booking-beta.spec.ts --workers=1` after a demo build.

Reproduce real Auth OTP checks with `DENO_BIN=<deno> python3 scripts/run-member-phone-local.py`; this script only changes the specifically named local Auth container and restores it in finally. Read `phone-verification.md` before using it. Provider requests are mocked and all other external destinations are denied.

### Failures investigated

The first DB regression run omitted the standard resource seed, causing missing-resource/FK failures; applying the existing local seed resolved all of them. New test fixtures needed the same mock-payment fixture switch used by older tests and owner execution for private-helper assertions. Old notification/wishlist test mocks were updated for explicit v3 and the canonical RPC. A test-only missing TypeScript import was fixed. Two 3D booking tests suffered browser session/load failures with the full parallel suite; their isolated unchanged-code run passed. Course harness fixes used the real expandable curriculum and respected a lesson already marked read on desktop; its cleanup now follows foreign-key order. None of these corrections changes paid production settings.

## Course source preservation

The deployed courses source is an existing, extensively modified separate worktree at `/Users/dev/.codex/worktrees/courses-workbench/Armature Lab`, not tracked on current main. Only `course-app/MemberApp.tsx`, `member-api.ts`, `CourseSession.tsx`, `CourseAdmin.tsx` and `tests/frontend/courses-member.test.tsx` were edited there. The optional course migration was copied there too.

`courses.patch` records the exact delta from the pre-task files; `course-delta-sha256.json` records before/after hashes. Original pre-task copies are retained at `/Users/dev/Downloads/Armature Lab/output/membership-levels-2026-10-10/course-before`. Do not replace that worktree or import unrelated course drafts into this change. Review/apply this delta to the course release source before its coordinated deployment. The optional SQL migration only changes access when the course module exists; on a fresh installation install the four course migrations before reapplying `202610100003_courses_membership_levels.sql`.

## Evidence and next release steps

Sanitized summary JSON and the exact course delta are alongside this note. Full local logs and desktop/mobile screenshots are under `/Users/dev/Downloads/Armature Lab/output/membership-levels-2026-10-10/`. `course-browser-check.mjs` is the synthetic real-backend browser harness; it requires the new isolated stack and the courses dev server on localhost:4196 with explicit local public configuration.

Remaining: provision Armature-owned WhatsApp sender/authentication template and MSG91/India SMS readiness; validate real provider responses and handset receipt with the owner-designated test account; then deploy compatible SQL, phone endpoints, coordinated main/course frontends and immutable template support before enabling the server/UI tier gates. Keep the server gate off until both frontends and both real channels pass. Current approvals, staff roles and paid-access holds must be rechecked live after that future rollout. No purchases or provider billing setup were performed here.
