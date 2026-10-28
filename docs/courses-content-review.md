# Three-course content review

Reviewed 4 October 2026; correction update completed the same day. **Separate corrected v4 drafts now address the numbered findings; see the [implementation progress log](courses-implementation-progress.md#tracked-content-correction-pass--4-october-2026).** The sections below preserve the original review evidence and baseline counts. This first editorial/technical review records 58 findings across the three courses, with exact lesson/block/question references, evidence and proposed corrections. The original findings are not an exhaustive subject-expert sign-off; current correction statuses and remaining work are recorded in the progress log.

## Review results

| Course | Structural coverage | Findings | Main corrections |
|---|---|---:|---|
| Computation Structures: From Gates to Processors | 20 modules, 208 lessons, 3,006 blocks, 931 practice questions, 189 SVGs | 11 | Truncated quiz text, incorrect logic-voltage answer, incomplete prefix-code exercise, misleading GPU examples, truncated or inadequate diagram labels. |
| Mathematics Foundations for AI | 16 modules, 83 lessons, 1,334 blocks, 335 practice questions, 70 named diagrams | 26 | Truncated questions and malformed options, incorrect worked answers, misleading calculus/statistics claims and one NumPy-incompatible example. |
| Embedded Firmware Fundamentals | 19 modules, 86 lessons, 1,721 blocks, 335 practice questions, 67 named diagrams | 21 | Motor/encoder/PID and fault-handler examples, PWM formula, device-specific instructions, diagram/caption mismatches and missing learner-facing source acknowledgement. |

Together: **55 modules, 377 lessons, 6,061 blocks, 1,601 formative questions and 326 diagrams**. Source structure/order and diagram references were scanned throughout. Semantic review was targeted: the mathematics review read every practice stem/key/explanation; computation used a broad formative scan and focused checks; embedded reviewed all 69 code examples and targeted lesson/quiz material. Each course report specifies coverage limits. This is not a claim that all explanations, distractors, code or diagrams are correct.

Detailed reports:

- [Computation findings and evidence](</Users/dev/Downloads/Armature Lab/output/courses-content-review-2026-10-04/computation-review.md>)
- [Mathematics findings and evidence](</Users/dev/Downloads/Armature Lab/output/courses-content-review-2026-10-04/mathematics-review.md>)
- [Embedded Firmware findings and evidence](</Users/dev/Downloads/Armature Lab/output/courses-content-review-2026-10-04/embedded-review.md>)
- [Combined machine-readable correction index](</Users/dev/Downloads/Armature Lab/output/courses-content-review-2026-10-04/review-index.json>)

## Correct these first

1. **Restore broken questions/options.** Computation CS-01 and Mathematics MATH-01/02 contain missing source text, not a browser display problem. Recover from pre-conversion originals where possible; record any reconstructed wording explicitly. Keep stable IDs and do not guess missing distractors silently.
2. **Correct wrong worked examples and keys.** Examples include the mathematics linear system (solution [-0.2, 2.8], not [1, 2]), the logic-low voltage maximum/minimum answer and the unsatisfiable prefix-code exercise. Check explanations, quizzes and diagrams together.
3. **Correct embedded control/debug examples before treating them as executable.** The line-follower steering sign, accumulating “P-only” controller, encoder rollover and HardFault frame capture need repair. Motor-driver instructions need device-specific electrical context. No firmware was compiled or tested on hardware during this review; the imported snippets are conceptual.
4. **Review source diagrams for instructional quality.** Inline placement works, but some source SVG labels are cut off, and some drawings do not show the mechanism promised in the caption. Four computation examples and two embedded examples have confirmed defects. The 81 computation SVGs flagged by a text-length heuristic are review candidates, not 81 confirmed errors. Seven computation lessons and one maths lesson have no illustration; decide whether each needs a new figure rather than adding visuals solely to meet a quota.
5. **Check learner-facing credits and prerequisites.** Preserve the authoring guides and source evidence. Add appropriate references in a reviewed derivative; determine applicable reuse terms separately. Keep imported durations as unvalidated estimates pending learner timing. Embedded examples assume C/pointers and toolchain knowledge despite beginner positioning.

The embedded course also places worked response hints inside 64 long exercise placeholder fields. The current reader displays placeholders before an attempt. Review whether these should become an explicit “Show hint/example” action; these are formative exercises, not private final answers. This is an additional presentation item, outside the 58 numbered findings.

## Assessment and lab policies are deferred

The owner will define these later, mainly for upcoming courses. All three courses remain **unassigned** for assessment and lab policy. No lab attendance requirement, exam type, pass mark, retake limit, free/paid designation or certificate route was invented.

Learning-content review and future learning publication can proceed independently of deferred assessment/lab decisions. The local publication gate now requires reviewed content and assigned learning access, while allowing assessment/lab policy to remain “To be confirmed later.” Deferred does not mean “none.” A deferred lab policy cannot hide configured lab requirements. Learners see the pending policy and are not promised assessment or certification. Future policy changes require a reviewed version and retain earlier learner history.

Imported final banks remain private reference material, not approved assessments. Their answer distributions and correctness also need work before any future assessment release: the embedded bank has all 35 correct answers at position B, and the computation legacy exam includes topics not found in the copied lessons. No assessment activation is part of this review.

## Proposed samples for later approval

After corrections and rendered review, start with each course's introduction and first explanatory lesson. These introduce the subject without assigning labs or certification. They are recommendations only; **no sample flags were changed**.

| Course | Proposed introductory sample | Proposed teaching sample |
|---|---|---|
| Computation Structures | Introduction — Welcome to Computation Structures | Lesson 1.1 — What Are Computation Structures? |
| Mathematics Foundations for AI | Introduction — Mathematical Thinking for AI | Lesson 1.1 — Sets, Subsets & Set Operations |
| Embedded Firmware | Introduction — Welcome to Embedded Systems | Lesson 1.1 — What Are Embedded Systems? |

## What changed and what was checked

- Changed the local administration/learner policy wording and publication gate to support the owner's deferral. Existing role, review, access, audit and version controls remain enforced.
- 562 frontend tests in 55 files pass; application/course type checks and configured member build pass. Existing unrelated React test warnings and bundle-size advisory remain.
- 187 database assertions pass in each isolated local database, including 14 new deferred-policy checks. All 72 real local Auth/HTTP checks pass.
- Browser checked the unchanged authored draft showing both policies as “To be confirmed later,” with publication still unavailable because content/access decisions remain incomplete.
- All 580 preserved source files match their checksum manifest; all three authoring guides still match the Desktop Learning Platform originals byte for byte.
- The course source text, diagrams, original guides, lesson order, authored database content and sample flags were not changed. The three authored courses remain unpublished, unreviewed drafts. No remote database, real account, payment or certificate changes occurred.

## Correction handoff

The approved tracked correction pass is complete in separate local v4 drafts. Original review files remain immutable evidence; see the [progress log](courses-implementation-progress.md#tracked-content-correction-pass--4-october-2026) for corrections, checks and outstanding limitations. Exercise hints now require explicit reveal; the Embedded private-bank answer positions are balanced while retaining IDs/keys, without activating an assessment.

Next: approve reviewed drafts, sample lessons and learning access, then run a controlled learner pilot. Lab/assessment decisions remain deferred. Hardware validation, reuse permissions, broader pedagogical review and production publication remain open.
