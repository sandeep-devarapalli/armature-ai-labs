# Courses pilot hosting readiness

**Current status — 4 October 2026: the three-course pilot is LIVE at https://courses.armatureailabs.com/ on the existing Armature Supabase project. Free verified-member access and six samples are published. Assessment/lab policies remain deferred. See the production release entry below; earlier preparation-only statuses are historical.**

Updated 4 October 2026. Target: `courses.armatureailabs.com`, using the existing Armature Supabase project `uxfhdfagrmaeyuaipaar` (`armature-lab`).

## Owner decisions

- Instructor review is complete; the owner confirmed permission to reuse the course material.
- Prepare pilot hosting with existing membership verification, free access for verified members and six registered-member samples: each course introduction and first teaching lesson.
- Conduct the real learner trial after the courses are live. Participant feedback is therefore not a prelaunch gate.
- Keep assessment and course/module lab policies unassigned and configurable. Do not enable final grading, certificates, payments or infer that deferred requirements mean no requirements.
- This document prepares and verifies the release. It does not record a completed public deployment.

## Live database inspection

Read-only SQL against the target project confirmed:

| Check | Result |
| --- | --- |
| Course tables/private content/audit tables | Absent |
| `get_my_course_catalog()` | Absent |
| Course migrations `202610040001`–`202610040004` | Absent |
| Existing memberships and onboarding tables | Present |
| `private.has_approved_basic_membership(uuid)` | Present; matches repository definition |
| `private.is_staff(public.staff_role[])` | Present; matches repository definition |
| `extensions.gen_random_uuid()` | Present |
| Membership migrations `202609260007`, `202609270012` | Recorded as applied |

The live membership helper requires approved basic onboarding and confirmed email, rejects deleted/banned accounts and suspended memberships, and does not require paid coworking membership. The role helper preserves the separate membership-review Staff role; course administration explicitly requires Admin/Super admin.

Inspection used the authenticated Supabase CLI with existing matching-project connection metadata copied into `/private/tmp/armature-courses-live-preflight-20261004/`. The worktree was not linked or altered. SQL was enclosed in `BEGIN READ ONLY`/`COMMIT`; no course/application records or schema were changed. The CLI reported its normal login-role initialization before querying. Queries returned only schema/function/migration metadata, not credentials or member records. Production Auth redirect settings, email delivery and the deployed browser flow are separate checks, not established by this schema inspection.

## Frozen release input and local evidence

- Authoritative private package: `output/courses-full-review-2026-10-04/package-v6/` in the Downloads checkout; exact worktree mirror: `output/courses-corrected-v6/`.
- Three courses, 55 modules, 377 lessons, 6,064 blocks, 1,601 formative questions and 327 inline diagrams. Preserve its `SHA256SUMS` and correction/source provenance.
- Existing `v6-local-import.json` and `v6-local-verification.json` confirm exact equality for all 377 stored lesson bodies and six private assessment copies in isolated `courses_member_http_check_20261004`; earlier versions remain intact.
- Local v6 IDs are deterministic: Computation `647d898d-c476-5d11-808f-4e2aa67ada6c`, Mathematics `5401a1d6-d7c5-5b70-bcc9-5ed520157dbd`, Embedded `9fa09bfa-0d9d-5621-aeb1-f1ede3ec0290`. Each was draft/revision 4/free/two samples at the saved verification. Re-read current state before any mutation; do not assume saved revisions are current.
- The production import creates the authored v6 identities directly. It does not need historical v1–v5 imports or synthetic local fixture courses.
- Private package files, generated SQL, answer banks, credentials and local test harnesses must not appear in the deployable static artifact. Only the authenticated member build belongs there.

## Ordered release procedure

