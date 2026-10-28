# Armature Courses Implementation Plan

**Current status — 4 October 2026: the three-course pilot is LIVE at https://courses.armatureailabs.com/ on the existing Armature Supabase project. Free verified-member access and six samples are published. Assessment/lab policies remain deferred. See the production release entry below; earlier preparation-only statuses are historical.**

Updated 4 October 2026. The selected three-course package and local Workbench preview are implemented and checked. The dedicated database foundation has passed isolated local access/import tests. Authenticated enrollment, saved reading progress, My courses and private SVG delivery now pass local Auth/API/browser checks. Admin/Super admin course editing, sample selection, lab definitions, recorded content review, publication/withdrawal and new draft versions now also pass local database/API/browser checks. Production configuration, operational lab/assessment workflows, pilot and deployment remain unfinished. See the [implementation progress log](courses-implementation-progress.md) for current status, evidence, working paths and next steps.

## Confirmed decisions and current evidence

- Use the existing Armature Supabase project and member identity, with dedicated course tables. Free identity verification is sufficient for free-course enrollment; a paid coworking membership is not required.
- Registered members awaiting verification can view descriptions, syllabuses and selected sample lessons. Full enrollment and learning access require verified membership. Paid courses additionally require a course entitlement.
- Mirror the three selected authored courses, including Embedded Firmware, with existing course/module/lesson structure, guidelines and diagrams. Keep titles and lesson order unless a later content revision is explicitly approved.
- Exclude **Introduction to AI with Python**, **Logic, Reasoning & Problem-Solving for AI**, and **Computer Science Essentials for AI and LLMs**, as requested on 4 October 2026. Retain their existing local copies only as transfer history; omit these courses and their course-specific assets from the application import and catalog. Exclude the source website design, empty draft catalog and all upcoming course plans. The owner will define future robotics and physical-AI courses later.
- Use selected **option 02 Workbench**: dark curriculum sidebar, central lesson explanation with diagrams inline at their original source block positions, and an adjacent Practice pane. Mobile uses collapsed Contents and Read/Practice tabs; diagrams stay within Read. The owner’s 4 October correction supersedes the separate diagram pane/tab in the original concept. Preserve light, dark and sepia reading modes.
- **Assessment requirements are course-specific.** The online-quiz final assessment requires an approved final quiz, without adding a final written exam or final practical. Required learning labs may independently apply to a course or module. Lab-assessed courses require both a passed written test supervised at the Armature lab and a passed practical project completed and assessed there. Certificate eligibility requires verified membership, completion of any mandatory course/module labs and the approved final assessment for that course. This supersedes the earlier universal lab requirement; routes for the three courses remain unassigned pending owner selection.
- **Policy deferral, 4 October:** review current course content now. The owner will define lab and assessment requirements later, mainly for upcoming courses. Keep these fields configurable and unassigned; deferred does not mean no labs or no assessment. Reviewed learning content can be published later with clear “to be confirmed” disclosure without assigning certification requirements. Learning access still needs an explicit free/paid decision, and publication still needs authorization. Future policy changes use reviewed versions and preserve earlier learner history.
- Keep paid checkout and payment-provider setup on hold. Course transfer and design selection do not authorize publication, payment activation or certificate issuance.

| Selected course | Modules | Lesson entries |
|---|---:|---:|
| Computation Structures: From Gates to Processors | 20 | 208 |
| Mathematics Foundations for AI | 16 | 83 |
| Embedded Firmware Fundamentals: From Microcontrollers to Real-Time Systems | 19 | 86 |
| Total | 55 | 377 |

Entries include module introductions. These totals cover the three selected courses. The original six-course local transfer package, including the three now-excluded courses, contains 22,164 blocks, 704 named diagrams and 246 inline SVG blocks. Source content equality and hashes were checked; the named diagrams passed server rendering and the inline SVGs passed XML parsing. Ten existing unit-test files containing 43 tests passed in the original checkout. These checks do not establish instructional accuracy, browser quality, current upstream integration or production readiness. Transfer validation used the available Node 24 runtime; application implementation and release checks must use the repository-required Node 22 and committed lockfile.

