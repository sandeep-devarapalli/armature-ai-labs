# Full three-course content review — 4 October 2026

## Current status: v6 corrections completed locally

The authorized correction stage is complete in a separate v6 draft: **972 lesson blocks and 244 diagrams corrected**, preserving all 55 modules and 377 lessons. All recorded review findings have closure evidence; private banks remain protected and unapproved as final assessments. Every lesson passed the final desktop reader walkthrough, the 563-test frontend suite passed, and all imported lesson bodies match the final package. Representative desktop/mobile checks cover inline diagrams and all three themes.

See the [v6 progress and verification record](courses-implementation-progress.md#full-review-correction-draft-v6--completed-locally-4-october-2026) and [local simulated preview](http://localhost:4193/). Free pilot access and six samples are retained; assessment/lab requirements remain unassigned. Independent instructor/learner checks, source permissions, target hardware and full BSim validation remain separate limits. No production publication occurred.

## Preserved v5 review findings

The following records the pre-correction v5 review and its original proposed work. Its pending-correction statements describe v5; the completed v6 outcome above supersedes them for the new draft.

**The full reading pass is complete. The current content is not yet cleared for a real learner pilot across all modules.** This review found substantive errors beyond the earlier sample checks and tracked correction pass. The course reader and access controls can work correctly while the learning material still needs correction.

Reviewed the exact **v5 local pilot snapshot**, including its six corrected sample lessons. Original exports, earlier versions, the running pilot and production were not changed. Lab and assessment policies remain flexible and unassigned.

| Course | Modules | Lessons | Blocks | Practice questions | Diagrams | Code blocks |
|---|---:|---:|---:|---:|---:|---:|
| Mathematics Foundations for AI | 16 | 83 | 1,335 | 335 | 71 | 86 |
| Computation Structures: From Gates to Processors | 20 | 208 | 3,007 | 931 | 189 | 13 |
| Embedded Firmware Fundamentals | 19 | 86 | 1,722 | 335 | 67 | 69 |
| **Total** | **55** | **377** | **6,064** | **1,601** | **327** | **168** |

Every lesson's text, tables, formulas, code, exercises, question stems, options, marked answers, explanations and diagram captions was read. All 327 rendered diagrams were inspected. The private assessment material was also reviewed: 95 current-bank questions, 15 different legacy Computation questions, and the duplicate legacy copies for Mathematics and Embedded Firmware. This reviews their content; it does not approve them as Armature assessments.

## What needs correction

- **Mathematics:** definitions and conditions in Taylor approximation, optimization, statistics and complex numbers; inconsistent worked exercises; and figures with incorrect regions, reversed number-set nesting or missing promised graphs. Successful Python execution did not resolve these teaching errors.
- **Computation:** incorrect Boolean reductions, voltage-threshold reasoning, ambiguous or incorrectly keyed quiz items, incomplete exercises, and inconsistent pipeline, memory/coherence and GPU explanations. Several earlier fixes corrected one block while contradictory wording remained elsewhere.
- **Embedded Firmware:** timer/PWM arithmetic, interrupt handoff races, invalid C identifiers, build dependencies, sensor compensation, security claims and target-dependent control examples. The capstone mixes hardware/toolchain assumptions and is not a complete validated board project.
- **Diagrams across the courses:** many current figures do not show the mechanism described by the caption. Some use generic text boxes or unrelated reused diagrams; others have wrong geometry, missing transitions, misleading timing or clipped labels. A caption edit alone cannot repair every case.

Prepared **450 exact content-block replacement proposals**: 82 for Mathematics, 247 for Computation Structures and 121 for Embedded Firmware. Separate private-question proposals and open findings are preserved in the private review folder. They are **proposals, not applied corrections or a complete closure package**. Larger diagram redraws, cross-lesson consistency work and hardware-dependent examples remain open. Do not bulk-apply the proposed subset and label the courses fully corrected.

## Verification and limits

- All 86 Mathematics Python snippets executed; corrected snippets and selected numerical counterexamples were also checked.
- All 69 Embedded code blocks received static review. Eight bounded host checks covered named pure C helpers, numeric behavior, syntax and Make dependency handling. No board was flashed, motor operated or hardware integration certified.
- Computation reference-model, arithmetic and encoding checks support specific findings. The full Beta/BSim programs and GPU performance claims were not validated on target hardware.
- All 88 Python snippets parse; all 27 dedicated math blocks pass strict KaTeX rendering. These are mechanical checks, not accuracy guarantees.
- The coverage reconciliation checks every lesson and exact proposed replacement against the frozen snapshot. The proposal rehearsal checks IDs/types, rendered quiz fields, one marked key, SVG parsing, sanitizer label retention and marker references. It does not validate every semantic answer or complete missing illustrations.
- Open-ended student exercises were reviewed for clarity and solvability, not performed as student submissions. Market statistics and every broad industry claim were not independently established. Source permissions and learner pacing still need their own evidence.

## Next correction sequence

1. Prepare a separate new draft from v5. Apply reviewed factual, numerical, code and quiz corrections, then check adjacent explanations and repeated claims for consistency.
2. Replace misleading or incomplete diagrams with the actual graphs, circuits, state transitions, timelines and worked constructions. Keep every diagram inline in its lesson. Render-check each replacement.
3. Clearly distinguish conceptual firmware fragments from runnable projects. Pin board/SDK assumptions for any runnable exercises and validate those projects separately; this does not assign lab attendance or certification requirements.
4. Reconcile every finding as corrected, deferred with a reason, or requiring an owner decision. Recheck changed lessons in the Workbench on desktop and mobile, then conduct a small comprehension/pacing pilot.

Free access for verified pilot members and the six registered-member samples remain approved. No payment, final assessment, certificate or production publication was activated by this review.

## Review evidence

The private audit folder is [courses-full-review-2026-10-04](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/>). It must not be copied into public/static website assets.

- [Module-by-module coverage](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/module-coverage.csv>) and [coverage/proposal reconciliation](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/review-reconciliation.json>).
- [Mathematics report](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/maths-review.md>).
- Computation reports: [modules 1–10](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/computation-review.md>), [modules 11–16 and private banks](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/computation-late-review.md>), [modules 17–20](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/computation-tail-review.md>) and [all diagram findings](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/computation-visual-review.json>).
- [Embedded Firmware report](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/embedded-review.md>).
- [Proposal structure checks](</Users/dev/Downloads/Armature Lab/output/courses-full-review-2026-10-04/proposal-structure-checks.json>). Course-specific execution, private-bank, code and diagram ledgers accompany each report.
