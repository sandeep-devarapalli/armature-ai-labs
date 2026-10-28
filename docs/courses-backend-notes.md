# Course database foundation

Updated 4 October 2026. Local implementation and isolated database validation only. The local foundation, authenticated learner API and audited administration are implemented; this is not a deployed or pilot-ready learning service. See [the approved plan](courses-platform-plan.md).

## Implemented

- Migration `202610040001_courses_foundation.sql` adds dedicated course/version metadata, ordered modules/lessons, enrollment, reading progress and course entitlements. Stable identifiers and version/source digests support the separate deterministic draft importer.
- Lesson bodies and final assessment material live in separate private tables with no browser table privileges. Published catalog/syllabus metadata is available to authenticated accounts. Only explicit samples bypass verified full-learning access.
- Existing `private.has_approved_basic_membership` remains the identity authority. It checks approved onboarding, email confirmation, deleted/banned accounts and suspended memberships. It does not require a paid coworking membership.
- `enroll_in_course(version_id)` and `save_course_lesson_progress(lesson_id, last_block, read)` derive the learner from the session. Clients cannot write enrollment, progress, publication, sample flags or entitlements directly. Enrollment retries reuse the existing record.
- `get_course_lesson(lesson_id)` checks publication, current membership, a valid entitlement for paid courses, and enrollment each time. Registered users may read designated published samples. Admin/Super admin use the separate `admin_get_course_lesson` endpoint to preview any version; the learner endpoint rejects drafts and roles do not bypass membership or paid-course requirements for published learning. Membership-review Staff cannot preview drafts.
- Course versions separately track `final_assessment_route` and `lab_policy_status`, both initially `unassigned`. Course/module lab requirements are distinct rows; a null module means a course-level requirement. No lab, assessment route, sample or paid access is inferred or seeded.
- Reading progress records only reading, with no completion/certificate shortcut. No certificate issue operation exists.

## Import contract

The privileged local importer supplies deterministic UUIDs for courses, versions, modules and lessons. `private.course_lesson_content.blocks` is an array of reviewed learner-facing blocks. `private.course_assessment_material.material` is a separate object. The database does not try to infer which arbitrary JSON fields contain final answers; separation must be validated by the importer before publication. Never place the raw transfer JSON or generated import SQL in public/static assets.

Import is draft-only; service-role privileges are for a protected server/import process and must never be exposed in the browser. Migration 003 adds audited, version-preserving administration RPCs. There is still no browser entitlement-grant RPC. Course policy changes must not rewrite earlier enrolled/assessed versions.

## Verified locally

- New isolated database: `courses_foundation_check_20261004`, inside local Docker container `supabase_db_armature-equipment-wishlist-check`. The existing `postgres` application database was not modified.
- Baseline: clean Supabase auth/storage schemas, with application-owned auth trigger and storage policies rebuilt from repository migrations. Replayed all 43 applicable migrations, including this foundation. Excluded only `202610020005_ecosystem_maintenance_wakeup.sql`: its unrelated pg_cron scheduler is configured for the container's `postgres` database, not the isolated test database. Scheduler behavior is not covered by this run.
- `supabase/tests/database/030_courses_foundation.sql`: **45 passing pgTAP assertions**, both before and after importing the selected courses. Covers registered samples, full-content denial, verified enrollment, retry idempotence, draft isolation, no admin learner bypass, Staff restrictions, protected answers, direct-write denial, cross-user history, entitlement expiry/revocation, banned/suspended/revoked membership, retained own history and no certificate operation.
- Existing `supabase/tests/database/029_submission_review_scope.sql`: **19 passing assertions** after the new migration and import.
- Original version-1 three-course import applied twice: **3 courses, 3 versions, 55 modules, 377 lessons, 377 private lesson bodies, 3 private assessment records**. Version 1 remains retained in this isolated database as local test history.
- Current corrected derivative **R02 / content version 2** applied twice: **3 version-2 courses, 55 modules and 377 lessons**, without duplicate rows. Both versions remain draft with access tier, final route and lab policy unassigned; zero lessons designated as samples. There are 3 stable course identities and 6 version records total. R02 escapes the less-than character in computation block `m11-5-t3` so the loop comparison survives HTML rendering; the original transfer files are unchanged.
- Re-ran all **45 course assertions** after R02. Attempting to import the changed derivative as version 1 fails with `Changed course source requires a new version: computation-structures`. The enclosing transaction rolls back; the version-metadata fingerprint and 754 combined lesson rows remain unchanged.
- Local logs: `/tmp/armature-courses-backend/test-imported.log`, `membership-regression.log`, `import-first.log`, `import-second.log`, `import-r02-first.log`, `import-r02-second.log`, `test-r02.log`, `changed-v1-result.log`. These are local validation artifacts, not production evidence.