Sources: [content package](../course-content/README.md), [transfer manifest](../course-content/manifest.json), [validation](../course-content/validation.json), [selected Workbench concept](../output/course-ui-options-2026-10-02/02-workbench.png), [selection and prompts](../output/course-ui-options-2026-10-02/prompts-and-provenance.json), [design rules](../DESIGN.md), and [payment boundary](release-evidence/discounts-2026-09-30/progress.md).

## Course authoring guidelines to preserve and use

The reusable guidelines remain in scope independently of the three excluded courses. The following files are complete copies from `/Users/dev/Desktop/Learning Platform/docs/`; all three were verified byte for byte against their current originals on 4 October 2026. Preserve the originals and their hashes. Maintain Armature-specific adaptations separately in the [authoring and transfer guide](../course-content/guidelines/README.md).

| Preserved reference | Use in Armature |
|---|---|
| [COURSE-AUTHORING-PROMPT.md](../course-content/guidelines/source-reference/COURSE-AUTHORING-PROMPT.md) | Primary authoring prompt: course overview, module/lesson outline, objectives, typed lesson blocks, explanations, worked examples, exercises, lesson quizzes, final-exam questions and lesson-specific diagrams. |
| [MODULE-INTEGRATION-GUIDE.md](../course-content/guidelines/source-reference/MODULE-INTEGRATION-GUIDE.md) | Lesson section structure, Markdown-to-block conversion, quiz schemas, stable IDs and module assembly that preserves assessment content. |
| [SVG-ILLUSTRATION-GUIDE.md](../course-content/guidelines/source-reference/SVG-ILLUSTRATION-GUIDE.md) | Instructional diagram creation, naming and registration, adapted to Armature's selected design. |

For existing courses, preserve the authored structure and content rather than regenerate them to match a template. For future owner-selected courses, use this workflow:

1. Define the intended learner, prerequisites, learning outcomes and source material; prepare the complete module and lesson outline first.
2. Develop one module or lesson at a time, with matching ordered lesson titles and content keys, unique block IDs, clear objectives, beginner-friendly explanations, worked examples and relevant exercises.
3. Build diagrams around the concept taught in each lesson. Review labels, formulas, code examples and mobile readability with the lesson itself.
4. Develop practice quizzes with plausible distractors, correct answers and explanations. The source prompt's five-question and 30–50-block targets are authoring guidance, not an instruction to pad or rewrite copied lessons.
5. Prepare any final online quiz separately from practice quizzes, covering course objectives across modules with stable question IDs and reviewed answers. Develop practical briefs for any required course/module labs. Develop a final written test and final practical brief for courses assigned the lab final-assessment route. Source question counts and thresholds do not determine Armature certification policy.
6. Review instructional accuracy, source attribution, quiz answers and diagrams; validate content structure and render the reviewed draft before publication. Keep revisions and source provenance traceable.

The historical prompt includes a one-off external-handbook copying request; it is not an instruction for future courses. Source SQL, storage layout, automatic certificate behavior and website styling also remain reference material. Adapt these to the dedicated Armature course storage, protected assessment answers, approved membership rules and Workbench design.

## Workbench screens and content preparation

Implement a dedicated course frontend and deployment in the Armature repository, based on verified current upstream code. Preserve the older modified Downloads checkout and original Learning Platform sources. Share Armature's identity integration, approved brand assets and design tokens; do not transplant the source app shell or replace the main Armature website.

The selected concept defines layout, not final website text or a new curriculum. Lab-assessment copy shown in the concept is illustrative and does not assign a route to any course; render requirements from the approved course policy. Use the exact approved logo asset and copied instructional diagrams. Extend its component system to the following required screens without introducing a new visual direction:

| Screen | Required behavior |
|---|---|
| Landing and course catalog | Show the three selected courses; offer registration/sign-in. No upcoming placeholders, invented prices or course claims. |
| Course overview | Description, prerequisites drawn from reviewed content, ordered syllabus, membership/access state and selected samples. Show required course/module labs and the approved final assessment separately, including confirmed location, prerequisites and completion criteria; disclose lab attendance before enrollment and do not advertise unconfirmed arrangements; do not advertise an unassigned route. |
| My learning | Enrolled courses, saved lesson position, learning progress and required lab status. Show reading progress separately from lab completion and final assessment results. |
| Lesson reader | Workbench layout; all ordered content blocks remain available. Diagrams and captions appear once within the reading flow at their authored positions; retain enlarge controls. Read/Practice tabs organize the mobile view without dropping or duplicating lesson content. |
| Assessment status | For courses with an online final quiz, show the final online quiz, result and retake state, with lab scheduling only when the course or a module separately requires it. For lab-assessed courses, display written and practical assessments separately, with scheduling, results and reassessment instructions. |
| Course administration | Admin/Super admin only: draft preview, editing, sample designation, versioned course/module lab requirements and final assessment policy, publication and withdrawal; preserve assessment and learner history. Membership-review Staff receive no course administration rights. |
| Assessor workspace | Assigned course/module labs and final lab assessments, attendance, completion decisions, results and evidence. A final online quiz alone does not require an assessor, but separately required labs may need instructor sign-off. |
| Certificate verification | Minimal public lookup of an issued certificate and its current status; no public membership documents or assessment evidence. |

Keep the original package intact as provenance and produce a versioned import derivative containing only the three selected courses. The documented duplicate IDs in CS Essentials belong to an excluded course and do not block this import. Resolve rendering warnings affecting the three selected courses in that derivative; excluded courses do not require a visual repair pass for this launch. Review older exam variants against the separately copied newer question banks; source passing thresholds are not approved certification policy.

Review each course for explanations, examples, exercises, prerequisites, external references and rights to reused material. Choose and mark sample lessons per course. Do not describe the existing mathematics course as a complete robotics mathematics curriculum or silently rewrite its content. Record fixes and reviewed versions.

## Supabase access and course data

Use course-prefixed tables for catalog/version metadata, modules, lessons, enrollments, progress, entitlements, course/module lab requirements, lab sessions and completion records, final assessment definitions, attempts, results and certificates. Reuse existing auth users and the current approved-membership authority; do not duplicate identity verification or import source learner records and role fallbacks.

Preserve typed lesson JSON as the content format, but store and serve catalog metadata, sample lessons, protected lessons and certification question/answer material separately. The raw transfer package must never become a public downloadable frontend asset. Apply row-level policies and protected operations to both data and media; sanitize copied HTML and SVG in the rendering boundary.

| Member state | Learning access |
|---|---|
| Signed out | Landing page and registration/sign-in |
| Registered and awaiting verification | Course descriptions, syllabuses and selected samples |
| Verified | Enrollment and full content for free courses |
| Verified with valid course entitlement | Full content for the corresponding paid course |
| Suspended or revoked | No full lesson access or new certification; retained history follows the approved retention policy |

Implement exact courses-origin authentication callbacks, safe return paths, sign-out and session-expiry handling. Reuse the same account; do not assume browser sessions automatically transfer between domains. Link to the existing verification flow instead of collecting another set of identity documents. Recheck current verification and entitlement when serving protected content or recording assessment decisions.

Import deterministically as drafts with source provenance, stable identifiers and content versions. Re-running an import must not duplicate courses, enrollments or progress. Store a versioned assessment policy per course: online quiz or lab written test plus practical, with approved passing and retake criteria. Leave the route unassigned until approved; do not default every course to lab assessment. Pin attempts, results and certificates to their course and assessment-policy versions, including the applicable question set or rubric. Later policy edits must not silently rewrite earlier requirements or results; changes affecting existing enrollments require an explicit transition decision. Save progress per member and course, with retry behavior and an honest unsaved state after network failure.

For the initial release, online lessons require an internet connection; this does not exclude in-person learning labs. Cache only the public app shell and static design assets; do not retain protected lessons, answers or another member's progress in shared/offline caches. Payments, hosted code execution, AI tutoring, social features and a new self-service lab-booking system are outside this first implementation.

## Practical labs at course and module level

Some courses and some individual modules may require practical lab work. Configure these learning requirements independently of the final assessment route. For example, a course may have required module labs followed by a final online quiz, without a separate final written exam or final practical project. This is a supported configuration, not an assignment to any of the three courses.

For each required lab, record its course or module, objective, practical brief, prerequisites, required equipment, confirmed location, supervision, completion criteria and authorized reviewer. Track scheduling, attendance and completion separately; attendance alone does not establish a practical pass. Preserve attempts, feedback and any reassessment history. Use manual session coordination initially, without adding a self-service booking system.