1. **Capture the release state.** Record deployed frontend artifact, selected source revision, package/migration/build hashes, current target project and migration ledger. Confirm current managed backup/restore availability before database changes. Keep a protected copy of these records; do not put secrets in the runbook or command line.
2. **Validate a selective migration plan.** Use the established migration executor and a release staging directory containing matching already-applied migration history plus only the four reviewed pending course migrations. Run `supabase db push --dry-run --linked --workdir <release-directory>` and require its pending list to be exactly the four below. If it contains unrelated pending migrations or drift, stop and reconcile the release staging set. Never bulk-push the active checkout, use `--include-all` to suppress a mismatch, reset production, or rewrite previously applied migrations.
3. **Apply in order:** `202610040001_courses_foundation.sql`, `202610040002_courses_member_api.sql`, `202610040003_courses_admin.sql`, `202610040004_courses_deferred_policy.sql`. Retain successful migration ledger entries and execution output. Migration 004 is required: it permits reviewed learning publication with deferred policies. If execution fails, inspect which migrations committed and resume only the unapplied reviewed files; do not rerun DDL blindly.
4. **Generate and inspect the private draft import with Node 22:** `node scripts/courses/generate-import.mjs output/courses-corrected-v6 <private-import.sql> 6`. Its input checksum/provenance assertions must pass. Reject any existing course slug/version-6 conflict before execution. Apply its enclosed transaction using the protected database owner/import connection. The importer starts draft/revision 1/access unassigned/no samples; package pilot metadata is deliberately not a privilege grant. Import retries are permitted only while untouched draft/revision 1; managed/reviewed/published versions must not be reimported.
5. **Verify stored content before review.** Reconcile 3 versions, 55 ordered modules, 377 lessons/private bodies, three private material records and the resolved package content. Validate every body with `private.course_validate_blocks`; compare the private question-bank/legacy copies; ensure no final material entered learner blocks. Confirm RLS and grants, including absent browser access to private tables. Never dump protected bodies into public logs.
6. **Configure pilot access through authenticated Admin RPCs.** Read `admin_get_course_version` before each mutation and use its current revision. Call `admin_update_course_version` with unchanged title/description, `p_access_tier: 'free'`, `p_final_assessment_route: 'unassigned'`, `p_lab_policy_status: 'unassigned'` and an owner-decision audit note. For exactly the first module introduction and Lesson 1.1 in each course, fetch unchanged blocks through `admin_get_course_lesson`, then call `admin_update_course_lesson` with `p_is_sample: true`. Check exactly two samples per course and zero configured lab requirements. Do not edit bodies during sample selection.
7. **Record content approval.** Call `admin_review_course_version(p_version_id, p_expected_revision, p_note)` using the latest version revision, recording the owner's instructor/reuse confirmation and v6 evidence. Any subsequent edit clears review; resolve it and review again. A stale revision is HTTP 409 and requires reload/reconciliation, never an automatic mutation retry.
8. **Finish the hosting checks before opening access.** Deploy only the member-mode static artifact, configure exact HTTPS courses-origin Auth callbacks, retain the existing primary website and verification flow, and validate DNS/TLS, headers, redirects/direct URL reloads and failure pages. Browser sessions are origin-specific; sharing Supabase does not automatically transfer a main-site session. Use existing-account sign-in and the existing registration/verification link, with no duplicate identity-document collection.
9. **Publish as the release action.** After release authorization and the above checks, call `admin_publish_course_version` with each reviewed current revision and a release audit note. Refresh details; assert `published`, `free`, two samples and both policies still `unassigned`. Publication does not issue certificates or sign off labs. An ambiguous response requires reading current status/audit before any retry.
10. **Verify the deployed result.** Check registered-unverified access to all six samples, denial of protected lessons/enrollment/progress mutation, and verified enrollment plus persisted reading/resume across sessions. Check anonymous/private-answer denial, cross-member progress isolation, Staff denial for administration, Admin access, current membership rechecks, sign-out and callback failure behavior. Use an explicitly authorized synthetic production test account or a supplied test member; never change a real member's approval to manufacture a result. Do not run local fixture-reset scripts against production.

