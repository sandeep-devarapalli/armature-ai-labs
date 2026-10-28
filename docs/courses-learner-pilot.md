# Initial learning pilot

Owner decision, 4 October 2026: all three courses are free to verified members during the initial pilot. This is not permanent pricing. Registered, unverified members can read the course description, syllabus and two selected samples. Lab and final-assessment requirements remain deferred. No assessment or certificate is offered in this pilot.

## Scope and current environment

Use the authenticated local course app at `http://localhost:4191/`. The separate `http://localhost:4192/` app is a simulated-access content preview and does not demonstrate authentication or persistent server progress. Neither address is available to remote participants. The local rehearsal uses synthetic accounts only; do not send these credentials to participants or reuse them in production.

The pilot uses separate versions cloned from corrected v4. Its sample corrections, access and sample flags are audited separately. Original exports, original authoring guides, earlier versions and learner history stay intact. Do not rerun draft imports over managed pilot versions.

## Approved samples

| Course | Sample 1 | Sample 2 |
|---|---|---|
| Computation Structures: From Gates to Processors | Introduction — Welcome to Computation Structures | Lesson 1.1 — What Are Computation Structures? |
| Mathematics Foundations for AI | Introduction — Mathematical Thinking for AI | Lesson 1.1 — Sets, Subsets & Set Operations |
| Embedded Firmware Fundamentals: From Microcontrollers to Real-Time Systems | Introduction — Welcome to Embedded Systems | Lesson 1.1 — What Are Embedded Systems? |

## Rehearsal acceptance

- Registered, unverified account: catalog and syllabuses visible; precisely these two samples per course readable; full lessons, enrollment and saved completion denied by the server.
- Verified account: enroll without a payment or coworking membership, read protected lessons, use inline diagrams and formative practice, save a reading mark, sign out, sign back in and resume the same lesson with progress retained.
- Other account: cannot see another learner's enrollment/progress. Staff cannot administer courses. Draft versions and final assessment material stay inaccessible through learner APIs.
- Desktop and mobile: no page overflow; inline diagrams fit and enlarge; Contents, Read/Practice and light/dark/sepia remain usable. Pending assessment/lab status is visible before enrollment.
- No action in this rehearsal assigns a lab, passes an assessment, issues a certificate or changes production data.

## Participant walkthrough after release readiness

Participant selection, scheduling and invitations are still open. Do not contact anyone automatically. Once an approved pilot origin is configured and released, participants use their own Armature accounts and existing free identity verification.

Ask each participant to read both samples of one chosen course, explain the main concept in their own words, and identify unclear terminology. A verified participant then enrolls and reads the next lesson, tries a formative question, inspects an inline diagram and returns after signing out. On mobile, repeat opening Contents, Read/Practice and diagram enlargement. Do not ask participants to wire hardware or conduct physical exercises as part of this reading/usability pilot.

Record observations without government ID material, passwords, tokens or unnecessary personal data:

| Observation | Record |
|---|---|
| Reproduction | Course/version, lesson title and block ID where available; browser/device and action |
| Learning clarity | Confusing term, explanation or prerequisite; participant's explanation of the concept |
| Timing | Observed time for the exact lesson, including interruptions; do not extrapolate one participant to a final course duration |
| Defect | Expected versus observed result; reproducible screenshot with private details removed |
| Outcome | Severity, owner, correction version, retest result and unresolved questions |

Stop that exercise and record a defect for incorrect feedback, lost progress, unreadable diagrams or exposed protected content. Preserve saved history when issuing corrections through new versions. A small pilot is evidence for usability and scoped clarity, not exhaustive instructional accuracy or hardware validation.

## Before a real learner pilot

Confirm reused-content permissions, complete remaining bounded instructional checks, confirm participants and support ownership, and choose/authorize the deployment environment. Then verify production identity integration, email-link callbacks, course-origin configuration, access controls, protected assets and rollback. The current local database is an isolated test harness, not Armature's live membership database. Payment integration remains on hold. Future lab/assessment policies can be supplied independently and must use reviewed versions.

See [implementation progress](courses-implementation-progress.md) for results and saved evidence. Scripts `scripts/courses/prepare-local-pilot.mjs` and `scripts/courses/check-local-pilot.mjs` are hard-limited to the existing loopback test backend; they are not production release scripts. Preparation/publish actions must not be automatically retried after an unknown mutation outcome; inspect the manifest and audit first.


## Owner update — 4 October 2026

Instructor review is complete and the owner confirms reuse permission. The course pilot is now **live at https://courses.armatureailabs.com/**; participant trials can now start as the owner requested. Use corrected v6, approved free access/six samples and the [release procedure](courses-release-readiness.md). Earlier v5/draft statements above are historical rehearsal evidence. All three approved v6 courses are published on the existing Armature Supabase project. Live HTTP/browser and rollback-only production access checks passed; actual email delivery and a learner’s complete sign-in/enrollment/resume journey remain the first participant checks. Keep assessment/lab policies deferred.
