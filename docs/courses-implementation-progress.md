# Courses implementation progress

**Current status — 4 October 2026: the three-course pilot is LIVE at https://courses.armatureailabs.com/ on the existing Armature Supabase project. Free verified-member access and six samples are published. Assessment/lab policies remain deferred. See the production release entry below; earlier preparation-only statuses are historical.**

Updated 4 October 2026. Tracks the [approved plan](courses-platform-plan.md). Implementation is isolated from the current website. No remote database changes, public deployment, payment activation or certificate issuance have occurred.

## Current status

| Stage | Status | Evidence / remaining work |
|---|---|---|
| 0 Selected content package | Complete locally | Three courses; 55 modules; 377 lessons; 6,061 blocks; 137 named diagrams and 189 inline SVGs. Deterministic filtered package, preserved authoring guides, separated final answers and recorded provenance. |
| 1 Local Workbench preview | Implemented and checked; ready for owner review | Catalog, course overview, full ordered syllabus, reader, inline lesson diagrams, mobile Contents/Read/Practice, themes, interactive practice and simulated access. Browser review of representative lessons from all three courses. |
| 2 Protected integration | Authenticated learning and administration implemented and checked locally; content corrections/release pending | Real Auth/RPC integration, enrollment, saved reading/resume, My courses and private SVG transport verified. Audited draft editing, samples, lab definitions, review, versioned publication/withdrawal and cloning verified. Content review found corrections required; source policies stay deferred. Sample/access decisions and production configuration remain. |
| 3 Learning pilot | Not started | Needs reviewed content/sample selection, integrated accounts, end-to-end checks and participant walkthrough. |
| 4 Certification pilot | Not started | Needs course/module lab assignments, final assessment choices, approved criteria, lab sign-off, grading and certificate workflows. |
| 5 Public release | Not started | Needs production checks, domain/auth configuration and publication authorization. |

## Open the deliverables

