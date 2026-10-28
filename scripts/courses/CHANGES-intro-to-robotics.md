# Changes made to add Introduction to Robotics to the local preview (19 October 2026)

These files are not tracked in git, so the exact edits are recorded here.

1. scripts/courses/prepare-content.mjs
   - Added to `selected`: { id: 'intro-to-robotics', modules: 33, lessons: 190, group: 'introRobotics', bank: 'intro-to-robotics' }
   - inventory.json totals: `courses: 3, modules: 55, lessons: 377` replaced by values computed from `selected` and `inventory`.
2. vite.courses.config.ts
   - `courseIds` now also contains 'intro-to-robotics'.
   - The preview reads diagrams from `process.env.COURSES_PREVIEW_DIAGRAMS`, falling back to the original 'output/courses-private-diagrams.json'.

Not yet changed: scripts/courses/generate-import.mjs still lists only the three original courses (needed later for a database import).

Outputs created (nothing existing was overwritten):
- output/courses-selected-r03-robotics (4 courses, 88 modules, 567 lessons, 294 named diagrams)
- output/courses-private-diagrams-r03-robotics.json

Run the preview with:
COURSES_PREVIEW_PACKAGE=output/courses-selected-r03-robotics COURSES_PREVIEW_DIAGRAMS=output/courses-private-diagrams-r03-robotics.json npm run dev:courses

In course-content: SHA256SUMS line for guidelines/README.md updated (backup in /tmp/SHA256SUMS.before-robotics); assessment-source/intro-to-robotics-final-exam.json added.

## Reader fix: headings left behind when quizzes move to the Practice pane (19 October 2026)

Problem: both readers move quiz and micro_exercise blocks into the side Practice pane. A heading written directly before one (for example "Quiz", used in Introduction to Robotics and Embedded Firmware) stayed in the reading column with nothing under it.

Fix (originals backed up in /tmp/course-app-backup-20261019/):
- course-app/LessonBlocks.tsx: added isPracticeBlock, practiceLead, practiceLabel, scrollToPractice and a PracticeJump link component.
- course-app/App.tsx (local preview) and course-app/MemberLesson.tsx (live member reader): such a heading now renders as "<heading>: answer it in the Practice panel →". Clicking it selects the Practice tab on phones and scrolls the matching block into view. Each practice block is wrapped in a div with id "practice-<block id>".
- course-app/styles.css: .practice-jump link style using var(--link).

Verified in the local preview at desktop and phone widths: no bare heading remains, the link appears, and the quiz comes into view after clicking. TypeScript compiles cleanly. The live member site needs a rebuild and deploy before it shows this fix.

## Reader fix: readable subscripts and superscripts in all courses (19 October 2026)

Problem: lesson text used Unicode subscript and superscript characters (₁ ₄ ² ⁻¹ and so on). In Space Mono these are drawn tiny or from a fallback font, so digits such as 2 and 4 were hard to read. All three original courses use them as well (Robotics about 2,300, Mathematics Foundations about 1,100, Embedded Firmware about 180).

Fix in course-app/LessonBlocks.tsx (backups: /tmp/course-app-backup-20261019/*.before-scripts.*):
- Rich: runs of Unicode subscript/superscript characters in text (never inside tags) become <sub>/<sup> with ordinary characters before sanitising.
- Plain-text headings, definition terms and illustration captions use the same conversion through a ScriptText component.
- Illustration SVGs: the same characters become <tspan baseline-shift="sub|super" font-size="80%">.
- Code blocks are deliberately left unchanged.
course-app/styles.css: sub/sup at 0.8em with line-height 0 so line spacing is unchanged.

Verified: Lesson 32.1 shows 32 readable subscripts with none left over; a Mathematics Foundations superscript renders correctly; the illustration in Lesson 28.5 and its caption render readable subscripts; a full 190-page sweep of Robotics shows all 157 illustrations, all 785 quiz questions and no errors. TypeScript compiles cleanly. Applies to the local preview and the live member reader (after rebuild and deploy).

## Duration and catalog headline (19 October 2026, confirmed by Sandeep)

- course-content/courses/intro-to-robotics/course.json: duration "24h 00m" changed to "60h 00m" (about 30 h reading, 13 h quizzes, 21 h micro-exercises).
- course-app/App.tsx and course-app/MemberApp.tsx: catalog line now reads "Explore computing, mathematics, embedded systems and robotics." (backups: /tmp/course-app-backup-20261019/*.before-headline.tsx).
- New preview package output/courses-selected-r04-robotics with diagrams output/courses-private-diagrams-r04-robotics.json; the preview now runs on r04 (r03 kept unchanged).

## Formula upgrade (19 October 2026, confirmed by Sandeep)

Content change only, no reader code: the 11 stand-alone formulas in Introduction to Robotics are now KaTeX `math` blocks (see the course's build/BUILD-STATUS.md and build/tools/upgrade_formulas.py). Backups: /tmp/content.before-formulas.json, /tmp/lesson-plan.before-formulas.json and /tmp/module-27.json etc.
Preview packages: r05 (first version), r06 (Gaussian exponent made readable). The preview now runs on r06:
COURSES_PREVIEW_PACKAGE=output/courses-selected-r06-robotics COURSES_PREVIEW_DIAGRAMS=output/courses-private-diagrams-r06-robotics.json npm run dev:courses
Full sweep on r06: 190 pages, 157 illustrations, 785 quiz questions, 11 typeset formulas, no errors.

## Production draft import and site-r4 (19 October 2026)

- scripts/courses/generate-import.mjs: added COURSES_IMPORT_ONLY (comma-separated slugs) so a new course can be imported without re-importing the live ones; default behaviour (three original courses) unchanged. Backup: /tmp/course-app-backup-20261019/generate-import.before.mjs.
- Robotics imported to production as draft; site-r4 deployed. Full record: /Users/dev/Downloads/Armature Lab/output/courses-release-2026-10-19/release-manifest.json.
- Note: this shell has NODE_ENV=production set globally; run tests with NODE_ENV=test.
