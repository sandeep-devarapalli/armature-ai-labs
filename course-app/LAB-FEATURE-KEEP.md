# Lab checkpoint feature: please keep it when editing or publishing (note for Codex and other sessions)

Since 20 October 2026 the member site includes lab checkpoint submissions for lab-assessed courses (Robot Actuators). A deploy built from older copies of `MemberApp.tsx` and `member-api.ts` removed these screens from production once already (deployment e25e25d7 replaced site-r8). Before building or deploying the courses site, make sure these files are the current versions in this folder and keep the lab code in them:

- `member-api.ts`: the Lab* types and `LAB_EVIDENCE_BUCKET` before `createCourseClient`, and the `labs`, `saveLab`, `reviewerStatus`, `labQueue`, `labSubmission`, `reviewLab`, `recordAssessment`, `uploadLabPhoto`, `labPhotoUrl` calls in `courseApi`.
- `MemberApp.tsx`: the `LabOverview`/`LabReviews` import, `labAccess` state, the block marked "Lab checkpoints … Keep when editing this file", the "Lab reviews" nav button, the `location.labReviews` page branch, `<LabOverview …>` in the assessment section, the `lab={…}` prop on `<MemberLesson>`, and the lab-route assessment note.
- `MemberLesson.tsx` (`lab` prop and `<LabForm>` in the Practice pane), `course-location.ts` (`labReviews`, `view=labs`), `styles.css` (lab styles at the end).
- New files: `LabForm.tsx`, `LabReviews.tsx`, `lab-checks.ts`.

Database side (already live, do not re-run): `supabase/migrations/202610202001_lab_assessor_role.sql`, `202610202002_course_lab_submissions.sql`. Full record: `scripts/courses/CHANGES-robot-actuators.md` and the `labSubmissionsRelease` entry in `output/courses-release-2026-10-19/release-manifest.json` (main Armature Lab folder).

Quick check after any build: the built `MemberApp-*.js` chunk must contain `get_my_course_labs` and `Lab reviews`.

## Interactive 3D scenes (21 October 2026)

`interactive/scene.mjs` and `interactive/registry.mjs` were rebuilt for the reference courses (lathe with carriage and tailstock turning a shoulder, end mill cutting a slot with chips, dividing head with index plate, crank and sector arms, 60° thread form with form tool, strap clamp on a T-slot table, taper with the compound set over). `registry.mjs` now exports `indexingPlan()` and caps PIC timing at 20 MHz. Claude owns the PIC Microcontrollers, Manual Lathe and Manual Milling courses from 21 October 2026; please build from these files and do not republish those three courses.

## Security header (21 October 2026)

`scripts/courses/release-config.mjs` now adds `Strict-Transport-Security: max-age=31536000; includeSubDomains` to `_headers` (site-r11). Keep it when building or deploying the courses site.

## Switched reluctance motor scenes (25 October 2026)

site-r12 adds three interactive scenes for Robot Actuators Lesson 3.6: `srm-exploded`, `srm-rotation`, `srm-gap`.
The code is in `course-app/interactive/scene.mjs` (SRM geometry, `srmExploded`, `srmRotation`, `srmGap`, RoomEnvironment lighting for `srm-*` only) and `course-app/interactive/registry.mjs` (scene specs, `srmFiring`, measurements), with types in `registry.d.mts` and tests in `tests/frontend/srm-interactive.test.ts`.
The server validator was extended by `supabase/migrations/202610250101_course_srm_interactive_scenes.sql` (applied to production by direct SQL, like the other course migrations). Keep all of these when building or deploying the courses site; Robot Actuators v6 uses the scenes.

## Robot Actuators v9 scenes (27 October 2026)

`course-app/interactive/registry.mjs` (scenes axial-exploded and bldc-rotating-field, bldcSixStep, their measurements cases), `course-app/interactive/scene.mjs` (axialExploded, bldcRotatingField, sector, upright, ring; environment lighting for ids matching srm-, axial- or bldc-) and `course-app/interactive/registry.d.mts` (bldcSixStep type). The database migration `supabase/migrations/202610270101_course_axial_bldc_scenes.sql` is already applied and course v9 uses both scenes. These are LIVE since site-r13 (deployed 28 October 2026, on top of the catalogue redesign). Any future courses deploy must include them, or Lessons 3.3 and 3.8 fall back to static figures. course-app/ is not yet in git: commit it before the next deploy.