`prepare-local-pilot.mjs`, `check-local-pilot.mjs`, `local-backend.mjs`, `check-member-api.mjs` and local private configuration target isolated synthetic rehearsal. They are not production migration/publication scripts. In particular, the existing pilot preparer is tied to v5 and must not be redirected to the remote project for v6.

## Recovery and operational handoff

- For a frontend-only failure, restore the previous checked frontend artifact independently of the database. Do not drop course tables or destroy enrollment/progress history to roll back static hosting.
- For a content/access incident, an Admin may use `admin_withdraw_course_version` with current revision and a reason. It hides learner content while retaining enrollment, progress and audit history. Record the impact before using it: first launch has no earlier production course version to fall back to.
- **Withdrawal is not an API-level reversible toggle.** `admin_publish_course_version` accepts drafts only. A withdrawn version must be cloned, reviewed and published as a new version; cloning generates new module/lesson IDs and does not transfer enrollments/progress. Do not promise seamless learner recovery or silently move history. Plan and verify any later version transition separately.
- Keep additive schema in place after withdrawal. Database restore is an incident procedure with explicit impact review, not the normal application rollback.
- Monitor authentication/callback errors, failed enrollment/progress writes and missing content after release. Avoid logging lesson answers, identity documents or session tokens. Learner feedback follows the live release as the owner requested.
- Target-board/toolchain validation and full Beta/BSim execution remain bounded content limitations; the learning-only pilot must not advertise hardware or certificate outcomes that have not been validated.


## Hosting preparation result — 4 October 2026

**Preparation complete; public activation pending.** Cloudflare Pages project armature-courses was created and read back successfully, with production branch main. It has no deployment yet. Target custom domain remains courses.armatureailabs.com; existing website/AI School projects were preserved. DNS lookup returned no record for the courses host.