The new suite can be run in a normally initialized isolated Supabase project with `supabase test db supabase/tests/database/030_courses_foundation.sql`. Do not run `db reset`, the draft import, or migrations against production as part of preview work.

## Still required

- Authenticated frontend, enrollment, saved progress and local callback/session checks now pass (see progress log). Production courses-origin configuration and verification remain required before release.
- Audited draft editing, review, publication, withdrawal and clone operations now pass local database/HTTP tests (below). Production configuration, owner policy decisions and content approval remain release gates.
- Build course/module lab sessions, attendance, authorized completion and reassessment history, plus any explicitly approved reading prerequisites. The present requirement rows do not implement or certify lab completion. Do not publish configured progression gates until enforcement exists.
- Implement server-graded final attempts/results and protected certificate issue/revocation once the owner supplies assessment choices and criteria. Final answers remain private; no grading endpoint is enabled.
- Private inline SVG delivery and sanitization now pass diagram and member bundle/HTTP checks. Any future non-inline media needs its own protected delivery path.
- Review/approve content, samples, access tier, lab requirements and assessment policy before publishing any course. Payment activation and public deployment retain their existing separate authorization gates.

## Authenticated learner API increment — 4 October 2026

Migration `202610040002_courses_member_api.sql` supplies the frontend's authenticated read contract. Every RPC rejects a missing session subject and derives the member identity from `auth.uid()`; callers cannot supply another member ID.

- `get_course_membership()` → `{ verified: boolean }`, using the existing free identity approval authority.
- `get_my_course_catalog()` → array of `{ id: slug, versionId, title, description, moduleCount, lessonCount, accessTier, finalAssessmentRoute, labPolicyStatus, canLearn, enrolled, readCount, resumeLessonId, lastBlock }`. It returns each course's latest published version plus any older published version in the caller's enrollments. Drafts and withdrawn versions are omitted even for admins; newer drafts do not hide the currently published version. Use `versionId` as the UI key. `canLearn` reflects current identity and any required paid entitlement, independently of enrollment. No saved position means `resumeLessonId: null, lastBlock: 0`.
- `get_course_syllabus(p_version_id)` → `{ modules: [{ id, title, subItems: [title], lessons: [{ id, title, isSample }], lessonContent: {} }], labRequirements: [{ id, moduleId, title, brief, completionCriteria, mandatory, location }] }`. Module and lesson positions preserve source order. Only published metadata is returned; there are no lesson bodies or assessment answers. A null `moduleId` identifies a course-level learning lab.
- `get_my_course_progress(p_version_id)` → `[{ lessonId, lastBlock, readAt, updatedAt }]`, solely the caller's history. History remains readable after membership or entitlement revocation, but existing lesson/save RPCs continue to check current learning authorization. `lastBlock` is a zero-based original source-block position, not a rendered DOM element index. Reading timestamps do not constitute final grading or lab completion.

The existing `get_course_lesson` response remains the raw blocks array. Its sample path now checks confirmed email, nondeleted/nonbanned account and nonsuspended membership before exposing any body, including a sample or admin draft preview. Pending identity verification still permits designated samples; sample access cannot bypass an account restriction.

Validation in `courses_foundation_check_20261004` only: **40 member-API assertions, 45 existing course-foundation assertions and 19 existing membership-scope assertions pass**. Coverage includes missing/anonymous sessions, latest-versus-enrolled versions, ordered metadata without bodies, admin draft isolation, retained own history, cross-user separation, paid entitlement gating and banned/deleted/unconfirmed/suspended sample denial. The initial local application used the nonowner `postgres` role and failed on existing function ownership; the partial four new functions were removed and the entire migration reapplied atomically as the existing `supabase_admin` object owner. Test transactions roll back. The six imported version records remain **draft / access unassigned**, with **zero sample lessons**. Logs: `/tmp/armature-courses-member-api/{migration,member-api,foundation,membership}.log`.