Show requirements in the course overview and syllabus, and provide the practical brief and status at the relevant module. Reading a lesson or passing a practice quiz must not mark a required lab complete. Pending mandatory labs keep the affected module/course incomplete and prevent certificate issuance. Do not automatically block reading later modules: any sequential access prerequisite must be explicitly configured and reviewed. Optional labs must not block completion or certification.

Keep course-level and module-level requirements explicit, with versioned criteria and completion records. A module lab does not automatically satisfy a course-level final practical; any shared evidence or equivalence must be explicitly approved. The owner still needs to identify which courses/modules require labs and their specific completion and progression rules. Do not infer these requirements from a course title or impose them on every course.

## Course assessment routes and certificates

The owner has deferred assessment policy decisions, mainly for upcoming courses. The options below remain supported future configurations, not mandatory assignments for the current three courses. No route may be inferred from a title or copied exam file.

| Final assessment route | Required final assessment | Lab attendance |
|---|---|---|
| Online quiz | Pass the approved final online quiz under the course's configured criteria | No lab attendance for the final quiz; separately required course/module labs still apply |
| Lab written test and practical | Pass both the supervised written test and the practical project completed and assessed at Armature | Required for both assessments |

For courses with an online final quiz, approve the final question set, pass criteria, attempt/retake rules and any applicable time limit before enabling certification. Grade submitted answers on the server using protected answer material; never accept a browser-supplied score as proof. A valid passing final-quiz result satisfies the final assessment without instructor review; any separately required course/module labs must also be completed for certification. If no labs are required, no lab records are needed. Source practice quizzes remain formative unless explicitly reviewed and designated as the final assessment. Do not add remote proctoring as an implicit requirement.

For lab-assessed courses, approve the written question set, practical brief, rubric, pass criteria, test duration and reassessment rules. Confirm equipment, supervision and safe lab procedure are available. Written delivery may be paper-based or on a supervised lab computer. Existing source quizzes and final exams are input material for review, not approved assessment policy.

Proposed lab operation: qualified Admin/Super admin accounts are explicitly assigned to assess a course. Membership-review Staff receive no additional rights. Record assessor assignment, attendance, assessment date, course/test/rubric version, marks, practical criteria, decision, evidence reference and correction history. Prohibit assessors from approving their own lab results. Initially, admins record agreed sessions manually; calendar automation and public slot booking are deferred.

Retain attempt and reassessment history for both routes. For the lab route, keep written and practical attempts separate so failure, absence and requested improvements remain visible. Learners can see their own outcomes; only authorized assessors can read protected lab evidence or change lab results. Corrections and assessment-policy changes require audit records.

Issue a certificate only through a protected server operation after the course's approved final assessment has passed, all mandatory course/module labs are complete and membership is currently verified. Deny issuance when no policy is configured. For courses with an online final quiz, do not require final written-test or final-practical records, but check completion records for any mandatory learning labs; for lab-assessed courses, require both approved passes. Repeated requests must not issue duplicates. Include an opaque certificate identifier, the learner's approved display name, course/version, assessment method, issue date and verification URL/QR. Certificate wording and public verification must accurately identify the assessment method and must distinguish final assessment from any completed learning labs and must not claim lab assessment without supporting records. Final certificate names and wording remain for owner approval.

Show issued or revoked status through a limited public lookup; do not expose a searchable directory of learners. Certificate revocation is a separate audited action from changing learning access; later membership changes do not silently erase historical assessment evidence. Approve public certificate fields and assessment-evidence retention before operating certification. Keep existing identity-document deletion rules unchanged. Optional lab evidence photos or video require an approved collection/retention approach and are not necessary by default.

## Delivery stages and acceptance checks