- Updated inline-diagram reader: [desktop](</Users/dev/Downloads/Armature Lab/output/courses-implementation-2026-10-04/inline-diagrams-desktop.png>) and [mobile](</Users/dev/Downloads/Armature Lab/output/courses-implementation-2026-10-04/inline-diagrams-mobile.png>).
- [Working local Workbench preview](http://localhost:4189/) — server running for this session; use `localhost`, which was verified in the built-in browser. The browser showed an unrelated cached page on `127.0.0.1`; direct HTTP responses were correct, so that origin was not used for visual evidence.
- Historical pre-correction views (separate diagram layout superseded): [Desktop lesson screenshot](../output/courses-implementation-2026-10-04/workbench-desktop.png), [mobile diagram screenshot](../output/courses-implementation-2026-10-04/workbench-mobile.png), [mathematics in sepia](../output/courses-implementation-2026-10-04/mathematics-sepia.png).
- [Selected content inventory](../output/courses-selected-r02/inventory.json) and [normalization/source provenance](../output/courses-selected-r02/provenance.json).
- [Database implementation and test notes](</Users/dev/.codex/worktrees/courses-workbench/Armature Lab/docs/courses-backend-notes.md>).
- Code: `/Users/dev/.codex/worktrees/courses-workbench/Armature Lab`. Created from upstream commit `4345b9a` (PostHog proxy PR #117). Existing modified Downloads checkout and original Learning Platform sources preserved.

The preview uses clearly labelled simulated verified/unverified states. The first introduction of each course is a temporary preview sample, not an approved public sample. Reading marks stay in memory and practice feedback does not grant completion, enrollment, lab credit or certification. Final assessment and course/module lab assignments remain unconfigured.

## Verification completed

| Check | Result |
|---|---|
| Source preservation and deterministic packaging | Original 580-file checksum manifest verified; all three original authoring guides unchanged. Excluded courses and unrelated diagram dependencies absent from selected package. Repeated generation reproduces the package; overlapping source/output and modified-output overwrite attempts rejected. |
| Content normalization | Exactly one tracked repair: computation lesson 11.5, block `m11-5-t3`, encodes `i<N;` as `i&lt;N;` inside HTML code. Original preserved; all other lesson content unchanged. Full code expression verified in browser. |
| Course build and type checking | Pass on Node v22.23.3. Production build is a disabled shell and excludes the local renderer, course bodies, diagram registry and final-answer files. The courses app is not deployable for learning yet. |
| Existing frontend tests | 52 files / 539 tests passed. Existing React act warnings remain in unrelated tests. |
| Course database tests | 45 pgTAP assertions pass: sample/full/draft access, enrollment, private answers, direct-write denial, cross-user history, staff/admin limits, paid entitlement expiry/revocation, banned/suspended/revoked identity. |
| Membership regression | Existing 19 assertions pass. |
| Idempotent import and version protection | Current diagram-resolved revision 3 imported twice into both isolated DBs: 3 current authored course versions, 55 modules and 377 lessons. Revisions 1/2 retained as history; changed-source version reuse is rejected. Authored versions remain draft with policies unassigned and zero approved samples. |
| Diagram checks | All 137 named diagrams server-render with nonempty SVG/viewBox; no NaN/errors. All 189 inline SVGs retain authored elements through sanitization. Representative named and inline diagrams inspected in browser. |
| Preview API | Three-course inventory, no-store responses, single-introduction pending filtering and excluded/private-route denials pass. This is synthetic preview behavior, not production authentication. |
| Browser flow | Catalog → overview → lesson, curriculum navigation, previous/next, inline diagrams, enlarge/fit controls, Read/Practice tabs and practice answer/explanation checked. Pending preview cannot proceed to protected lessons. Mathematics rendering checked with zero KaTeX errors. |
| Responsive themes | 360, 390, 768 and 1440px, light/dark/sepia: no document horizontal overflow on representative reader. Mobile Contents and tabs inspected. No browser warning/error logs in the checked course flow. |

Database testing used a new isolated `courses_foundation_check_20261004` database inside a local Supabase container. Existing local application data and remote databases were not modified. Replayed 43 applicable migrations; excluded only the unrelated ecosystem cron wakeup migration because its scheduler targets the container's main database. See backend notes for exact limits and commands.

## Design verification

Compared the [selected concept](../output/course-ui-options-2026-10-02/02-workbench.png) and actual desktop/mobile screenshots with image inspection. Confirmed dark curriculum sidebar, central prose with inline diagrams, adjacent Practice pane, approved circular branding, heading hierarchy, restrained borders/accent and mobile Contents/tabs. The owner’s 4 October correction replaces the concept’s detached diagram pane with figures at their original lesson positions; actual source lessons and diagrams replace the concept's shortened illustrative content. Current Armature Space Mono prose/controls and copper links follow the upstream design rules.

Intentional copy differences: explicit local-preview label, original full lesson titles/content, and unassigned assessment/lab wording replace illustrative verified-enrollment and universal lab-certificate claims. No pixel-identical mockup-copy claim is made. Some authored source headings are unusually long or repeat nearby prose; retained for editorial review rather than silently rewriting the courses.

## Continue implementation

1. Review this local Workbench with the owner and retain any requested layout/content corrections in the log.
2. Completed locally: authenticated member frontend, enrollment, saved position, My courses, session/HTTP/browser tests and local callback. Configure and verify the production courses origin during the separately approved release step.
3. Completed locally: audited Admin/Super admin authoring/publication and protected SVG delivery. Correct and recheck the content review findings, then approve samples and learning access; assessment/lab policies remain deferred; membership-review Staff permissions remain unchanged.
4. Implement independent course/module lab scheduling, attendance and authorized completion/reassessment, then final assessment and certificate operations. Reading/quiz progress must not grant lab completion; no course policy may be inferred.
5. Run the learning and certification pilots before the separate public release stage. Payments remain on hold.

## Run locally

From the isolated worktree, prepend the existing Node 22 runtime to PATH:

```sh
export PATH='/Users/dev/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:'"$PATH"
node scripts/courses/prepare-content.mjs --source '/Users/dev/Downloads/Armature Lab/course-content' --output course-generated
npm run prepare:courses:diagrams
npm run dev:courses
```

Open `http://localhost:4189/`. `npm run build:courses` checks types and creates only the disabled production shell. `node scripts/courses/check-preview.mjs` checks the running local API. `node scripts/courses/generate-import.mjs course-generated /private/tmp/armature-course-import-r03.sql 3` creates, but never executes, private draft import SQL. Keep that SQL outside public assets.

## Execution log

- 4 October: inspected current upstream and created the isolated worktree; installed committed lockfile dependencies with Node 22, then added DOMPurify and KaTeX for safe lesson rendering.
- 4 October: completed filtered package and local Workbench; corrected one source HTML encoding defect in the versioned derivative and verified the full expression renders.
- 4 October: completed database foundation checks, repeated imports, version guard and membership regression; documented stage 2 gaps rather than marking integration complete.
- 4 October: completed representative browser, theme, responsive and diagram checks; saved evidence and left the preview open for review.

Owner decisions still needed: reviewed course versions, sample lessons, free/paid course designation, final assessment route and mandatory/optional labs per course/module, completion criteria, supervision/location, retake rules and certificate wording. These remain decisions for operating the platform, not blockers to the completed local preview.

- 4 October, diagram-placement correction: moved all illustration blocks into the lesson reading flow without changing source content/order; removed separate diagram panel/tab. Retained captions, enlarge/fit and Practice. Checked the screenshot’s Microcontroller lesson with its diagram between the MCU definition and the next heading, exactly once. Responsive checks at 360/390/768/1440px in light/dark/sepia show no page overflow. Course build/typecheck and existing 539 frontend tests pass. Evidence: `inline-diagrams-responsive.json`, `inline-diagrams-build.log`, `inline-diagrams-tests.log` and the updated screenshots in `output/courses-implementation-2026-10-04/`.

## Authenticated learning increment — 4 October 2026

**Implemented and verified locally:** real Supabase Auth sessions; published catalog/syllabus; selected samples; verified-member enrollment; protected lesson bodies with inline diagrams; automatic debounced block-position saving plus explicit retry; permanent reading marks; My courses and resume after reload/sign-in. Paid learning still requires a valid independent entitlement. No checkout or paid coworking membership is required for free courses.

The member frontend is separate from the simulated preview. `localhost:4191` currently uses an isolated Auth/PostgREST service with clearly labelled synthetic accounts and two synthetic courses; port 4190 was occupied and left untouched. The three authored courses remain drafts in the database, with no invented sample, free/paid, final-assessment or lab assignments. Use `localhost:4189` to review their actual content in the existing simulated preview.

| Check | Evidence |
|---|---|
| Frontend regression | 53 files / 547 tests pass, including 8 member tests for pending samples, enrollment, persistence, revocation, identity switch, late responses, save failure/retry, unchanged-access refresh and cancelled enrollment. Application and course TypeScript checks pass. |
| Database regression | 45 foundation + 40 member API + 19 membership assertions pass after revision-3 imports. |
| Actual HTTP/Auth | 29 checks: anonymous denial, samples/full access, enrollment, saved progress, cross-user isolation, private answers, forbidden writes, entitlement expiry/revocation, identity revocation, expired token rejection and refresh. |
| Email callback | 4 real local email/PKCE checks using the exact UI callback `http://localhost:4191/`. Mail goes only to the local test mailbox; production email delivery/callback configuration remains unverified. |
| Browser | Verified user enrolled, read protected text/inline SVG, marked a lesson read, reloaded, resumed the stored block and retained the mark after sign-out/sign-in. Pending account can read only the sample; full lesson and Next remain disabled. |
| Responsive | 360/390/768/1440px in light/dark/sepia: no page overflow. Mobile Read/Practice switching and inline diagram enlarge/fit work. |
| Protected assets | Revision 3 resolves all 137 named diagrams into private SVG lesson blocks, alongside 189 inline SVGs. Three courses / 55 modules / 377 bodies imported twice into each isolated DB, with history retained. No final assessment objects leaked into learner bodies. Member build contains no authored lesson strings, diagram registry or private assessment data; preview APIs and raw private file paths return 403 in member mode. |
| Build | Both default disabled-shell build and explicit member build pass. Existing unrelated React test warnings and a member-bundle size advisory remain; these are not runtime failures. |

Access is checked by server RPCs on every lesson fetch/save/enrollment. On identity change, sign-out or access failure, the frontend discards protected lesson state; response guards reject late results. Successful background checks retain the current lesson/practice view. Reading progress never signs off a lab or issues a certificate.

Evidence folder: [member integration checks and screenshots](</Users/dev/Downloads/Armature Lab/output/courses-member-integration-2026-10-04/>). [My courses desktop](</Users/dev/Downloads/Armature Lab/output/courses-member-integration-2026-10-04/my-courses-desktop.png>), [member reader desktop](</Users/dev/Downloads/Armature Lab/output/courses-member-integration-2026-10-04/member-reader-desktop.png>), [member reader mobile](</Users/dev/Downloads/Armature Lab/output/courses-member-integration-2026-10-04/member-reader-mobile.png>), [pending sample](</Users/dev/Downloads/Armature Lab/output/courses-member-integration-2026-10-04/pending-member-sample.png>).

### Run the member integration

Reuse the existing local services rather than resetting a database. From the isolated worktree with Node 22:

```sh
set -a
source /private/tmp/armature-courses-member-http/frontend.env
set +a
npm run dev:courses:member -- --port 4191
```

`frontend.env` holds the local URL and publishable key, and enables a development-only password form for synthetic accounts. Credentials/signing material remain in private mode-0600 temporary files and must never be committed. Normal member builds use email-link/PKCE sign-in. `VITE_COURSES_SUPABASE_URL` and `VITE_COURSES_SUPABASE_PUBLISHABLE_KEY` must be explicitly configured for `--mode member`; the default production build still emits the disabled shell. Secret/service-role keys are rejected. The member build output is `dist-courses-member`, with approved brand assets but no course content. The integration does not use or modify the main website's Supabase configuration.

For a fresh isolated harness, inspect `scripts/courses/local-backend.mjs` before running `setup`; it clones only the named local foundation database and refuses to overwrite an existing harness. `proxy` starts the loopback gateway. `check-member-api.mjs` recreates synthetic fixtures (do not run during a learner demonstration); `check-member-api-pkce.mjs` exercises the local email callback. Never run these scripts against production.

**Next:** course administration is now implemented locally (see below). Correct and recheck the review findings and approve samples/learning access, then run the learner pilot. Assessment/lab policies remain deferred. Production Supabase migrations, project configuration and `https://courses.armatureailabs.com/` redirect allowlisting still need the separate release step. Course/module lab operations, final grading and certificates remain later stages. No production data, deployment, payment activation or real member account was changed.

## Course administration increment — 4 October 2026

**Implemented and verified locally:** Admin/Super admin course metadata and lesson editing, all 13 source block types, sanitized lesson previews with inline diagrams, selected samples, independent course/module lab definitions, recorded review, publication/withdrawal, new draft versions and audit history. Published/withdrawn versions are read-only; edits invalidate review and stale revisions are rejected. Every saved action requires a note. Unsaved edits survive transient role-check errors; ambiguous mutation outcomes require reload before another action.

The imported structure and source IDs remain fixed. This increment supports corrections within existing courses; it does not create new modules/courses, assign assessors, record attendance, grade final exams or issue certificates. Course/module lab requirements can be defined now; conducting and signing off those labs remains a later operational stage. Re-import refuses to overwrite edited, reviewed or non-draft versions.

| Check | Result |
|---|---|
| Frontend regression | 55 files / 560 tests pass, including 8 administration and 5 block-editor tests. Application and course TypeScript checks pass. |
| Database regression | 173 assertions in each of the two isolated databases: 69 administration + 45 foundation + 40 member API + 19 membership scope. All 377 imported revision-3 lesson bodies pass structural validation. |
| Real Auth/PostgREST | 70 checks pass, including Admin/Super admin access, Staff/member denial, immediate stale-edit rejection, reviewed publication, immutable published content, withdrawal, clone provenance, retained learner history and import protection. |
| Browser lifecycle | Synthetic local course edited, sample removed, reviewed, published, visible in learner catalog, cloned into a fresh draft and withdrawn; catalog removal and retained audit events verified. No authored course was published for testing. |
| Browser content and roles | Actual Microcontroller draft loaded through the private admin API; inline diagram displayed once in its source position and enlarge/fit checked. Staff denied the direct administration route. No warning/error logs in the final checked browser flow. |
| Responsive | 360/390/768/1440px lesson preview: zero document overflow after fixing the 360px grid minimum. The browser-wide viewport override was ineffective; actual dimensions were checked with temporary tab-level emulation, then restored. |
| Builds | Safe default disabled-shell and explicit configured member build pass. Member mode correctly refuses missing Supabase configuration. Existing unrelated React test warnings and member bundle-size advisory remain. |
| Authored content preservation | Three authored revision-3 versions remain draft, revision 1, unreviewed, all policies unassigned and zero selected samples: Computation 208 lessons, Mathematics 83, Embedded Firmware 86. Source guides and source content are unchanged. |

Open [local course administration](http://localhost:4191/admin/courses). The retained browser session uses a synthetic local Admin, not a production account. [Administration preview](</Users/dev/Downloads/Armature Lab/output/courses-admin-integration-2026-10-04/course-administration.png>), [inline source lesson](</Users/dev/Downloads/Armature Lab/output/courses-admin-integration-2026-10-04/lesson-inline-preview.png>), [audit history](</Users/dev/Downloads/Armature Lab/output/courses-admin-integration-2026-10-04/audit-history.png>) and [Staff denial](</Users/dev/Downloads/Armature Lab/output/courses-admin-integration-2026-10-04/staff-denied.png>). Logs and machine-readable checks are in the same evidence folder. Private credentials remain outside the repository.

**Next:** correct and recheck the course review findings, select sample lessons and approve learning access. Final-assessment/learning-lab policies remain deferred by the owner. Then conduct a controlled learner pilot and implement operational lab sign-off and final assessments. Production database/origin configuration, deployment, payment activation and certificates remain separate unfinished stages. No remote migration, deployment or real member-role change occurred.

## Content review and deferred policies — 4 October 2026

Completed a first editorial/technical review of the three courses. [Review report](courses-content-review.md) records 58 numbered findings plus follow-up queues, exact source locations, proposed corrections and coverage limits. All 377 lessons were scanned structurally; semantic/code/diagram review is bounded as documented. Defects include truncated questions, incorrect keys/worked examples, embedded control/debug code errors and diagram-caption mismatches. Do not mark the authored drafts editorially approved until the correction pass and rendered rechecks are complete.

Owner clarification applied: assessment and lab policies remain unassigned/configurable and do not block content review or future learning-only publication. Local migration 004 permits deferred policies while retaining content review and learning-access gates; learner copy distinguishes deferred from none. Certification remains unavailable. Existing published policy is immutable; future changes use a reviewed version.

Verification: 562 frontend tests / 55 files; member build and app/course type checks pass; 187 SQL assertions per isolated DB; 72 local Auth/HTTP checks. Source preservation: all 580 manifest files and all three Desktop authoring guides match. Evidence is in `output/courses-content-review-2026-10-04/`. Source lessons, diagrams, sample flags and authored DB versions unchanged. No production publication.

Next: issue a tracked correction derivative, verify exact fixes and diagrams, then approve samples/learning access and run a learner pilot. Lab/assessment policy choices remain deferred by the owner and must not be requested as a prerequisite for content corrections.

## Tracked content correction pass — 4 October 2026

**Completed locally after owner approval.** The three courses now have separate corrected version-4 drafts: 55 modules, 377 lessons, 6,064 blocks, 1,601 formative questions and 327 diagrams. All existing module/lesson/block/question IDs and order survive; additions are two credit blocks and one inline mathematics substitution diagram. Original `course-content` (580 checksummed files), selected `course-generated`, the three authoring guides and earlier local database versions remain preserved.

The correction ledger covers all 58 numbered review findings plus five computation follow-up notes: 60 entries corrected, two deferred, one partial. These are tracked finding statuses, not an exhaustive subject-expert certification. Corrections include malformed questions/options, keys, worked calculations, Python compatibility, technical explanations and conceptual firmware examples. Four computation mechanisms, five mathematics diagrams and three embedded diagrams were replaced; one mathematics diagram was added. Another 78 computation drawings retain their structure with 226 recovered/wrapped labels. Label repair alone is not instructional sign-off for those drawings.

Exercise examples are now hidden behind **Show hint/example**. All diagrams remain within lesson content with captions and enlarge/fit controls. SVG IDs are namespaced for both named and inline figures, fixing collisions between source diagrams without changing source files. Assessment and lab requirements remain configurable and unassigned; samples and free/paid learning access are also unassigned. No certificate, policy, payment or production publication was activated.

| Check | Result |
|---|---|
| Package and source | Deterministic repeated generation; original 580 files, selected 36 files and corrected 37 files pass hashes; all three original guides unchanged. Exact changed blocks and hashes recorded in private `corrections.json`. |
| All lessons | All 377 lesson bodies validate; 1,601 formative questions have nonempty rendered fields, unique option IDs and one marked correct answer; all 327 diagrams parse and retain sanitized labels with unique IDs/valid markers. This verifies structure, not every answer's semantics. |
| Executable examples | Mathematics: 356 checks, seven Python examples. Embedded: nine verification groups including seven compiled host suites under ASan/UBSan. Computation: prefix decoding, hold timing, bandwidth, stack offsets, semaphore invariant, quiz-key integrity and 82 changed SVGs checked. Host checks do not establish MCU behavior. |
| Reader regression/build | 55 files / 563 tests pass; application/course type checks and both safe-default and member builds pass. Existing React test/source-render warnings, default-shell font-resolution warning and member bundle-size advisory remain. No warning/error logs in the checked browser flow. |
| Local database | Imported v4 twice into each isolated course DB; prior version metadata unchanged. Three drafts per DB, all 377 bodies valid, no samples, no review or access/assessment/lab assignments. 181 assertions per DB passed in the five named suites recorded in `database-v4-checks.json`. |
| Actual Auth/API | Admin reads corrected private lesson; Staff/member receive 403; authored drafts absent from member catalog. Raw corrected package and member-mode preview API paths return 403. |
| Browser | Corrected H-bridge, integration/substitution and stack-frame lessons inspected. Formative feedback, explicit hint reveal/hide and inline enlarge/fit work. At 390px mobile and 1440px desktop, no document overflow; mobile Read/Practice switches correctly. Representative checks only. |

Open the [corrected local preview](http://localhost:4192). The older preview on 4189 is the preserved baseline; local authenticated administration remains on 4191. Implementation/package: `/Users/dev/.codex/worktrees/courses-workbench/Armature Lab/output/courses-corrected-v4/`. This private directory and the import SQL contain protected material and must never be deployed as static assets.

[Correction status and evidence](</Users/dev/Downloads/Armature Lab/output/courses-corrections-2026-10-04/correction-status.json>), [package validation](</Users/dev/Downloads/Armature Lab/output/courses-corrections-2026-10-04/package-checks.json>), [database checks](</Users/dev/Downloads/Armature Lab/output/courses-corrections-2026-10-04/database-v4-checks.json>), [desktop lesson](</Users/dev/Downloads/Armature Lab/output/courses-corrections-2026-10-04/embedded-desktop.png>) and [mobile lesson](</Users/dev/Downloads/Armature Lab/output/courses-corrections-2026-10-04/embedded-mobile.png>).

**Next:** approve the reviewed draft versions, proposed introduction/first-lesson samples and learning access, then run a small learner pilot. Keep lab/assessment choices deferred. Retain open source-permission confirmation, duration/prerequisite pilot, deeper diagram/pedagogical review and hardware validation. The private legacy exam remains unapproved; seven computation lessons without diagrams remain an authoring follow-up. Production integration/deployment, operational labs, final grading and certificates are separate unfinished stages.

## Initial learning pilot preparation — 4 October 2026

**Local rehearsal complete; real learner pilot not started.** Owner approved free access for verified members during the initial pilot and six registered-member samples: each course introduction and first teaching lesson. Future pricing remains undecided. Separate **v5** versions now run through the real local Auth/RPC service at [localhost:4191](http://localhost:4191/); corrected v4 and earlier history remain intact. The v5 database status is `published` only inside `courses_member_http_check_20261004`; this is not a public website release. The foundation test DB and production were not changed by this pilot setup.

A focused independent review of all six samples (110 blocks, 15 formative questions and three Python examples) found 18 additional block corrections. These were applied only to the new v5 clones through audited Admin APIs before local publication. They fix a nonexistent lesson reference, overgeneralized CPU/GPU/tokenization and embedded claims, quiz explanations and two mathematics diagrams. All original IDs/order and answer IDs survive. Every other lesson block matches its v4 source. Exact private before/after replacements and the review are preserved in `output/courses-pilot-2026-10-04/`.

| Check | Result |
|---|---|
| Content integration | All 377 v5 lesson bodies validate. Exactly 18 approved blocks changed; six samples; 327 SVGs parse and retain sanitized labels; 1,601 formative questions retain option/answer integrity. |
| Focused pilot API | 55 checks pass: catalog/free access/deferred policies, six readable samples, protected-content and enrollment denial for pending identity, saved progress denial for pending samples, verified enrollment, new-session persistence, cross-user isolation, old-draft denial and private-final-material boundary. |
| Regression | 563 frontend tests / 55 files, 181 database assertions, 29 member API and 72 administration API checks pass. API harnesses now recognize only the specifically recorded pilot versions and use the preserved v4 import for reimport protection; original histories remain checked. |
| Browser | Synthetic pending member can read the two Maths samples but cannot advance to Lesson 1.2 or enroll. Verified synthetic member enrolled Embedded Firmware, opened protected Lesson 1.2, marked it read, signed out/in and resumed the same lesson with 1/86 retained. |
| Visuals/mobile | Corrected mathematics diagrams appear inline with correct membership, union, intersection and complement regions. Sample quiz feedback, inline enlargement, mobile Contents and Read/Practice work. At 390px all three themes have no page overflow; desktop checked at 1440px. Temporary viewport override restored; no warning/error logs in the checked flow. |
| Policy | Access free for this pilot; assessment/lab fields remain `unassigned`, no lab rows, no final grading/certificates/payment activation. The overview discloses deferred requirements before enrollment. |

[Participant walkthrough and acceptance plan](courses-learner-pilot.md). Evidence: [sample review](</Users/dev/Downloads/Armature Lab/output/courses-pilot-2026-10-04/sample-review.md>), [pilot API checks](</Users/dev/Downloads/Armature Lab/output/courses-pilot-2026-10-04/pilot-api-checks.json>), [sample access](</Users/dev/Downloads/Armature Lab/output/courses-pilot-2026-10-04/pending-samples.png>), [corrected operation diagram](</Users/dev/Downloads/Armature Lab/output/courses-pilot-2026-10-04/mathematics-operations-inline.png>), [saved progress](</Users/dev/Downloads/Armature Lab/output/courses-pilot-2026-10-04/saved-progress.png>) and [authenticated reader](</Users/dev/Downloads/Armature Lab/output/courses-pilot-2026-10-04/enrolled-reader.png>).

The browser retains a synthetic verified learner session. Credentials stay in private temporary files, never in the handoff or public build. No participant was contacted. The two clearly labelled synthetic fixture courses remain in this test environment for regression coverage and must not be imported into production. Local preparation uses `prepare-local-pilot.mjs prepare`, `correct <review-json>` and `publish`, with a private manifest to avoid duplicate clones and explicit state checks. Only the isolated loopback harness is supported. Do not rerun preparation over published v5; subsequent changes use another reviewed draft.

**Remaining:** real participants, timings and learning feedback; source-permission confirmation; broader instructional and hardware checks; approved pilot hosting with production membership integration, email callbacks, release/rollback checks and explicit publication authorization. A visible follow-up outside the six reviewed samples is Embedded Lesson 1.2 (`m01/l03`), whose heading/opening still overgeneralize sense–process–act as universal; include it in the broader consistency pass before real learner release. This technical rehearsal is not a whole-course accuracy or hardware sign-off. Lab and assessment policies may remain deferred.

## Complete three-course re-review — 4 October 2026

**Full review complete; correction work remains.** Every module and lesson of the actual v5 pilot was read: 55 modules, 377 lessons, 6,064 blocks, 1,601 formative questions, 327 rendered diagrams and 168 code blocks. Private assessment review covered 110 distinct questions across current and legacy banks, including comparison of duplicate copies. All 377 coverage records reconcile to the frozen input with no missing lessons or count discrepancies.

The courses are not yet cleared for a real learner pilot across all modules. New findings include incorrect mathematical conditions and worked answers, Boolean and timing mistakes, inconsistent quiz keys/explanations, firmware races and target/toolchain assumptions, plus extensive diagram/caption mismatches. Earlier bounded fixes did not establish whole-course accuracy. See the [full content review](courses-full-content-review.md) and its course-specific evidence links.

All 86 Mathematics Python examples executed; Embedded passed eight bounded host-check groups, with all 69 code blocks reviewed statically. Computation has reference-model/arithmetic/encoding checks; no full BSim or GPU-runtime validation is claimed. All 88 Python snippets parse and all 27 dedicated math blocks pass strict KaTeX. All 327 figures were inspected on 56 complete contact sheets; initially cropped gallery renders were corrected before completing the visual pass. High-severity Computation visual findings received a second check, with ambiguous claims qualified.

The 450 exact proposed content-block replacements remain separate from v5 and preserve source block IDs (82 Mathematics, 247 Computation, 121 Embedded). Coverage/proposal reconciliation and the in-memory structural rehearsal are saved under `output/courses-full-review-2026-10-04/`, alongside per-lesson, code, diagram, private-bank and execution ledgers. Frozen-input hashes remain intact. These proposals do not close every finding; redraws, cross-lesson consistency and hardware-dependent examples remain open. No course content, live database, production publication, payment, assessment route or lab policy changed.

**Next:** use a new draft for reviewed factual/code/quiz corrections; redraw misleading or incomplete diagrams inline; reconcile repeated claims and unresolved findings; validate changed lessons in the actual desktop/mobile reader. Pin and validate any runnable hardware track separately. Keep free pilot access and six samples approved, with final assessment/lab rules deferred. Resume real learner pilot preparation only after the content correction and recheck stage.


## Full-review correction draft v6 — completed locally, 4 October 2026

**The reviewed corrections are implemented in separate v6 drafts.** The immutable v5 pilot, earlier versions, original exports and authoring guides remain preserved. The package still contains three courses, 55 modules, 377 lessons, 6,064 blocks, 1,601 formative questions and 327 inline diagrams.

| Course | Corrected lesson blocks | Changed diagrams | Reader coverage |
|---|---:|---:|---:|
| Mathematics Foundations for AI | 141 | 52 | 83/83 lessons |
| Computation Structures: From Gates to Processors | 514 | 128 | 208/208 lessons |
| Embedded Firmware Fundamentals | 317 | 64 | 86/86 lessons |
| **Total** | **972** | **244** | **377/377 lessons** |

All original review findings are mapped to explicit closure evidence. Corrections cover factual explanations, worked examples, quiz keys/explanations, code assumptions and cross-lesson contradictions. Private assessment corrections cover 44 distinct questions / 76 stored copies; these banks remain private and unapproved for certification. Module, lesson, block and question IDs/order remain stable. Embedded intentionally reorders 252 option arrays to remove extreme answer-position bias while preserving option IDs and correct-answer associations; other source structure is retained.

- [x] Apply and reconcile all three course reviews, follow-up consistency fixes and private-bank corrections.
- [x] Redraw deficient figures, inspect diagram galleries and retain diagrams inline beside their explanations.
- [x] Generate the final package twice with identical results; preserve original 580-file export, selected 36-file package and all three guides.
- [x] Validate all 377 bodies, 1,601 question structures and 327 SVGs, including sanitized labels and marker references.
- [x] Walk every lesson in the actual desktop reader, matching title, diagram and question counts. No runtime errors, unavailable content, formula errors, clipped SVG labels or document overflow were detected in this walkthrough.
- [x] Check representative lessons at 1440px desktop and 390px mobile in light/dark/sepia; verify inline enlarge/fit, practice feedback and Contents/Read/Practice controls.
- [x] Run the existing frontend suite: **55 files / 563 tests pass**. This pass changes content, not the reader implementation.
- [x] Import v6 into the isolated loopback member test DB. All 377 stored bodies and six private-bank copies match the final package; database block validators pass. Earlier versions are unchanged. Admin draft reads succeed; Staff and learner draft access is denied.

Mathematics has 513 checks and 86 executed Python examples. Computation has 3,877 reference/structure checks plus 432 additional late-module checks and an independent recheck of that late consistency pass. Embedded has bounded host sanitizer, numeric, transport/logging and build checks; these do not validate a physical board. Existing source-render React key warnings are unchanged. These checks close recorded findings and establish the stated coverage, not an error-free textbook or independent instructor endorsement.

Open the [v6 local simulated preview](http://localhost:4193/). The authenticated v5 rehearsal remains on localhost:4191; v6 stays **draft** in the isolated database. All three v6 courses retain approved free pilot access and two selected sample lessons each. Assessment routes and course/module lab requirements remain **unassigned**. No public deployment, certificate, payment or operational lab was activated.

Evidence: [final verification](../output/courses-full-review-2026-10-04/v6-final-checks.json), [finding reconciliation](../output/courses-full-review-2026-10-04/v6-finding-reconciliation.json), [database import](../output/courses-full-review-2026-10-04/v6-local-import.json), [source preservation](../output/courses-full-review-2026-10-04/v6-source-preservation.json), [desktop inline diagram](../output/courses-full-review-2026-10-04/courses-v6-embedded-desktop.png), [mobile inline diagram](../output/courses-full-review-2026-10-04/courses-v6-embedded-mobile-dark.png). Course-specific closure/execution ledgers and exact before/after changes are retained in the private evidence folder. The final package and import SQL contain protected material and must never be deployed as static assets.

**Next:** independent instructor spot-check and a small real learner pilot for comprehension, prerequisites and pacing, after source-permission and hosting/release readiness are confirmed. Validate a pinned board/toolchain track before promising runnable hardware projects; full Beta/BSim execution remains unverified. Assessment/lab policies can remain deferred for learning-only access. Public release and enabling any assessment/certification remain separate actions.

## Pilot hosting preparation — completed, 4 October 2026

Owner confirmed instructor review complete and reuse permission granted. Learner trial moves **after launch**. Created the empty Cloudflare Pages project armature-courses; production course schema/content, DNS and Auth settings remain unchanged.

Implemented a dedicated production build pinned to the existing Armature backend, guarded configuration, static-output checks, no-store/noindex/security headers and unknown-path404s. Added validated lesson links with reload/Back/Forward restoration, exact-root email callback with safe destination recovery, clearer auth errors and the working membership entry. Assessment/lab requirements remain unassigned.

Validation: **56 frontend files / 573 tests**, course TypeScript, production build,73-file artifact check and 9 configuration checks pass. Corrected v6 is reviewed/published only in the isolated local rehearsal;55 Auth/API checks pass and earlier versions remain preserved. Desktop/mobile checks confirm sample restrictions, protected lesson reload/back-forward and sign-in/theme controls. Local Cloudflare verifies root/query200 and private/unknown404 with expected headers. No real email, member change or production database mutation.

[Release readiness](courses-release-readiness.md) records the four-migration sequence, private import/configuration, domain/callback/deployment steps, recovery limits and evidence. Frozen site/hashes: output/courses-hosting-2026-10-04/site/; deploy only that subdirectory. The main-site direct /onboarding route returns404; /join/ client navigation works and is the course membership link.

**Next:** public activation approval, then course-only migrations/import, domain/exact callback, checked site deployment and live authentication/access verification. Learner trial follows launch. Instructor/reuse confirmation will not be requested again; assessment/lab choices remain deferred.


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


### Signup publication completed

Selected option 03 is live at https://armatureailabs.com/onboarding and /auth. PR122 was squash-merged as d00076c43e5825c0a72b0682498ec64b7bb44c37; production workflow 37217241630 succeeded and Cloudflare deployment 1c252cb1 is active. The direct /onboarding 404 is repaired. Actual-origin desktop/mobile checks across light/dark/sepia passed with enabled auth controls, no mocked network, no preview/error notice and no browser errors. Shared Supabase identity remains unchanged. Evidence: output/signup-ui-options-2026-10-04/signup-live-report.json and README.md.

Both requested releases are complete. The real learner sign-in/lesson trial is the remaining post-launch step; release QA sent no emails and did not submit or change a real member account.


### Course sign-in recovery published — 4 October 2026

- Owner reported a received email link returning to the email form. Read-only production evidence confirms a valid account and issued PKCE authorization code, with no completed new session. It does not prove which browser/profile the owner used.
- Reproduced the missing-verifier case in a second local browser profile. SDK does not attempt exchange there. The frontend now awaits initialization errors, explains failed callbacks, and gives same-profile/newest-link instructions before submission. Existing sessions remain valid when old links fail.
- Real local Auth/Mailpit browser checks: same-profile sign-in succeeds; different-profile callback shows recovery; a fresh request from that profile then succeeds. No external mail sent.
- All 582 tests across 57 files and course production build pass. Published site-r3, deployment 132c94a2.armature-courses.pages.dev. Live desktop/mobile checks pass with no console errors or overflow; all 72 served files match the release.
- Shared Supabase, membership rules, templates, course data, payments and certificate policies unchanged. User must retry with a new link in the requesting browser/profile; their real live completion is still unverified.