These checks do not establish production-origin authentication or authorize any deployment. Separate HTTP/session and frontend verification is recorded in the implementation progress notes.

## Private diagram-resolved import — revision 3

Applied the new `output/courses-private-import.sql` twice in each isolated database: `courses_foundation_check_20261004` and `courses_member_http_check_20261004`. The import inserts only deterministic authored-course revision-3 rows with conflict-safe retries; it does not update the HTTP harness's published synthetic courses or active learner rows. The unrelated version-metadata fingerprint was identical before and after each database import.

Both databases now retain **nine authored version records** (three courses × revisions 1, 2 and 3). Revision 3 contains **3 courses, 55 modules, 377 lessons/private bodies, 6,061 blocks and 3 private assessment records**. All **326 illustration blocks** have SVG content (the 137 formerly component-resolved diagrams plus 189 existing inline SVG diagrams). No unresolved named diagram remains in the revision-3 learner bodies. All authored revisions remain **draft**, with access tier, final assessment route and lab policy **unassigned**; revision 3 has **zero sample lessons**.

Deep inspection found no final-exam/question-bank containers in learner bodies and none of the **160 private final question objects** duplicated there. Formative lesson quiz answers remain part of protected practice content, as intended. Private assessment separation does not itself implement final grading.

After importing revision 3, the foundation database again passed **45 course-foundation + 40 member-API + 19 membership-scope assertions**. Logs and compact validation reports are in `/tmp/armature-courses-member-api/`, including `*-import-v3-first.log`, `*-import-v3-second.log`, `*-validation-v3.json`, and the three `*-v3.log` test logs. No reset, publication, payment change or production database operation occurred.


## Audited administration increment — 4 October 2026

`202610040003_courses_admin.sql` adds a dedicated Admin/Super admin workflow. Membership-review Staff and ordinary learners cannot use it. Every operation checks the current database role assignment, confirmed email, nondeleted/nonbanned account and nonsuspended membership. Administrative preview does not grant learner enrollment, paid entitlements, lab completion or a certificate.

### Frontend RPC contract

- `get_course_admin_access()` returns `{ allowed }`.
- `admin_list_course_versions()` returns course rows: `{ versionId, courseId, slug, version, title, description, status, accessTier, finalAssessmentRoute, labPolicyStatus, clonedFromVersionId, revision, reviewedRevision, reviewedAt, moduleCount, lessonCount }`.
- `admin_get_course_version(p_version_id)` returns `{ course, modules: [{ id, title, lessons: [{ id, title, isSample }] }], labRequirements: [{ id, moduleId, title, brief, completionCriteria, mandatory, location }], audit: [{ id, action, actorId, createdAt, note, revision }] }`. Source lesson order is preserved; metadata never contains lesson bodies or private final material.
- `admin_get_course_lesson(p_lesson_id)` returns the protected raw blocks array for administrative review at any version status. Missing private bodies return null, so the UI must check for an array. The ordinary learner endpoint no longer permits draft previews, including for admins.
- `admin_update_course_version(p_version_id, p_expected_revision, p_title, p_description, p_access_tier, p_final_assessment_route, p_lab_policy_status, p_note)` edits draft metadata.
- `admin_update_course_lesson(p_lesson_id, p_expected_revision, p_title, p_is_sample, p_blocks, p_note)` edits a draft lesson and its sample designation.
- `admin_replace_course_labs(p_version_id, p_expected_revision, p_requirements, p_note)` replaces draft learning-lab requirements. Each array row has `moduleId: null | UUID`, `title`, `brief`, `completionCriteria`, `mandatory: boolean`, and optional `location: null | string`. Existing `id` fields may be sent but new row IDs are generated. A module must belong to the same version. Rejected replacements roll back without removing earlier requirements. These are requirements only, not attendance or assessed completion.
- `admin_review_course_version`, `admin_publish_course_version`, `admin_withdraw_course_version` and `admin_clone_course_version` all take `(p_version_id, p_expected_revision, p_note)`. Only clone returns a value: the new draft UUID. Other mutations return void; refresh the detail row after success.

Every mutation locks the version, requires a nonblank audit note of at most 2,000 characters, and compares `p_expected_revision` with the current revision. A stale edit returns SQLSTATE **PT409 / HTTP 409**; reload and reconcile, without automatically retrying a mutation. SQLSTATE 40001 was rejected during HTTP validation because PostgREST treats it as a retryable serialization failure. Unauthorized callers receive 42501. Invalid payload/state receives 22023.

