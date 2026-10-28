# Changes made to add Robot Actuators (20 October 2026)

These files are not tracked in git, so the exact edits are recorded here. Backups: /tmp/course-app-backup-20261020/*.before-actuators.*

1. scripts/courses/prepare-content.mjs: added to `selected`: { id: 'robot-actuators', modules: 14, lessons: 75, group: 'robotActuators', bank: 'robot-actuators' } (75 = 61 lessons + 14 module introductions, the same convention as Introduction to Robotics).
2. vite.courses.config.ts: `courseIds` now also contains 'robot-actuators'.
3. scripts/courses/generate-import.mjs: `allCourses` now also contains 'robot-actuators'; use COURSES_IMPORT_ONLY=robot-actuators so the live courses are never re-imported.

In course-content: courses/robot-actuators/{course.json, content.json, lesson-plan.json, diagram-index.json, README.md}; assessment-source/robot-actuators-final-exam.json (40 questions); diagrams/src/app/components/illustrations/robotActuators/ (61 components, 14 module files, index, specs). SHA256SUMS unchanged (new files are not part of the 2 October transfer manifest).

Outputs (nothing existing overwritten): output/courses-selected-r07-actuators (5 courses), output/courses-private-diagrams-r07-actuators.json (355 diagrams).

Preview: COURSES_PREVIEW_PACKAGE=output/courses-selected-r07-actuators COURSES_PREVIEW_DIAGRAMS=output/courses-private-diagrams-r07-actuators.json npx vite --config vite.courses.config.ts --port 4189
Checks on r07: API (catalog 5 courses, robot-actuators 14/75, sample filtering 1 entry, finalExam withheld, private route 404, 61 illustrations with SVG); browser sweep 75 entries in order, 61 illustration SVGs, no NaN/undefined, 0 page or console errors (/private/tmp/rac-shots/sweep.mjs). Note: scripts/courses/check-preview.mjs still asserts the original three courses and is stale for both new courses.

## Lab checkpoint submissions (20 October 2026)
course-app: new LabForm.tsx, LabReviews.tsx, lab-checks.ts; edited member-api.ts (lab types and calls, storage upload and signed URLs), MemberLesson.tsx (lab prop, form in Practice panel), MemberApp.tsx (reviewer status, Lab reviews nav and page, lab module detection, LabOverview, lab-route assessment note), course-location.ts (view=labs), styles.css (lab styles appended). Backups: /tmp/course-app-backup-20261020/*.before-labs.*
Migrations: supabase/migrations/202610202001_lab_assessor_role.sql, 202610202002_course_lab_submissions.sql. Local harness: migrations, test users and a lab-route test course were added to courses_member_http_check_20261004 (disposable); clone courses_labs_check_20261020 holds the SQL test state.
