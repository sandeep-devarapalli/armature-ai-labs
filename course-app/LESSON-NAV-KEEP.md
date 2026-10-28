# Keep: lesson navigation in the reading column, and the scroll cue

Live since 25 October 2026 (courses deployment c3163421, site-r10), at the owner's request.

- `MemberLesson.tsx` takes a `navigation` prop and renders it after `.reading-status`, inside `article.lesson`.
  `MemberApp.tsx` builds the Previous/Next row once and passes it in; it renders outside only while no lesson
  is shown (loading or unavailable). Next is `.primary.next-lesson` with the next lesson's title in `.next-title`.
  The local Workbench (`App.tsx`) matches: the row comes after `.reading-status`.
- `styles.css`: `.lesson-navigation` rules (stacked, Next on top, below 560 px) and the scroll-cue rule on
  `.code pre, .table-scroll, .formula` (shade on the side with more content; works where scrollbars are hidden).
- Test: `tests/frontend/courses-member.test.tsx`, "places lesson navigation inside the reading column".

If you build from older copies of these files, re-apply these changes rather than deploying without them
(see LAB-FEATURE-KEEP.md for the same reason). Release folder: output/courses-release-2026-10-25-lesson-nav.