Draft content, sample, metadata and lab edits increment the revision and clear its review. Review records the current revision and timestamp without incrementing it. Publication requires that exact revision to have been reviewed, learning access assigned, a nonempty module/lesson structure, valid protected bodies for every lesson, and consistency between learning-lab policy and requirement rows. Migration `202610040004_courses_deferred_policy.sql` permits unassigned final assessment/lab policy for learning publication; unassigned labs must have zero configured requirements and are disclosed as deferred, not none. It increments the revision and retains the review for unchanged content. No sample is selected automatically and zero samples is permitted. The reviewed content may still require future assessments/lab sign-offs; publication is not certification.

Published and withdrawn content and policy are immutable through the API. Withdrawal retains the version and learner history while hiding learner content through existing access checks. Cloning creates a new draft with new module/lesson/lab IDs, private lesson bodies, private final material, policies and sample selections copied for review. Both original source reference/hash and explicit `cloned_from_version_id` are retained. No enrollment, progress, review, audit history or entitlement is cloned. A per-course lock serializes version numbering. A repeated clone is a separate new draft; the UI must not automatically retry an ambiguous clone response.

`private.course_admin_audit` is readable only through the admin detail RPC and writable only by the owning security-definer functions. There is no update/delete API, and public, anonymous, authenticated and service roles have no direct privileges on it. Each successful mutation records the session actor, action, affected revision, note and time. Failed mutations leave no audit event.

Lesson validation covers all 13 authored block types and their allowed fields, requiring well-formed tables, lists, practice questions/options and inline SVG strings. It limits a lesson to 1–500 blocks and 1 MiB of JSON, rejects duplicate block IDs and unknown fields/types, and preserves the source practice `points` field. HTML/SVG remains sanitized by the renderer; structural validation is not a semantic classifier for final answers hidden in prose. Final material stays in its private table and still requires content review.

### Local evidence

- Both isolated databases (`courses_foundation_check_20261004`, `courses_member_http_check_20261004`) pass **69 new administration assertions + 45 foundation + 40 member-API + 19 membership-scope assertions = 173 each**. Tests run in rolled-back transactions and cover actor restrictions, direct-write denial, optimistic conflicts, malformed bodies, review invalidation, lab-policy consistency, publication immutability, withdrawal, clone provenance/private material and no cloned learner state.
- All **377 authored revision-3 lesson bodies** passed the validator without modifying source content. Initial validation identified the source practice-question `points` field; the validator was extended to preserve its numeric value.
- The separate real Auth/PostgREST check passed **70 HTTP assertions**, including immediate conflict responses, authoritative permissions, audited edits and lifecycle transitions. Its synthetic publication is local test data only; the three authored courses remain drafts with unassigned policy and zero samples.
- SQL logs: `/tmp/armature-courses-admin/*-{029_submission_review_scope,030_courses_foundation,031_courses_member_api,032_courses_admin}.log`. The broader implementation progress log links retained HTTP/browser evidence.

No remote migration, authored-course publication, payment activation, lab sign-off, final grading or certificate issue took place.

### Deferred policy update — 4 October 2026

The owner deferred lab and assessment decisions. Additive migration 004 changes only the publication gate: current content review, assigned learning access, valid complete lessons and consistent configured labs remain required. No default assessment/lab policy is assigned. Published policy remains immutable; subsequent policy uses a reviewed new version. Certification is not implemented or enabled.

Local verification: 14 new deferred-policy assertions + existing 173 = 187 assertions in each isolated DB. 72 real Auth/HTTP checks pass, including learner metadata preserving both deferred states. Frontend suite: 562 tests in 55 files; member build and application/course type checks pass. All three authored courses remain drafts, revision 1, unassigned and unreviewed.

## Initial local learning pilot — 4 October 2026

The owner approved free verified-member pilot access and two samples per course. Three v5 clones of v4 are now locally published in `courses_member_http_check_20261004`, with assessment/lab policy unassigned and six samples. Earlier v1–v4 remain draft. Eighteen sample block corrections are audited; other blocks are unchanged. The foundation DB and production were not modified. See the latest progress section and `courses-learner-pilot.md`. Member/admin API regression scripts now account for the exact versions in the private local pilot manifest; they must not treat all authored courses as published or run against production. The admin reimport test now targets the unchanged v4 package.