| Stage | Deliverable | Evidence needed to finish |
|---|---|---|
| 0 Selected import package | Filter the preserved transfer into the three approved courses, their referenced diagrams/assets and relevant assessment sources; retain all three reusable authoring guides | Reconcile 55 modules and 377 lesson entries, preserve ordering and source mappings, validate references and hashes, and confirm excluded courses are absent from the import |
| 1 Local Workbench prototype | Course overview, reader and mobile tabs using representative computation, mathematics and embedded firmware lessons; pending/verified access-state previews | Browser review at 360px, 390px, 768px and desktop widths in all three themes; real diagrams, formulas, code, tables and practice blocks; no production data changes |
| 2 Protected course integration | Dedicated course storage, repeatable draft import, identity integration, enrollment, samples and progress | Isolated migration/import checks, direct API access tests, version/progress checks, all three selected course inventories reconciled |
| 3 Free learning pilot | Reviewed foundation courses and complete sign-in-to-learning flow | Synthetic end-to-end tests, selected participant walkthroughs, error handling and support instructions; no certification promise for unready courses |
| 4 Certification pilot | Course-specific final online quizzes or supervised lab written tests plus practicals, with certificate verification | Test issuance/denial/retakes/revocation for each route. Pilot courses without required labs independently; any required learning labs or final lab assessments need confirmed supervision/equipment readiness and an authorized lab pilot |
| 5 Public release | Dedicated course deployment, courses.armatureailabs.com DNS/TLS, auth callbacks, redirects and operational handoff | Current CI/build/security checks; production synthetic smoke tests; rollback and restore procedure; explicit publication authorization |

Test anonymous, pending, rejected, verified, suspended/revoked, free-enrolled and paid-entitled personas through the UI and direct APIs. Check cross-user access, draft-course leakage, sample-to-full-content bypass, stale sessions, answer-key exposure and media authorization. Deny course administration through direct APIs for learners and membership-review Staff. Administrative roles must not bypass assessment requirements for their own certificate.

Certificate tests must accept a passed approved final online quiz for a course without required labs, and deny failed, ungraded or forged client results. Practice-quiz completion alone must not qualify. For lab-assessed courses, require both written and practical passes; deny quiz-only results, a single passed component, unauthorized assessment and assessor self-review. For both routes, deny unverified membership, missing assessment policy and unauthorized policy changes. Verify that incomplete mandatory course/module labs block completion and certification even after a final-quiz pass; optional labs do not block them, reading later modules remains available unless an explicit prerequisite applies, and learners cannot forge lab sign-off. Verify version handling, concurrent duplicate requests, retakes/reassessment, corrected results and public verification after revocation.

Browser acceptance must include long lesson titles, code/table overflow, mathematical notation, inline SVG safety, keyboard navigation, readable focus states, reduced motion, theme persistence and mobile Contents/tabs. Verify diagrams remain between their source-adjacent explanation blocks on desktop and mobile, with no separate diagram tab or duplicate rendering. Check all selected-course diagram keys programmatically and each selected renderer/block family visually, including any previously broken examples used by those courses. Run current upstream unit, database, build and focused browser suites with their intended configurations; the older checkout's 43-test result is not a release check.

Before release, confirm host ownership/configuration, HTTPS, direct lesson URL reloads, robots/indexing for public versus protected routes, secure headers, errors and backup/restore. The app must not log assessment answers or identity documents. Keep a deployment rollback and additive database migration recovery plan. Any transactional notifications need separate delivery verification; do not equate provider acceptance with inbox delivery.

## Initial learning pilot — approved 4 October 2026

All three courses will be free to verified members during the initial pilot. Each course introduction and first teaching lesson are the selected registered-member samples. Future commercial pricing remains undecided. Separate local v5 pilot versions have been prepared from v4, with six reviewed/corrected samples and checked authentication, enrollment and saved progress using synthetic accounts. See the [pilot walkthrough](courses-learner-pilot.md) and latest progress section. The real learner pilot and production publication remain separate steps. Lab/assessment policies stay unassigned.

## Remaining owner decisions

These decisions do not block the local Workbench prototype or draft import, but they gate the relevant later feature.

| Decision | Needed before |
|---|---|
| Select participants after launch | Post-launch learner trial; instructor review and reuse permission confirmed by owner |
| Choose an assessment route when a course is intended to offer assessment/certification | Publishing assessment requirements or enabling certification; deferred for current content review |
| Define course/module labs when ready: location, prerequisites, completion criteria, supervision and progression gates | Publishing or operating lab requirements; does not block current content review or learning-only publication |
| Approve final online quiz, pass criteria, retake rules and any applicable time limit | Online-final-quiz certification activation |
| Name qualified assessors and approve written test, duration, pass criteria, practical brief/rubric and retake policy for lab-assessed courses | Lab assessment activation |
| Confirm lab kits, available sessions and supervision wherever course/module labs or final lab assessments are required | Booking or conducting lab assessments |
| Approve certificate names/wording for each assessment route, public identity fields and assessment-evidence retention | Issuing publicly verifiable certificates |