The frozen release is output/courses-hosting-2026-10-04/site/ in the Downloads checkout. Its 73 files, exact source hashes and build evidence are in the adjacent release manifest; deploy **only site/**, never the enclosing evidence/content directory. The source checkout has uncommitted course work, so its older Git HEAD alone does not identify this release.

Build with npm run build:courses:production under Node 22 and the existing Armature public browser configuration. The guard pins the correct backend/origin, rejects local/test/privileged configuration and checks an output allowlist. No copied lesson bodies/private banks, preview API or test-password UI are bundled. The SDK retains its unused localhost:9999 default and key-prefix recognition code; the checker distinguishes these from configured backend URLs and actual secrets.

Hosting emits no-store/noindex, backend-restricted CSP, frame denial and a real404 page. Course/lesson links use validated root query parameters; reload and Back/Forward need no wildcard rewrite. Unknown/private/preview paths return404. The sole required course Auth redirect is exact root https://courses.armatureailabs.com/; requested lessons are restored from validated same-browser session storage. Repository configuration includes this callback; **the live allowlist remains unconfigured/unverified**.

| Verification | Result |
| --- | --- |
| Course TypeScript, production build, artifact checks | Passed;73 static files |
| Production configuration cases | 9 passed |
| Frontend regression | 56 files / 573 tests passed |
| Corrected v6 local Auth/API pilot | 55 passed: free access, six samples, protected enrollment, persisted progress and isolation |
| Authenticated browser, localhost:4191 | Pending sample/reload; protected-next denial; verified protected lesson/reload/Back/Forward; no page errors |
| Local Cloudflare runtime,127.0.0.1:4195 | Root/query200; private and unknown paths404; security/no-store/noindex headers |
| Production-configured sign-in UI | Desktop1440×1000 and mobile390×844; correct title/content, no error overlay/console errors, themes work, test password absent |
| Registration handoff | Live /join/ loads and client navigation opens free registration; no account submitted or email sent |

Browser plugin was unavailable; existing Playwright was used. CLI could not import private fixture files, so authenticated verification used the installed Playwright runtime without exposing credentials. An occupied4194 port was preserved; Cloudflare checks succeeded on4195. Existing dependency/bundle-size advisories remain.

Evidence: output/courses-hosting-2026-10-04/ in the Downloads checkout contains runtime/API/browser logs, screenshots and release hashes. Earlier v6 draft reports remain historical: v6 has since been reviewed/published **only in the isolated local rehearsal**; v1–v5 metadata is unchanged.

### Public activation

After publication authorization, apply the selective database sequence above, configure the exact Auth callback without replacing existing callbacks/site URL, attach the custom domain to armature-courses, and deploy the frozen site folder with Wrangler Pages using project armature-courses and branch main. Check DNS/TLS and deployed artifact bytes before opening access, publish the reviewed versions, then verify actual-origin sign-in/access with authorized test accounts.

Main-site direct HTTP /onboarding returns404 although navigation through /join/ reaches registration. Courses now link to /join/; the direct-route defect remains for the main-site repair. Production email/callback, actual-origin membership checks and managed backup readiness still need release-time verification. No real email was sent during preparation.

Instructor review and reuse permission are owner-confirmed. The learner trial follows launch. Assessment/lab policies, payments and certificates remain deferred.

References: [Cloudflare headers](https://developers.cloudflare.com/pages/configuration/headers/), [Pages routing](https://developers.cloudflare.com/pages/configuration/serving-pages/), [Supabase redirect allowlisting](https://supabase.com/docs/guides/auth/redirect-urls).


## Production course release — 4 October 2026

Owner explicitly authorized going live. **https://courses.armatureailabs.com/ is deployed over HTTPS**, using the existing armature-lab Supabase project uxfhdfagrmaeyuaipaar.

- Applied only the four reviewed course migrations; imported corrected v6 atomically.
- Published all three courses: 55 modules, 377 lessons; free for verified members, with six registered-member samples.
- Every stored lesson body and private assessment record matches the approved package exactly. Existing membership, staff and onboarding data hashes are unchanged.
- Final assessment and course/module lab policies remain unassigned. Payments, final grading and certificates are not activated.
- Production database checks cover samples, protected access, verified enrollment/progress, cross-member isolation, Staff denial and membership revocation. All synthetic test records were rolled back and their absence verified.
- Live desktop/mobile checks pass with no console errors; root/query routes serve correctly, private and unknown paths return 404, and theme controls work. Exact root Auth callback added while retaining all seven existing callbacks and the primary site URL.
- Live release is static artifact site-r2, deployment 56552583.armature-courses.pages.dev. Its sole change from the frozen site is a no-transform cache directive preventing Cloudflare from injecting an analytics script blocked by the strict course CSP.
- Recovery: redeploy a checked frontend artifact independently; use audited course withdrawal for a content/access incident, preserving learner history. Withdrawal is not a direct republish toggle.

Evidence: output/courses-hosting-2026-10-04/live-release-manifest.json, live browser/API records, and production-database/.

**Next:** the owner-requested real learner trial after launch, including actual email delivery/sign-in and comprehension/pacing feedback. No real email was sent and no end-user authenticated browser session was exercised during release verification. Target-board/toolchain and assessment/lab policy decisions remain deferred.


### Course sign-in recovery published — 4 October 2026

- Owner reported a received email link returning to the email form. Read-only production evidence confirms a valid account and issued PKCE authorization code, with no completed new session. It does not prove which browser/profile the owner used.
- Reproduced the missing-verifier case in a second local browser profile. SDK does not attempt exchange there. The frontend now awaits initialization errors, explains failed callbacks, and gives same-profile/newest-link instructions before submission. Existing sessions remain valid when old links fail.
- Real local Auth/Mailpit browser checks: same-profile sign-in succeeds; different-profile callback shows recovery; a fresh request from that profile then succeeds. No external mail sent.
- All 582 tests across 57 files and course production build pass. Published site-r3, deployment 132c94a2.armature-courses.pages.dev. Live desktop/mobile checks pass with no console errors or overflow; all 72 served files match the release.
- Shared Supabase, membership rules, templates, course data, payments and certificate policies unchanged. User must retry with a new link in the requesting browser/profile; their real live completion is still unverified.