Paid-course commercial terms and payment integration remain deferred until the owner resumes that work; this plan retains the separate entitlement boundary without activating checkout. Stages 0 and 1 now have checked local deliverables. The authenticated learning increment is implemented and verified locally; audited course administration is also implemented locally. The first content review and approved tracked correction pass are complete in separate local v4 drafts; see the [content review report](courses-content-review.md). Free pilot access and six samples are approved. The subsequent full v5 re-review and authorized correction stage are complete in separate v6 drafts: 972 corrected lesson blocks, 244 changed diagrams, full finding reconciliation and all 377 lessons checked in the reader and isolated database. The next step is an instructor check and small real learner pilot after source-permission and hosting/release readiness are confirmed. Hardware validation, source permissions and learner pacing remain open. See the [full content review](courses-full-content-review.md). Lab and assessment decisions remain deferred. No additional courses or alternative website design direction need to be chosen now.

## Next implementation handoff

- Preserve original sources/guides and versions v1–v5. The final private v6 package is `output/courses-full-review-2026-10-04/package-v6/`, mirrored to the implementation worktree as `output/courses-corrected-v6/`. It includes exact correction provenance and private banks; never serve the raw package as static assets.
- Completed locally: all reviewed content corrections and diagram redraws; 377-lesson reader walkthrough; representative mobile/theme/interaction checks; 563 frontend tests; draft-only import with exact stored-body/private-bank comparison and Admin/Staff/learner boundary checks. Earlier database versions are unchanged. See the latest [progress record](courses-implementation-progress.md).
- Retain free pilot access and two selected samples per course. V6 remains draft/unreviewed in the isolated local database; the v5 authenticated rehearsal stays intact. Assessment routes and course/module lab requirements remain unassigned.
- Arrange an independent instructor check and small participant walkthrough for comprehension, timing and prerequisites. Confirm source permissions before learner distribution. Pin and validate target boards/toolchains before offering runnable hardware tracks; full Beta/BSim validation is also outstanding.
- Configure the production courses origin, identity callbacks, operational monitoring and rollback only in the separate release stage, with current release checks and explicit publication authorization. Final assessments, lab assignments and certificate criteria remain owner decisions and need not block a learning-only pilot.

Current review artifacts: [v6 simulated preview](http://localhost:4193/), authenticated v5 rehearsal at localhost:4191, preserved v4 preview at localhost:4192 and older baseline at localhost:4189. The simulated preview is not evidence of production authentication.

## Full content correction outcome — 4 October 2026

All 55 modules and 377 lessons were reviewed and rechecked after corrections, including question structure and rendered diagrams. Recorded findings are closed with exact evidence; this is not a guarantee of no remaining instructional errors or hardware readiness. See the [full content review](courses-full-content-review.md). Lab/assessment policies remain flexible and unassigned. Production, payments and certificates remain inactive for this course rollout.

## Pilot hosting preparation — owner confirmation, 4 October 2026

The owner confirms instructor review is complete and permission to reuse the selected material is granted. These are now satisfied owner-confirmed gates, not independently issued accreditation. Prepare the courses hosting and existing-membership integration using corrected v6. Run the real learner trial **after the courses are live**, not as a pre-launch prerequisite. Free pilot access, six samples and deferred assessment/lab policies remain unchanged.

Preparation sequence: inspect live Cloudflare/Supabase state; harden the dedicated member build and direct lesson navigation; verify real local Auth/RPC registration handoff, samples, enrollment and saved progress; assemble exact migration/import/callback/domain and rollback instructions; present the checked release candidate for final public activation.


Hosting preparation is complete; see [release readiness](courses-release-readiness.md). The dedicated Pages project exists, the 73-file site artifact is frozen, 573 frontend tests and 55 local v6 Auth/API checks pass, and desktop/mobile/direct-link behavior is verified. Public activation is the next action: four course migrations, private v6 import, exact Auth callback, custom domain, deployment and actual-origin verification. Learner trial follows launch as instructed.


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
